"""
prepare_maskrcnn_dataset.py - Mask R-CNN Instance Dataset Preparation
Converts semantic building masks into instance annotations with:
- Bounding boxes [x1, y1, x2, y2]
- Simplified instance polygon contours for dynamic mask rasterization
- Spatial tile-aware split (Train: Tiles 1-5, Val: Tiles 6-7, Test: Tile 8)
- Reusable PyTorch BuildingInstanceDataset for training and evaluation
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import cv2
import numpy as np
import torch
from torch.utils.data import Dataset

PROJECT_ROOT = Path(__file__).resolve().parent
DATASET_DIR_NAME = "Semantic segmentation dataset"
BUILDING_COLOR = (60, 16, 152)
MASKRCNN_DATASET_DIR = PROJECT_ROOT / "maskrcnn_dataset"


def find_dataset_root(start: Path | None = None) -> Path:
    if start is None:
        start = PROJECT_ROOT
    candidates = [start, *start.parents]
    for base in candidates:
        cand = base / DATASET_DIR_NAME
        if cand.exists() and (cand / "classes.json").exists():
            return cand
    for base in candidates:
        for match in base.rglob(DATASET_DIR_NAME):
            if match.is_dir() and (match / "classes.json").exists():
                return match
    raise FileNotFoundError(f"Could not locate '{DATASET_DIR_NAME}' under {start}")


def extract_instance_polygons(mask_rgb: np.ndarray, min_area: int = 20) -> List[Dict]:
    diff = np.abs(mask_rgb.astype(np.int32) - np.array(BUILDING_COLOR, dtype=np.int32))
    bldg_binary = (np.sum(diff, axis=-1) == 0).astype(np.uint8) * 255

    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(bldg_binary, connectivity=8)
    instances = []
    h, w = bldg_binary.shape[:2]

    for lbl in range(1, num_labels):
        area = int(stats[lbl, cv2.CC_STAT_AREA])
        if area < min_area:
            continue

        comp_mask = (labels == lbl).astype(np.uint8) * 255
        cnts, _ = cv2.findContours(comp_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not cnts:
            continue

        for cnt in cnts:
            c_area = cv2.contourArea(cnt)
            if c_area < min_area:
                continue

            # Bounding box
            x, y, bw, bh = cv2.boundingRect(cnt)
            x1 = max(0, x)
            y1 = max(0, y)
            x2 = min(w - 1, x + bw)
            y2 = min(h - 1, y + bh)
            if x2 <= x1 or y2 <= y1:
                continue

            # Simplified polygon contour
            eps = 0.005 * cv2.arcLength(cnt, True)
            approx = cv2.approxPolyDP(cnt, eps, True)
            poly_pts = approx.squeeze().tolist()
            if len(poly_pts) < 3:
                continue

            instances.append({
                "bbox": [x1, y1, x2, y2],
                "area": float(c_area),
                "polygon": poly_pts,
            })

    return instances


def prepare_dataset():
    root = find_dataset_root()
    print(f"Building Mask R-CNN dataset from: {root}", flush=True)

    splits = {
        "train": [f"Tile {i}" for i in range(1, 6)],
        "val": [f"Tile {i}" for i in range(6, 8)],
        "test": ["Tile 8"],
    }

    images_base = MASKRCNN_DATASET_DIR / "images"
    annos_base = MASKRCNN_DATASET_DIR / "annotations"
    images_base.mkdir(parents=True, exist_ok=True)
    annos_base.mkdir(parents=True, exist_ok=True)

    split_summary = {}

    for split_name, tile_names in splits.items():
        print(f"\nProcessing '{split_name}' split ({len(tile_names)} tiles)...", flush=True)
        split_img_dir = images_base / split_name
        split_img_dir.mkdir(parents=True, exist_ok=True)

        records = []
        total_instances = 0
        img_id = 0

        for t_name in tile_names:
            tile_dir = root / t_name
            t_img_dir = tile_dir / "images"
            t_msk_dir = tile_dir / "masks"
            if not t_img_dir.exists() or not t_msk_dir.exists():
                continue

            img_files = sorted([p for p in t_img_dir.iterdir() if p.suffix.lower() in {".jpg", ".jpeg", ".png"}])

            for img_p in img_files:
                img_id += 1
                dst_img_p = split_img_dir / img_p.name
                shutil.copy2(img_p, dst_img_p)

                msk_p = t_msk_dir / f"{img_p.stem}.png"
                if not msk_p.exists():
                    candidates = list(t_msk_dir.glob(f"{img_p.stem}.*"))
                    if candidates:
                        msk_p = candidates[0]
                    else:
                        continue

                msk_bgr = cv2.imread(str(msk_p))
                h, w = msk_bgr.shape[:2]
                msk_rgb = cv2.cvtColor(msk_bgr, cv2.COLOR_BGR2RGB)

                instances = extract_instance_polygons(msk_rgb, min_area=20)
                total_instances += len(instances)

                records.append({
                    "id": img_id,
                    "file_name": img_p.name,
                    "width": w,
                    "height": h,
                    "tile": t_name,
                    "instances": instances,
                })

        anno_file = annos_base / f"{split_name}.json"
        with anno_file.open("w", encoding="utf-8") as f:
            json.dump({
                "split": split_name,
                "tiles": tile_names,
                "total_images": len(records),
                "total_instances": total_instances,
                "images": records,
            }, f, indent=2)

        split_summary[split_name] = {
            "tiles": tile_names,
            "images": len(records),
            "instances": total_instances,
            "anno_path": str(anno_file),
        }
        print(f"  {split_name.upper()}: {len(records)} images, {total_instances} instances -> {anno_file.name}", flush=True)

    print("\n" + "=" * 60, flush=True)
    print("MASK R-CNN DATASET PREPARATION COMPLETE", flush=True)
    for k, v in split_summary.items():
        print(f"  {k:<6}: {v['images']:<2} images | {v['instances']:<4} building instances", flush=True)
    print("=" * 60, flush=True)


class BuildingInstanceDataset(Dataset):
    """
    PyTorch Dataset for Mask R-CNN.
    Loads images and rasterizes instance polygons into individual binary masks.
    """

    def __init__(self, split: str = "train", img_size: int = 384, augment: bool = False,
                 dataset_dir: Optional[Path] = None):
        self.base_dir = dataset_dir or MASKRCNN_DATASET_DIR
        self.split = split
        self.img_size = img_size
        self.augment = augment

        anno_path = self.base_dir / "annotations" / f"{split}.json"
        if not anno_path.exists():
            raise FileNotFoundError(f"Annotations not found at {anno_path}. Run prepare_maskrcnn_dataset.py first.")

        with anno_path.open("r", encoding="utf-8") as f:
            data = json.load(f)

        self.records = data["images"]
        self.img_dir = self.base_dir / "images" / split

    def __len__(self) -> int:
        return len(self.records)

    def __getitem__(self, idx: int) -> Tuple[torch.Tensor, Dict[str, torch.Tensor]]:
        rec = self.records[idx]
        img_p = self.img_dir / rec["file_name"]

        img_bgr = cv2.imread(str(img_p))
        if img_bgr is None:
            raise FileNotFoundError(f"Failed to read image: {img_p}")
        orig_h, orig_w = img_bgr.shape[:2]
        img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)

        # Resize image to target resolution
        img_resized = cv2.resize(img_rgb, (self.img_size, self.img_size), interpolation=cv2.INTER_LINEAR)
        sx = self.img_size / orig_w
        sy = self.img_size / orig_h

        # Normalize image to [0, 1] tensor
        img_tensor = torch.from_numpy(img_resized.transpose(2, 0, 1)).float() / 255.0

        instances = rec.get("instances", [])
        boxes = []
        masks = []
        labels = []
        areas = []

        for inst in instances:
            x1, y1, x2, y2 = inst["bbox"]
            rx1 = max(0.0, float(x1) * sx)
            ry1 = max(0.0, float(y1) * sy)
            rx2 = min(float(self.img_size - 1), float(x2) * sx)
            ry2 = min(float(self.img_size - 1), float(y2) * sy)

            if rx2 <= rx1 + 1.0 or ry2 <= ry1 + 1.0:
                continue

            # Rasterize polygon into instance mask
            poly = inst.get("polygon", [])
            if len(poly) >= 3:
                m = np.zeros((self.img_size, self.img_size), dtype=np.uint8)
                scaled_pts = np.array([[float(pt[0]) * sx, float(pt[1]) * sy] for pt in poly], dtype=np.int32)
                cv2.fillPoly(m, [scaled_pts], 1)
                mask_tensor = torch.from_numpy(m)
            else:
                m = np.zeros((self.img_size, self.img_size), dtype=np.uint8)
                cv2.rectangle(m, (int(rx1), int(ry1)), (int(rx2), int(ry2)), 1, -1)
                mask_tensor = torch.from_numpy(m)

            boxes.append([rx1, ry1, rx2, ry2])
            masks.append(mask_tensor)
            labels.append(1)  # 1 = building
            areas.append((rx2 - rx1) * (ry2 - ry1))

        if len(boxes) > 0:
            target = {
                "boxes": torch.tensor(boxes, dtype=torch.float32),
                "labels": torch.tensor(labels, dtype=torch.int64),
                "masks": torch.stack(masks, dim=0).to(dtype=torch.uint8),
                "image_id": torch.tensor([rec["id"]]),
                "area": torch.tensor(areas, dtype=torch.float32),
                "iscrowd": torch.zeros((len(boxes),), dtype=torch.int64),
            }
        else:
            # Handle zero-building images gracefully
            target = {
                "boxes": torch.zeros((0, 4), dtype=torch.float32),
                "labels": torch.zeros((0,), dtype=torch.int64),
                "masks": torch.zeros((0, self.img_size, self.img_size), dtype=torch.uint8),
                "image_id": torch.tensor([rec["id"]]),
                "area": torch.zeros((0,), dtype=torch.float32),
                "iscrowd": torch.zeros((0,), dtype=torch.int64),
            }

        return img_tensor, target


def collate_fn(batch):
    return tuple(zip(*batch))


if __name__ == "__main__":
    prepare_dataset()

from __future__ import annotations

from pathlib import Path
import shutil

import cv2
import numpy as np
from PIL import Image

from dataset_utils import BUILDING_CLASS_ID, BUILDING_COLOR, find_dataset_root, iter_image_mask_pairs

PROJECT_ROOT = Path(__file__).resolve().parent
DATASET_YOLO_ROOT = PROJECT_ROOT / "dataset_yolo"
RAW_LABELS_DIR = DATASET_YOLO_ROOT / "labels" / "raw"
RAW_IMAGES_DIR = DATASET_YOLO_ROOT / "images" / "raw"
MIN_AREA = 64


def build_binary_building_mask(mask_array: np.ndarray) -> np.ndarray:
    binary = np.all(mask_array == np.array(BUILDING_COLOR), axis=2).astype(np.uint8)
    if binary.sum() == 0:
        return binary
    kernel = np.ones((3, 3), np.uint8)
    binary = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel)
    binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel)
    return binary


def convert_binary_mask_to_polygons(binary_mask: np.ndarray, min_area: int = MIN_AREA):
    height, width = binary_mask.shape
    if binary_mask.sum() == 0:
        return []

    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(binary_mask, 8)
    polygons = []

    for idx in range(1, num_labels):
        area = stats[idx, cv2.CC_STAT_AREA]
        if area < min_area:
            continue
        component_mask = (labels == idx).astype(np.uint8)
        contours, _ = cv2.findContours(component_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not contours:
            continue
        contour = max(contours, key=cv2.contourArea)
        if cv2.contourArea(contour) < min_area:
            continue

        epsilon = 0.0025 * cv2.arcLength(contour, True)
        approx = cv2.approxPolyDP(contour, epsilon, True)
        if len(approx) < 3:
            continue

        points = approx.reshape(-1, 2)
        normalized_points = []
        for x, y in points:
            normalized_points.extend([float(x / max(width, 1)), float(y / max(height, 1))])
        polygons.append(normalized_points)

    return polygons


def write_yolo_label(label_path: Path, polygons):
    label_path.parent.mkdir(parents=True, exist_ok=True)
    with label_path.open("w", encoding="utf-8") as handle:
        for polygon in polygons:
            row = [str(BUILDING_CLASS_ID)] + [f"{value:.6f}" for value in polygon]
            handle.write(" ".join(row) + "\n")


def convert_dataset_to_yolo_labels(dataset_root: Path):
    RAW_LABELS_DIR.mkdir(parents=True, exist_ok=True)
    RAW_IMAGES_DIR.mkdir(parents=True, exist_ok=True)

    pairs = iter_image_mask_pairs(dataset_root)
    written = 0
    for image_path, mask_path in pairs:
        # Build a deterministic, globally-unique filename using the tile directory name
        # Do NOT attempt to parse or reconstruct stems from underscores later.
        tile_dir = image_path.parent.parent
        tile_name = tile_dir.name
        unique_image_name = f"{tile_name}__{image_path.name}"

        # Copy the image into the YOLO raw images folder using the unique name
        dst_image = RAW_IMAGES_DIR / unique_image_name
        dst_image.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(image_path, dst_image)

        # Load and verify image/mask dimensions
        img = Image.open(image_path).convert("RGB")
        mask = Image.open(mask_path).convert("RGB")
        img_w, img_h = img.size
        mask_array = np.array(mask)
        if mask_array.shape[0] != img_h or mask_array.shape[1] != img_w:
            raise ValueError(f"Image/mask size mismatch for {image_path} / {mask_path}: image={img.size}, mask={mask_array.shape[1::-1]}")

        # Build binary mask and polygons
        binary_mask = build_binary_building_mask(mask_array)
        polygons = convert_binary_mask_to_polygons(binary_mask, min_area=MIN_AREA)

        # Write label using the SAME unique filename as the image
        label_path = RAW_LABELS_DIR / Path(unique_image_name).with_suffix(".txt")
        write_yolo_label(label_path, polygons)
        written += 1

    return written


if __name__ == "__main__":
    dataset_root = find_dataset_root(PROJECT_ROOT)
    written = convert_dataset_to_yolo_labels(dataset_root)
    print(f"Converted {written} masks to YOLO segmentation labels in {RAW_LABELS_DIR}")

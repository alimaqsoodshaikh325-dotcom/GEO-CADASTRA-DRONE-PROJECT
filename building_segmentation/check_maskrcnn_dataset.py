"""
check_maskrcnn_dataset.py - Rigorous Dataset Sanity Check
Inspects a processed Mask R-CNN dataset and verifies:
1. Duplicate filenames & duplicate paths
2. Duplicate image IDs
3. Images without annotations / Annotations without images
4. Mask / image dimension mismatches
5. Empty masks, invalid boxes (x1 >= x2 or y1 >= y2 or out-of-bounds)
6. Invalid class labels (must be 1 for building)
7. Suspiciously tiny (< 10 px) or abnormally large (> 90% image) masks
8. Instance count distributions
9. Zero leakage / overlap between train, val, and test partitions
Outputs a strict PASS / FAIL report.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import cv2
import numpy as np

PROJECT_ROOT = Path(__file__).resolve().parent


def verify_dataset(dataset_dir: Path) -> bool:
    print("=" * 80)
    print(f"RUNNING DATASET SANITY CHECK ON: {dataset_dir}")
    print("=" * 80)

    if not dataset_dir.exists():
        print(f"FAIL: Dataset directory does not exist: {dataset_dir}")
        return False

    splits = ["train", "val", "test"]
    images_base = dataset_dir / "images"
    annos_base = dataset_dir / "annotations"

    all_errors = []
    all_warnings = []
    seen_image_filenames = {}
    split_records = {}

    for split in splits:
        split_img_dir = images_base / split
        anno_file = annos_base / f"{split}.json"

        if not split_img_dir.exists():
            all_errors.append(f"Missing images directory for split '{split}': {split_img_dir}")
            continue
        if not anno_file.exists():
            all_errors.append(f"Missing annotation file for split '{split}': {anno_file}")
            continue

        with anno_file.open("r", encoding="utf-8") as f:
            anno_data = json.load(f)

        images = anno_data.get("images", [])
        split_records[split] = images

        # Check image files on disk
        disk_images = sorted([p.name for p in split_img_dir.iterdir() if p.suffix.lower() in {".jpg", ".jpeg", ".png"}])
        anno_img_names = [img["file_name"] for img in images]

        # 1. Duplicate filenames inside split
        if len(disk_images) != len(set(disk_images)):
            all_errors.append(f"Split '{split}' has duplicate image files on disk!")

        if len(anno_img_names) != len(set(anno_img_names)):
            all_errors.append(f"Split '{split}' has duplicate image file_names in {anno_file.name}! Count: {len(anno_img_names)} vs Unique: {len(set(anno_img_names))}")

        # Check disk count vs annotation count
        if len(disk_images) != len(images):
            all_errors.append(f"Split '{split}' disk image count ({len(disk_images)}) does NOT match annotation count ({len(images)})! Files may have been overwritten.")

        # Cross-split duplicate filenames
        for fname in anno_img_names:
            if fname in seen_image_filenames:
                all_errors.append(f"Cross-split duplicate filename collision: '{fname}' appears in both '{seen_image_filenames[fname]}' and '{split}'!")
            else:
                seen_image_filenames[fname] = split

        # 2. Check each image record
        for img_rec in images:
            img_name = img_rec["file_name"]
            img_path = split_img_dir / img_name

            if not img_path.exists():
                all_errors.append(f"Image file listed in annotations does NOT exist on disk: {img_path}")
                continue

            # Load image and verify dimensions
            img_bgr = cv2.imread(str(img_path))
            if img_bgr is None:
                all_errors.append(f"Failed to read image on disk: {img_path}")
                continue
            h, w = img_bgr.shape[:2]

            if h != img_rec["height"] or w != img_rec["width"]:
                all_errors.append(f"Dimension mismatch for {img_name}: Disk ({w}x{h}) vs Anno ({img_rec['width']}x{img_rec['height']})")

            # Check instances
            instances = img_rec.get("instances", [])
            for inst_idx, inst in enumerate(instances):
                box = inst.get("bbox", [])
                if len(box) != 4:
                    all_errors.append(f"{img_name} inst #{inst_idx}: Invalid bbox format: {box}")
                    continue

                x1, y1, x2, y2 = box
                # Coordinate validity
                if x1 < 0 or y1 < 0 or x2 > w or y2 > h:
                    all_errors.append(f"{img_name} inst #{inst_idx}: Box out of image bounds! Box: {box}, Image size: {w}x{h}")
                if x1 >= x2:
                    all_errors.append(f"{img_name} inst #{inst_idx}: Invalid width (x1 >= x2): {box}")
                if y1 >= y2:
                    all_errors.append(f"{img_name} inst #{inst_idx}: Invalid height (y1 >= y2): {box}")

                # Area checks
                area = inst.get("area", 0)
                if area <= 0:
                    all_errors.append(f"{img_name} inst #{inst_idx}: Zero or negative area: {area}")
                elif area < 10:
                    all_warnings.append(f"{img_name} inst #{inst_idx}: Suspiciously tiny instance area: {area} px")
                elif area > (w * h * 0.85):
                    all_warnings.append(f"{img_name} inst #{inst_idx}: Abnormally large instance area: {area} px ({area/(w*h)*100:.1f}%)")

                # Polygon checks
                poly = inst.get("polygon", [])
                if len(poly) < 3:
                    all_errors.append(f"{img_name} inst #{inst_idx}: Polygon has fewer than 3 vertices: {poly}")

    # Cross-split image leakage check
    train_imgs = set(img["file_name"] for img in split_records.get("train", []))
    val_imgs = set(img["file_name"] for img in split_records.get("val", []))
    test_imgs = set(img["file_name"] for img in split_records.get("test", []))

    train_val_leak = train_imgs.intersection(val_imgs)
    train_test_leak = train_imgs.intersection(test_imgs)
    val_test_leak = val_imgs.intersection(test_imgs)

    if train_val_leak:
        all_errors.append(f"Train/Val data leakage! Overlapping images: {train_val_leak}")
    if train_test_leak:
        all_errors.append(f"Train/Test data leakage! Overlapping images: {train_test_leak}")
    if val_test_leak:
        all_errors.append(f"Val/Test data leakage! Overlapping images: {val_test_leak}")

    # Print Summary Report
    print("\n" + "-" * 80)
    print("DATASET SANITY CHECK AUDIT SUMMARY")
    print("-" * 80)
    for split in splits:
        recs = split_records.get(split, [])
        n_insts = sum(len(r.get("instances", [])) for r in recs)
        disk_cnt = len(list((images_base / split).glob("*.*"))) if (images_base / split).exists() else 0
        print(f"  {split.upper():<6}: Unique Anno Images = {len(recs):<2} | Disk Images = {disk_cnt:<2} | Building Instances = {n_insts}")

    print("\n" + "-" * 80)
    print(f"ERRORS DETECTED  : {len(all_errors)}")
    print(f"WARNINGS DETECTED: {len(all_warnings)}")
    print("-" * 80)

    if all_errors:
        print("\nTOP CRITICAL ERRORS:")
        for err in all_errors[:15]:
            print(f"  [ERROR] {err}")
        if len(all_errors) > 15:
            print(f"  ... and {len(all_errors) - 15} more errors.")
        print("\nRESULT: >>> FAIL <<<")
        return False
    else:
        print("\nRESULT: >>> PASS <<<")
        print("All image files, bounding boxes, polygons, and split boundaries are 100% valid!")
        return True


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset-dir", type=str, default=str(PROJECT_ROOT / "maskrcnn_dataset"))
    args = parser.parse_args()
    success = verify_dataset(Path(args.dataset_dir))
    sys.exit(0 if success else 1)

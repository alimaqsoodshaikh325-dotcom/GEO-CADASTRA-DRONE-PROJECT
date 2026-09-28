"""
Prepare U-Net++ Dataset Script
Converts multi-class RGB semantic masks to binary building masks (0 = background, 255 = building).
Performs tile-aware train/val/test splitting:
- Train: Tiles 1, 2, 3, 4, 5 (45 images)
- Val: Tiles 6, 7 (18 images)
- Test: Tile 8 (9 images)
Generates visual verification artifacts to confirm binary mask correctness.
"""

from __future__ import annotations

import shutil
from pathlib import Path

import cv2
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from PIL import Image

BUILDING_COLOR = (60, 16, 152)

PROJECT_ROOT = Path(__file__).resolve().parent
UNET_DATASET_DIR = PROJECT_ROOT / "unet_dataset"
VERIFICATION_DIR = PROJECT_ROOT / "unet_validation_results" / "binary_masks_check"


def find_dataset_root(start: Path | None = None) -> Path:
    if start is None:
        start = Path(__file__).resolve().parent
    candidates = [start, *start.parents]
    for base in candidates:
        candidate = base / "Semantic segmentation dataset"
        if candidate.exists() and (candidate / "classes.json").exists():
            return candidate
    for base in candidates:
        for match in base.rglob("Semantic segmentation dataset"):
            if match.is_dir() and (match / "classes.json").exists():
                return match
    raise FileNotFoundError(f"Could not locate 'Semantic segmentation dataset' under {start}")


def prepare_dataset():
    dataset_root = find_dataset_root(PROJECT_ROOT)
    print(f"Dataset source: {dataset_root}")
    print(f"Destination: {UNET_DATASET_DIR}")

    # Define Tile-aware splits
    # Train: Tiles 1, 2, 3, 4, 5 (~62.5% -> 45 images)
    # Val: Tiles 6, 7 (25.0% -> 18 images)
    # Test: Tile 8 (12.5% -> 9 images)
    split_definitions = {
        "train": [f"Tile {i}" for i in range(1, 6)],
        "val": [f"Tile {i}" for i in range(6, 8)],
        "test": ["Tile 8"],
    }

    # Setup directories
    for split in ["train", "val", "test"]:
        (UNET_DATASET_DIR / "images" / split).mkdir(parents=True, exist_ok=True)
        (UNET_DATASET_DIR / "masks" / split).mkdir(parents=True, exist_ok=True)
    VERIFICATION_DIR.mkdir(parents=True, exist_ok=True)

    counts = {"train": 0, "val": 0, "test": 0}
    building_pixel_counts = {"train": 0, "val": 0, "test": 0}
    total_pixel_counts = {"train": 0, "val": 0, "test": 0}
    unique_mask_values = set()

    sample_for_verification = []

    for split_name, tile_list in split_definitions.items():
        print(f"\nProcessing {split_name} split ({len(tile_list)} tiles: {', '.join(tile_list)})...")
        for tile_name in tile_list:
            tile_dir = dataset_root / tile_name
            img_dir = tile_dir / "images"
            msk_dir = tile_dir / "masks"

            if not img_dir.exists() or not msk_dir.exists():
                print(f"  Warning: Missing images or masks directory in {tile_name}")
                continue

            images = sorted([p for p in img_dir.iterdir() if p.suffix.lower() in {".jpg", ".jpeg", ".png"}])
            tile_clean = tile_name.lower().replace(" ", "")

            for img_path in images:
                # Find matching mask
                mask_candidates = [
                    p for p in msk_dir.iterdir()
                    if p.stem == img_path.stem and p.suffix.lower() in {".png", ".bmp", ".tif", ".tiff", ".jpg", ".jpeg"}
                ]
                if not mask_candidates:
                    print(f"  Warning: No mask found for {tile_name}/{img_path.name}")
                    continue
                mask_path = mask_candidates[0]

                # Convert mask to binary
                with Image.open(mask_path) as m_img:
                    mask_rgb = np.array(m_img.convert("RGB"))

                # Building RGB check (60, 16, 152) -> 255, else 0
                binary_mask = (np.all(mask_rgb[:, :, :3] == np.array(BUILDING_COLOR, dtype=np.uint8), axis=2) * 255).astype(np.uint8)

                # Record unique pixel values
                u_vals = np.unique(binary_mask)
                unique_mask_values.update(u_vals.tolist())

                out_stem = f"{tile_clean}_{img_path.stem}"
                dst_img = UNET_DATASET_DIR / "images" / split_name / f"{out_stem}{img_path.suffix.lower()}"
                dst_msk = UNET_DATASET_DIR / "masks" / split_name / f"{out_stem}.png"

                # Copy image and write binary mask PNG
                shutil.copy2(img_path, dst_img)
                cv2.imwrite(str(dst_msk), binary_mask)

                counts[split_name] += 1
                b_pix = int(np.count_nonzero(binary_mask == 255))
                t_pix = int(binary_mask.size)
                building_pixel_counts[split_name] += b_pix
                total_pixel_counts[split_name] += t_pix

                if len(sample_for_verification) < 8 and b_pix > 0:
                    sample_for_verification.append((dst_img, dst_msk, split_name, tile_name, b_pix / t_pix * 100.0))

    # Check mask values are strictly 0 and 255
    print("\n" + "=" * 50)
    print("BINARY MASK INTEGRITY CHECK:")
    print(f"Unique values observed across all generated masks: {sorted(list(unique_mask_values))}")
    if unique_mask_values.issubset({0, 255}):
        print("PASS: All mask pixels are strictly binary (0 or 255).")
    else:
        print(f"FAIL: Unexpected values in mask: {unique_mask_values}")
        raise ValueError("Generated masks contain non-binary pixel values!")

    # Write split report
    split_report_content = f"""Tile-Aware Dataset Split Report for U-Net++
=============================================
Target: ~70% Train, ~20% Val, ~10% Test (at Tile level)

Training Tiles: 5 ({', '.join(split_definitions['train'])})
Training Images: {counts['train']} ({counts['train']/sum(counts.values())*100:.1f}%)
Training Building Pixel Ratio: {building_pixel_counts['train']/total_pixel_counts['train']*100:.2f}%

Validation Tiles: 2 ({', '.join(split_definitions['val'])})
Validation Images: {counts['val']} ({counts['val']/sum(counts.values())*100:.1f}%)
Validation Building Pixel Ratio: {building_pixel_counts['val']/total_pixel_counts['val']*100:.2f}%

Testing Tiles: 1 ({', '.join(split_definitions['test'])})
Testing Images: {counts['test']} ({counts['test']/sum(counts.values())*100:.1f}%)
Testing Building Pixel Ratio: {building_pixel_counts['test']/total_pixel_counts['test']*100:.2f}%

Total Images: {sum(counts.values())}
Mask Format: Single-channel uint8 PNG (0 = background, 255 = building)
"""
    split_report_path = PROJECT_ROOT / "split_report.txt"
    split_report_path.write_text(split_report_content, encoding="utf-8")
    (UNET_DATASET_DIR / "split_report.txt").write_text(split_report_content, encoding="utf-8")
    print(f"\nSaved split report to: {split_report_path}")
    print(split_report_content)

    # Generate visual verification samples
    print("Generating visual verification samples in unet_validation_results/binary_masks_check/...")
    for idx, (img_f, msk_f, s_name, t_name, cov) in enumerate(sample_for_verification, start=1):
        img_arr = cv2.imread(str(img_f))
        img_arr = cv2.cvtColor(img_arr, cv2.COLOR_BGR2RGB)
        msk_arr = cv2.imread(str(msk_f), cv2.IMREAD_GRAYSCALE)

        overlay = img_arr.copy()
        building_pixels = msk_arr == 255
        overlay[building_pixels] = (0.5 * overlay[building_pixels] + 0.5 * np.array([255, 0, 0])).astype(np.uint8)

        # Draw contour boundaries in yellow
        contours, _ = cv2.findContours(msk_arr, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        cv2.drawContours(overlay, contours, -1, (255, 255, 0), 2)

        fig, axs = plt.subplots(1, 3, figsize=(15, 5))
        axs[0].imshow(img_arr)
        axs[0].set_title(f"Image: {img_f.name}")
        axs[0].axis("off")

        axs[1].imshow(msk_arr, cmap="gray")
        axs[1].set_title(f"Binary Mask (0 / 255) [Coverage: {cov:.2f}%]")
        axs[1].axis("off")

        axs[2].imshow(overlay)
        axs[2].set_title("Overlay (Red Mask + Yellow Boundary)")
        axs[2].axis("off")

        fig.suptitle(f"Verification Sample {idx}: {s_name.upper()} split ({t_name})", fontsize=14)
        fig.tight_layout()
        fig.savefig(VERIFICATION_DIR / f"verify_mask_{idx}_{img_f.stem}.png", dpi=120)
        plt.close(fig)

    print(f"Saved {len(sample_for_verification)} verification images to {VERIFICATION_DIR}")
    print("\nDataset preparation complete!")


if __name__ == "__main__":
    prepare_dataset()

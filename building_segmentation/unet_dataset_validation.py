"""
UNet++ Dataset Validation Script
Validates the aerial imagery semantic segmentation dataset for building footprint extraction.
Checks correspondence, dimensions, corruptions, building pixel presence (#3C1098 / RGB: 60,16,152),
and coverage statistics.
"""

from __future__ import annotations

import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from PIL import Image, UnidentifiedImageError

BUILDING_COLOR = (60, 16, 152)
BUILDING_HEX = "#3C1098"

PROJECT_ROOT = Path(__file__).resolve().parent
VALIDATION_DIR = PROJECT_ROOT / "unet_validation_results"


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


def iter_image_mask_pairs(dataset_root: Path) -> list[tuple[Path, Path, str]]:
    pairs: list[tuple[Path, Path, str]] = []
    tiles = sorted(dataset_root.glob("Tile *"), key=lambda p: p.name)
    for tile_dir in tiles:
        image_dir = tile_dir / "images"
        mask_dir = tile_dir / "masks"
        if not image_dir.exists() or not mask_dir.exists():
            continue
        for image_path in sorted(image_dir.iterdir()):
            if not image_path.is_file() or image_path.suffix.lower() not in {".jpg", ".jpeg", ".png", ".tif", ".tiff"}:
                continue
            candidates = [
                p for p in mask_dir.iterdir()
                if p.is_file() and p.stem == image_path.stem and p.suffix.lower() in {".png", ".bmp", ".tif", ".tiff", ".jpg", ".jpeg"}
            ]
            if not candidates:
                pairs.append((image_path, mask_dir / f"{image_path.stem}.png", tile_dir.name))
            else:
                pairs.append((image_path, candidates[0], tile_dir.name))
    return pairs


def compute_building_coverage(mask_np: np.ndarray) -> tuple[int, int, float]:
    total_pixels = mask_np.shape[0] * mask_np.shape[1]
    building_mask = np.all(mask_np[:, :, :3] == np.array(BUILDING_COLOR, dtype=np.uint8), axis=2)
    building_pixels = int(np.count_nonzero(building_mask))
    coverage_pct = (building_pixels / total_pixels) * 100.0 if total_pixels > 0 else 0.0
    return building_pixels, total_pixels, coverage_pct


def validate_dataset() -> dict:
    dataset_root = find_dataset_root(PROJECT_ROOT)
    image_mask_pairs = iter_image_mask_pairs(dataset_root)
    VALIDATION_DIR.mkdir(exist_ok=True, parents=True)

    summary = {
        "dataset_root": str(dataset_root),
        "total_images": len(image_mask_pairs),
        "total_masks": 0,
        "missing_masks": [],
        "dimension_mismatches": [],
        "corrupted_images": [],
        "corrupted_masks": [],
        "building_color_rgb": list(BUILDING_COLOR),
        "building_color_hex": BUILDING_HEX,
        "building_positive_images_count": 0,
        "zero_building_images_count": 0,
        "zero_building_image_names": [],
        "building_coverages_percent": [],
        "min_building_coverage_percent": 0.0,
        "max_building_coverage_percent": 0.0,
        "avg_building_coverage_percent": 0.0,
        "is_valid_for_training": False,
        "tile_breakdown": {},
    }

    total_building_pixels_all = 0
    total_pixels_all = 0

    print(f"Validating dataset at: {dataset_root}")
    print(f"Found {len(image_mask_pairs)} potential image-mask pairs across tiles.\n")

    valid_pairs_for_viz = []

    for image_path, mask_path, tile_name in image_mask_pairs:
        if tile_name not in summary["tile_breakdown"]:
            summary["tile_breakdown"][tile_name] = {"images": 0, "masks": 0, "building_pixels": 0, "total_pixels": 0}

        summary["tile_breakdown"][tile_name]["images"] += 1

        if not mask_path.exists():
            summary["missing_masks"].append(str(image_path.name))
            print(f"  [ERROR] Missing mask for: {image_path.name}")
            continue

        summary["total_masks"] += 1
        summary["tile_breakdown"][tile_name]["masks"] += 1

        try:
            with Image.open(image_path) as img:
                img_rgb = img.convert("RGB")
                img_size = img_rgb.size
                _ = img_rgb.load()
        except (UnidentifiedImageError, OSError, Exception) as e:
            summary["corrupted_images"].append({"file": str(image_path), "error": str(e)})
            print(f"  [ERROR] Corrupted image: {image_path.name}: {e}")
            continue

        try:
            with Image.open(mask_path) as msk:
                msk_rgb = msk.convert("RGB")
                msk_size = msk_rgb.size
                _ = msk_rgb.load()
        except (UnidentifiedImageError, OSError, Exception) as e:
            summary["corrupted_masks"].append({"file": str(mask_path), "error": str(e)})
            print(f"  [ERROR] Corrupted mask: {mask_path.name}: {e}")
            continue

        if img_size != msk_size:
            summary["dimension_mismatches"].append({
                "image": str(image_path.name),
                "image_size": list(img_size),
                "mask_size": list(msk_size),
            })
            print(f"  [ERROR] Dimension mismatch: {image_path.name} (img: {img_size}, msk: {msk_size})")
            continue

        mask_np = np.array(msk_rgb)
        b_pixels, t_pixels, cov_pct = compute_building_coverage(mask_np)

        total_building_pixels_all += b_pixels
        total_pixels_all += t_pixels
        summary["building_coverages_percent"].append(cov_pct)
        summary["tile_breakdown"][tile_name]["building_pixels"] += b_pixels
        summary["tile_breakdown"][tile_name]["total_pixels"] += t_pixels

        if b_pixels > 0:
            summary["building_positive_images_count"] += 1
            if len(valid_pairs_for_viz) < 5:
                valid_pairs_for_viz.append((image_path, mask_path, tile_name, cov_pct))
        else:
            summary["zero_building_images_count"] += 1
            summary["zero_building_image_names"].append(f"{tile_name}/{image_path.name}")

    if summary["building_coverages_percent"]:
        summary["min_building_coverage_percent"] = round(float(np.min(summary["building_coverages_percent"])), 4)
        summary["max_building_coverage_percent"] = round(float(np.max(summary["building_coverages_percent"])), 4)
        summary["avg_building_coverage_percent"] = round(float(np.mean(summary["building_coverages_percent"])), 4)
        summary["dataset_wide_building_pixel_ratio_percent"] = round(
            (total_building_pixels_all / total_pixels_all) * 100.0 if total_pixels_all > 0 else 0.0, 4
        )

    for t_name, t_data in summary["tile_breakdown"].items():
        tp = t_data["total_pixels"]
        bp = t_data["building_pixels"]
        t_data["building_coverage_percent"] = round((bp / tp) * 100.0 if tp > 0 else 0.0, 4)

    is_valid = (
        summary["total_images"] > 0
        and len(summary["missing_masks"]) == 0
        and len(summary["dimension_mismatches"]) == 0
        and len(summary["corrupted_images"]) == 0
        and len(summary["corrupted_masks"]) == 0
        and summary["building_positive_images_count"] > 0
    )
    summary["is_valid_for_training"] = is_valid

    with (VALIDATION_DIR / "dataset_validation_summary.json").open("w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)

    status_str = "PASSED - VALID FOR TRAINING" if is_valid else "FAILED - DATASET ISSUES DETECTED"
    txt_path = VALIDATION_DIR / "dataset_validation_summary.txt"
    with txt_path.open("w", encoding="utf-8") as f:
        f.write("=" * 60 + "\n")
        f.write("UNET++ DATASET VALIDATION SUMMARY REPORT\n")
        f.write("=" * 60 + "\n\n")
        f.write(f"Dataset Location: {summary['dataset_root']}\n")
        f.write(f"Total Aerial Images: {summary['total_images']}\n")
        f.write(f"Total Segmentation Masks: {summary['total_masks']}\n")
        f.write(f"Missing Masks: {len(summary['missing_masks'])}\n")
        f.write(f"Dimension Mismatches: {len(summary['dimension_mismatches'])}\n")
        f.write(f"Corrupted Images: {len(summary['corrupted_images'])}\n")
        f.write(f"Corrupted Masks: {len(summary['corrupted_masks'])}\n")
        f.write("-" * 60 + "\n")
        f.write(f"Target Building Color: RGB {BUILDING_COLOR} (HEX {BUILDING_HEX})\n")
        f.write(f"Images with Building Pixels: {summary['building_positive_images_count']}\n")
        f.write(f"Images with Zero Building Pixels: {summary['zero_building_images_count']}\n")
        f.write(f"Minimum Building Coverage: {summary['min_building_coverage_percent']}%\n")
        f.write(f"Maximum Building Coverage: {summary['max_building_coverage_percent']}%\n")
        f.write(f"Average Building Coverage: {summary['avg_building_coverage_percent']}%\n")
        f.write(f"Dataset-wide Building Pixel Ratio: {summary.get('dataset_wide_building_pixel_ratio_percent', 0.0)}%\n")
        f.write("-" * 60 + "\n")
        f.write("Tile Breakdown:\n")
        for t_name, t_data in sorted(summary["tile_breakdown"].items()):
            f.write(f"  - {t_name}: {t_data['images']} images, {t_data['masks']} masks, {t_data['building_coverage_percent']}% building coverage\n")
        f.write("-" * 60 + "\n")
        if summary["zero_building_images_count"] > 0:
            f.write("Zero-building images list:\n")
            for name in summary["zero_building_image_names"]:
                f.write(f"  * {name}\n")
            f.write("-" * 60 + "\n")
        f.write(f"Validation Status: {status_str}\n")

    print("Generating validation overlay visualizations...")
    for idx, (img_p, msk_p, tile_n, cov_p) in enumerate(valid_pairs_for_viz, start=1):
        with Image.open(img_p) as im, Image.open(msk_p) as mk:
            img_arr = np.array(im.convert("RGB"))
            msk_arr = np.array(mk.convert("RGB"))

        b_mask = np.all(msk_arr[:, :, :3] == np.array(BUILDING_COLOR, dtype=np.uint8), axis=2)
        overlay = img_arr.copy()
        overlay[b_mask] = (0.5 * overlay[b_mask] + 0.5 * np.array([0, 255, 255])).astype(np.uint8)

        fig, axs = plt.subplots(1, 4, figsize=(18, 5))
        axs[0].imshow(img_arr)
        axs[0].set_title(f"Original Image ({img_p.name})")
        axs[0].axis("off")

        axs[1].imshow(msk_arr)
        axs[1].set_title("Original Multi-class RGB Mask")
        axs[1].axis("off")

        axs[2].imshow(b_mask, cmap="gray")
        axs[2].set_title(f"Extracted Building Mask ({cov_p:.2f}%)")
        axs[2].axis("off")

        axs[3].imshow(overlay)
        axs[3].set_title("Building Mask Overlay")
        axs[3].axis("off")

        fig.suptitle(f"Dataset Validation Sample {idx} [{tile_n}] - Building Coverage: {cov_p:.2f}%", fontsize=14)
        fig.tight_layout()
        out_fig_path = VALIDATION_DIR / f"validation_sample_{idx}_{img_p.stem}.png"
        fig.savefig(out_fig_path, dpi=120)
        plt.close(fig)

    print(f"\nValidation complete. Summary written to: {txt_path}")
    print(f"Validation status: {'PASSED' if is_valid else 'FAILED'}")
    return summary


if __name__ == "__main__":
    summary = validate_dataset()
    if not summary["is_valid_for_training"]:
        print("ERROR: Dataset validation failed! Review errors above.")
        exit(1)
    else:
        print("SUCCESS: All 72 images and masks validated perfectly.")

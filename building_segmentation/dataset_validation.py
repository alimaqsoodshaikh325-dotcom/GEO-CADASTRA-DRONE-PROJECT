from __future__ import annotations

import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from PIL import Image, UnidentifiedImageError

from dataset_utils import BUILDING_COLOR, find_dataset_root, iter_image_mask_pairs


PROJECT_ROOT = Path(__file__).resolve().parent
VALIDATION_DIR = PROJECT_ROOT / "validation_results"


def compute_building_ratio(mask_array: np.ndarray) -> float:
    total_pixels = mask_array.shape[0] * mask_array.shape[1]
    building_pixels = np.count_nonzero(np.all(mask_array == BUILDING_COLOR, axis=2))
    return (building_pixels / total_pixels) * 100.0 if total_pixels else 0.0


def validate_dataset() -> dict:
    dataset_root = find_dataset_root(PROJECT_ROOT)
    image_mask_pairs = iter_image_mask_pairs(dataset_root)
    image_paths = [image_path for image_path, _ in image_mask_pairs]
    mask_paths = [mask_path for _, mask_path in image_mask_pairs]

    summary = {
        "dataset_root": str(dataset_root),
        "images": len(image_paths),
        "masks": len(mask_paths),
        "missing_masks": [],
        "dimension_mismatches": [],
        "corrupted_images": [],
        "corrupted_masks": [],
        "building_color_present": False,
        "zero_building_images": [],
        "building_coverages": [],
        "building_coverages_by_image": {},
    }

    VALIDATION_DIR.mkdir(exist_ok=True, parents=True)

    for image_path, mask_path in image_mask_pairs:
        if not mask_path.exists():
            summary["missing_masks"].append(str(image_path.name))
            continue

        try:
            image = Image.open(image_path).convert("RGB")
        except (UnidentifiedImageError, OSError, ValueError):
            summary["corrupted_images"].append(str(image_path))
            continue

        try:
            mask = Image.open(mask_path).convert("RGB")
        except (UnidentifiedImageError, OSError, ValueError):
            summary["corrupted_masks"].append(str(mask_path))
            continue

        if image.size != mask.size:
            summary["dimension_mismatches"].append({
                "image": str(image_path),
                "mask": str(mask_path),
                "image_size": image.size,
                "mask_size": mask.size,
            })

        arr = np.array(mask)
        if np.any(np.all(arr == np.array(BUILDING_COLOR), axis=2)):
            summary["building_color_present"] = True

        ratio = compute_building_ratio(arr)
        summary["building_coverages"].append(ratio)
        summary["building_coverages_by_image"][image_path.name] = round(ratio, 6)
        if ratio <= 0.0:
            summary["zero_building_images"].append(image_path.name)

    summary["min_building_coverage"] = round(float(np.min(summary["building_coverages"])) if summary["building_coverages"] else 0.0, 6)
    summary["max_building_coverage"] = round(float(np.max(summary["building_coverages"])) if summary["building_coverages"] else 0.0, 6)
    summary["avg_building_coverage"] = round(float(np.mean(summary["building_coverages"])) if summary["building_coverages"] else 0.0, 6)

    with (VALIDATION_DIR / "dataset_summary.json").open("w", encoding="utf-8") as handle:
        json.dump(summary, handle, indent=2)

    with (VALIDATION_DIR / "dataset_summary.txt").open("w", encoding="utf-8") as handle:
        handle.write("Dataset Validation Summary\n")
        handle.write("=========================\n")
        handle.write(f"Dataset root: {dataset_root}\n")
        handle.write(f"Images: {summary['images']}\n")
        handle.write(f"Masks: {summary['masks']}\n")
        handle.write(f"Missing masks: {len(summary['missing_masks'])}\n")
        handle.write(f"Dimension mismatches: {len(summary['dimension_mismatches'])}\n")
        handle.write(f"Corrupted images: {len(summary['corrupted_images'])}\n")
        handle.write(f"Corrupted masks: {len(summary['corrupted_masks'])}\n")
        handle.write(f"Building color present: {summary['building_color_present']}\n")
        handle.write(f"Zero-building images: {len(summary['zero_building_images'])}\n")
        handle.write(f"Min coverage (%): {summary['min_building_coverage']}\n")
        handle.write(f"Max coverage (%): {summary['max_building_coverage']}\n")
        handle.write(f"Average coverage (%): {summary['avg_building_coverage']}\n")
        if summary["zero_building_images"]:
            handle.write("Zero-building image names:\n")
            for name in summary["zero_building_images"]:
                handle.write(f"- {name}\n")

    generate_sample_visualizations(dataset_root)
    return summary


def generate_sample_visualizations(dataset_root: Path, limit: int = 3):
    sample_pairs = iter_image_mask_pairs(dataset_root)[:limit]
    for index, (image_path, mask_path) in enumerate(sample_pairs, start=1):
        image = Image.open(image_path).convert("RGB")
        mask = Image.open(mask_path).convert("RGB")
        image_arr = np.array(image)
        mask_arr = np.array(mask)

        binary_mask = np.all(mask_arr == np.array(BUILDING_COLOR), axis=2).astype(np.uint8)
        overlay = image_arr.copy()
        overlay[binary_mask == 1] = (255, 0, 0)

        fig, axes = plt.subplots(1, 3, figsize=(10.8, 7.2))
        axes[0].imshow(image_arr)
        axes[0].set_title("Original Image")
        axes[0].axis("off")

        axes[1].imshow(binary_mask, cmap="gray")
        axes[1].set_title("Building Mask")
        axes[1].axis("off")

        axes[2].imshow(overlay)
        axes[2].set_title("Building Mask Overlay")
        axes[2].axis("off")

        fig.tight_layout()
        fig.savefig(VALIDATION_DIR / f"sample_{index}_validation.png", dpi=100)
        plt.close(fig)


if __name__ == "__main__":
    summary = validate_dataset()
    print("Dataset validation summary")
    print("=========================")
    print(f"Images: {summary['images']}")
    print(f"Masks: {summary['masks']}")
    print(f"Missing masks: {len(summary['missing_masks'])}")
    print(f"Dimension mismatches: {len(summary['dimension_mismatches'])}")
    print(f"Corrupted images: {len(summary['corrupted_images'])}")
    print(f"Corrupted masks: {len(summary['corrupted_masks'])}")
    print(f"Building color present: {summary['building_color_present']}")
    print(f"Zero-building images: {len(summary['zero_building_images'])}")
    print(f"Min coverage (%): {summary['min_building_coverage']}")
    print(f"Max coverage (%): {summary['max_building_coverage']}")
    print(f"Average coverage (%): {summary['avg_building_coverage']}")
    print(f"Results saved in: {VALIDATION_DIR}")

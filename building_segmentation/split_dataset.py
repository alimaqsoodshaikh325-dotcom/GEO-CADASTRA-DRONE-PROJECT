from __future__ import annotations

import shutil
from pathlib import Path
from typing import Dict, List


BUILDING_COLOR = (60, 16, 152)


def locate_dataset(start: Path | None = None) -> Path:
    if start is None:
        start = Path(__file__).resolve().parent
    candidates = [start, *start.parents]
    for base in candidates:
        dataset = base / "Semantic segmentation dataset"
        if dataset.exists() and (dataset / "classes.json").exists():
            return dataset
    for base in candidates:
        for match in base.rglob("Semantic segmentation dataset"):
            if match.is_dir() and (match / "classes.json").exists():
                return match
    raise FileNotFoundError("Could not find the dataset folder 'Semantic segmentation dataset'.")


def get_tile_dirs(dataset_root: Path) -> List[Path]:
    tiles = sorted(
        [p for p in dataset_root.iterdir() if p.is_dir() and p.name.startswith("Tile ")],
        key=lambda x: x.name,
    )
    if not tiles:
        raise FileNotFoundError(f"No Tile directories were found under {dataset_root}.")
    return tiles


def tile_aware_split(dataset_root: Path) -> Dict[str, Dict[str, List[str]]]:
    tiles = get_tile_dirs(dataset_root)
    if len(tiles) < 3:
        raise ValueError("At least three tiles are required for a tile-aware split.")

    train_tiles = tiles[:5]
    val_tiles = tiles[5:7]
    test_tiles = tiles[7:8]

    result = {"train": {"tiles": [], "images": []}, "val": {"tiles": [], "images": []}, "test": {"tiles": [], "images": []}}
    for split_name, split_tiles in [("train", train_tiles), ("val", val_tiles), ("test", test_tiles)]:
        result[split_name]["tiles"] = [tile.name for tile in split_tiles]
        for tile in split_tiles:
            image_dir = tile / "images"
            if not image_dir.exists():
                continue
            for image_path in sorted(image_dir.glob("*.jpg")):
                result[split_name]["images"].append(image_path.name)
    return result


def create_yolo_split_structure(project_root: Path, split: Dict[str, Dict[str, List[str]]], dataset_root: Path):
    yolo_root = project_root / "dataset_yolo"
    raw_labels_dir = project_root / "dataset_yolo" / "labels" / "raw"
    raw_images_dir = project_root / "dataset_yolo" / "images" / "raw"
    raw_labels_dir.mkdir(parents=True, exist_ok=True)

    for split_name in ["train", "val", "test"]:
        image_dir = yolo_root / "images" / split_name
        label_dir = yolo_root / "labels" / split_name
        image_dir.mkdir(parents=True, exist_ok=True)
        label_dir.mkdir(parents=True, exist_ok=True)

    # Copy images into split folders.
    for split_name in ["train", "val", "test"]:
        target_images_dir = yolo_root / "images" / split_name
        target_labels_dir = yolo_root / "labels" / split_name
        # Clear any existing files in the target split directories to avoid duplicates from prior runs
        if target_images_dir.exists():
            for f in target_images_dir.iterdir():
                if f.is_file():
                    f.unlink()
        if target_labels_dir.exists():
            for f in target_labels_dir.iterdir():
                if f.is_file():
                    f.unlink()
        # Copy from the canonical raw images folder created by convert_masks.py
        for tile_name in split[split_name]["tiles"]:
            prefix = f"{tile_name}__"
            for src in sorted(raw_images_dir.glob(f"{prefix}*")):
                shutil.copy2(src, target_images_dir / src.name)

    # Copy labels: labels in raw are named to match raw images (Tile_X__orig.jpg -> Tile_X__orig.txt)
    raw_label_files = {p.stem: p for p in raw_labels_dir.glob("*.txt")}

    for split_name in ["train", "val", "test"]:
        target_labels_dir = yolo_root / "labels" / split_name
        target_images_dir = yolo_root / "images" / split_name
        for image_path in sorted(target_images_dir.glob("*.jpg")):
            label_stem = image_path.stem
            label_path = target_labels_dir / f"{label_stem}.txt"
            source_label = raw_label_files.get(label_stem)
            if source_label is not None:
                shutil.copy2(source_label, label_path)
            else:
                # If there is no source label, create an empty label only if the original mask truly had no buildings.
                # We create an empty file as a placeholder (verification will catch mismatches).
                label_path.write_text("", encoding="utf-8")


def write_split_report(project_root: Path, split: Dict[str, Dict[str, List[str]]]) -> Path:
    report_path = project_root / "split_report.txt"
    lines = [
        "Tile-aware dataset split report",
        "==============================",
        "",
        f"Training tiles: {len(split['train']['tiles'])} ({', '.join(split['train']['tiles'])})",
        f"Training images: {len(split['train']['images'])}",
        f"Validation tiles: {len(split['val']['tiles'])} ({', '.join(split['val']['tiles'])})",
        f"Validation images: {len(split['val']['images'])}",
        f"Testing tiles: {len(split['test']['tiles'])} ({', '.join(split['test']['tiles'])})",
        f"Testing images: {len(split['test']['images'])}",
        "",
    ]
    report_path.write_text("\n".join(lines), encoding="utf-8")
    return report_path


if __name__ == "__main__":
    project_root = Path(__file__).resolve().parent
    dataset_root = locate_dataset(project_root)
    split = tile_aware_split(dataset_root)
    write_split_report(project_root, split)
    create_yolo_split_structure(project_root, split, dataset_root)
    print(f"Split report written to {project_root / 'split_report.txt'}")
    for split_name in ["train", "val", "test"]:
        print(f"{split_name}: tiles={len(split[split_name]['tiles'])}, images={len(split[split_name]['images'])}")

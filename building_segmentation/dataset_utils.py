from __future__ import annotations

from pathlib import Path
from typing import Iterable, List, Tuple

BUILDING_COLOR = (60, 16, 152)
BUILDING_CLASS_ID = 0
DATASET_DIR_NAME = "Semantic segmentation dataset"


def find_dataset_root(start: Path | None = None) -> Path:
    if start is None:
        start = Path(__file__).resolve().parent
    candidates = [start, *start.parents]
    for base in candidates:
        dataset_path = base / DATASET_DIR_NAME
        if dataset_path.exists() and (dataset_path / "classes.json").exists():
            return dataset_path
    for base in candidates:
        for match in base.rglob(DATASET_DIR_NAME):
            if match.is_dir() and (match / "classes.json").exists():
                return match
    raise FileNotFoundError(f"Could not locate '{DATASET_DIR_NAME}' under {start}.")


def iter_image_mask_pairs(dataset_root: Path) -> List[Tuple[Path, Path]]:
    pairs: List[Tuple[Path, Path]] = []
    tiles = sorted(dataset_root.glob("Tile *"), key=lambda p: p.name)
    for tile_dir in tiles:
        image_dir = tile_dir / "images"
        mask_dir = tile_dir / "masks"
        if not image_dir.exists() or not mask_dir.exists():
            continue
        for image_path in sorted(image_dir.iterdir()):
            if not image_path.is_file():
                continue
            if image_path.suffix.lower() not in {".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff"}:
                continue
            candidates = [
                p
                for p in mask_dir.iterdir()
                if p.is_file() and p.stem == image_path.stem and p.suffix.lower() in {".png", ".bmp", ".tif", ".tiff", ".jpg", ".jpeg"}
            ]
            if not candidates:
                continue
            mask_path = sorted(candidates, key=lambda p: p.suffix.lower())[0]
            pairs.append((image_path, mask_path))
    return pairs


def tile_aware_split(dataset_root: Path):
    tile_dirs = sorted(dataset_root.glob("Tile *"), key=lambda p: p.name)
    if len(tile_dirs) < 3:
        raise ValueError("At least three tiles are required for tile-aware splitting.")

    train_tiles = tile_dirs[:5]
    val_tiles = tile_dirs[5:7]
    test_tiles = tile_dirs[7:8]

    split = {
        "train": [],
        "val": [],
        "test": [],
    }
    for tile in train_tiles:
        split["train"].extend(sorted((tile / "images").glob("*.*")))
    for tile in val_tiles:
        split["val"].extend(sorted((tile / "images").glob("*.*")))
    for tile in test_tiles:
        split["test"].extend(sorted((tile / "images").glob("*.*")))

    return {
        "train": {"tiles": [t.name for t in train_tiles], "images": split["train"]},
        "val": {"tiles": [t.name for t in val_tiles], "images": split["val"]},
        "test": {"tiles": [t.name for t in test_tiles], "images": split["test"]},
    }

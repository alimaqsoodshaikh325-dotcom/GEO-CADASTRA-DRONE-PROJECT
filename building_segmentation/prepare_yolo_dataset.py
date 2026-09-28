from __future__ import annotations

from pathlib import Path
import shutil
import sys

from dataset_utils import find_dataset_root
import split_dataset

PROJECT_ROOT = Path(__file__).resolve().parent
DATASET_YOLO = PROJECT_ROOT / "dataset_yolo"
RAW_LABELS = DATASET_YOLO / "labels" / "raw"


def prepare():
    dataset_root = find_dataset_root(PROJECT_ROOT)
    split = split_dataset.tile_aware_split(dataset_root)

    for split_name in ["train", "val", "test"]:
        img_out = DATASET_YOLO / "images" / split_name
        lbl_out = DATASET_YOLO / "labels" / split_name
        img_out.mkdir(parents=True, exist_ok=True)
        lbl_out.mkdir(parents=True, exist_ok=True)

        for img_path in split[split_name]["images"]:
            src_img = None
            # Images are Path strings from split_dataset; if not Path, create Path
            p = Path(img_path)
            if p.is_absolute():
                src_img = p
            else:
                # try to find the image under dataset_root tiles
                for tile in (dataset_root).glob('Tile *'):
                    candidate = tile / 'images' / p.name
                    if candidate.exists():
                        src_img = candidate
                        break
            if src_img is None:
                print(f"Warning: image not found for {p.name}")
                continue

            dst_img = img_out / src_img.name
            shutil.copy2(src_img, dst_img)

            raw_label = RAW_LABELS / f"{src_img.stem}.txt"
            dst_label = lbl_out / f"{src_img.stem}.txt"
            if raw_label.exists():
                shutil.copy2(raw_label, dst_label)
            else:
                # create empty label file
                dst_label.write_text("", encoding="utf-8")

    # report counts
    for split_name in ["train", "val", "test"]:
        img_out = DATASET_YOLO / "images" / split_name
        lbl_out = DATASET_YOLO / "labels" / split_name
        print(f"{split_name}: images={len(list(img_out.glob('*.*')))} labels={len(list(lbl_out.glob('*.txt')))}")


if __name__ == "__main__":
    prepare()

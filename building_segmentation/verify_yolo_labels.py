from __future__ import annotations

from pathlib import Path
import sys
import statistics


PROJECT_ROOT = Path(__file__).resolve().parent
DATASET_YOLO = PROJECT_ROOT / "dataset_yolo"


def load_label_lines(label_path: Path):
    if not label_path.exists():
        return []
    lines = [line.strip() for line in label_path.read_text(encoding="utf-8").splitlines() if line.strip()]
    return lines


def validate_label_line(line: str, line_no: int, path: Path):
    parts = line.split()
    if len(parts) < 7:
        raise ValueError(f"Invalid label (too few tokens) in {path}:{line_no}")
    try:
        class_id = int(parts[0])
    except Exception:
        raise ValueError(f"Invalid class id in {path}:{line_no}")
    if class_id != 0:
        raise ValueError(f"Unexpected class id {class_id} in {path}:{line_no}; expected 0")
    coords = parts[1:]
    if len(coords) % 2 != 0:
        raise ValueError(f"Odd number of coordinate values in {path}:{line_no}")
    num_points = len(coords) // 2
    if num_points < 3:
        raise ValueError(f"Polygon with fewer than 3 points in {path}:{line_no}")
    for i, v in enumerate(coords, start=1):
        try:
            f = float(v)
        except Exception:
            raise ValueError(f"Non-float coordinate in {path}:{line_no} token#{i}")
        if not (0.0 <= f <= 1.0):
            raise ValueError(f"Coordinate out of range [0,1] in {path}:{line_no}: {f}")


def check_split(split_name: str):
    images_dir = DATASET_YOLO / "images" / split_name
    labels_dir = DATASET_YOLO / "labels" / split_name
    if not images_dir.exists() or not labels_dir.exists():
        raise FileNotFoundError(f"Missing images or labels folder for split {split_name}: {images_dir} / {labels_dir}")

    image_files = sorted([p for p in images_dir.iterdir() if p.is_file() and p.suffix.lower() in {".jpg", ".png", ".jpeg"}])
    label_files = sorted([p for p in labels_dir.iterdir() if p.is_file() and p.suffix.lower() == ".txt"])

    if len(image_files) != len(image_files):
        pass

    # Map stems
    image_stems = {p.stem: p for p in image_files}
    label_stems = {p.stem: p for p in label_files}

    missing_label_images = [s for s in image_stems.keys() if s not in label_stems]
    if missing_label_images:
        raise SystemExit(f"ERROR: {len(missing_label_images)} images in {split_name} have no label files. Examples: {missing_label_images[:5]}")

    extra_labels = [s for s in label_stems.keys() if s not in image_stems]
    if extra_labels:
        raise SystemExit(f"ERROR: {len(extra_labels)} label files in {split_name} have no matching image. Examples: {extra_labels[:5]}")

    total_polygons = 0
    images_with_buildings = 0
    polygons_per_image = []
    empty_label_count = 0

    for stem, img_path in image_stems.items():
        label_path = label_stems.get(stem)
        lines = load_label_lines(label_path)
        if not lines:
            empty_label_count += 1
            polygons_per_image.append(0)
            continue
        images_with_buildings += 1
        poly_count = 0
        for i, line in enumerate(lines, start=1):
            validate_label_line(line, i, label_path)
            coords = line.split()[1:]
            poly_count += 1
        polygons_per_image.append(poly_count)
        total_polygons += poly_count

    stats = {
        "split": split_name,
        "images": len(image_files),
        "label_files": len(label_files),
        "empty_label_files": empty_label_count,
        "images_with_buildings": images_with_buildings,
        "total_polygons": total_polygons,
        "min_polygons_per_image": min(polygons_per_image) if polygons_per_image else 0,
        "max_polygons_per_image": max(polygons_per_image) if polygons_per_image else 0,
        "avg_polygons_per_image": float(statistics.mean(polygons_per_image)) if polygons_per_image else 0.0,
    }
    return stats


def main():
    if not DATASET_YOLO.exists():
        print(f"Dataset YOLO folder not found: {DATASET_YOLO}")
        sys.exit(2)

    report = {}
    for split in ["train", "val", "test"]:
        report[split] = check_split(split)

    # Print summary
    print("YOLO label verification report")
    print("================================")
    for split in ["train", "val", "test"]:
        s = report[split]
        print(f"\n{split.upper()}")
        print(f" images: {s['images']}")
        print(f" label files: {s['label_files']}")
        print(f" empty label files: {s['empty_label_files']}")
        print(f" images with buildings: {s['images_with_buildings']}")
        print(f" total polygons: {s['total_polygons']}")
        print(f" polygons per image (min/max/avg): {s['min_polygons_per_image']}/{s['max_polygons_per_image']}/{s['avg_polygons_per_image']:.2f}")

    print("\nVerification passed. All images have matching label files and labels are syntactically valid.")


if __name__ == "__main__":
    main()

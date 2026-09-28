from __future__ import annotations

from pathlib import Path
import random
import math

import cv2
import numpy as np
from PIL import Image

PROJECT_ROOT = Path(__file__).resolve().parent
DATASET_YOLO = PROJECT_ROOT / "dataset_yolo"
OUT_DIR = PROJECT_ROOT / "validation_results" / "labels"
OUT_DIR.mkdir(parents=True, exist_ok=True)
FINAL_VISUAL_SIZE = (1080, 720)  # width, height


def load_label_polygons(label_path: Path):
    if not label_path.exists():
        return []
    lines = [l.strip() for l in label_path.read_text(encoding="utf-8").splitlines() if l.strip()]
    polys = []
    for line in lines:
        parts = line.split()
        coords = [float(x) for x in parts[1:]]
        points = [(coords[i], coords[i + 1]) for i in range(0, len(coords), 2)]
        polys.append(points)
    return polys


def draw_polygons_on_image(img_path: Path, label_path: Path, out_path: Path):
    img = cv2.imread(str(img_path))
    h, w = img.shape[:2]
    polys = load_label_polygons(label_path)
    for poly in polys:
        pts = [(int(x * w), int(y * h)) for x, y in poly]
        if len(pts) >= 3:
            pts_arr = np.array(pts, dtype=np.int32)
            cv2.polylines(img, [pts_arr], isClosed=True, color=(0, 255, 0), thickness=2)
    cv2.imwrite(str(out_path), fit_to_final_canvas(img))


def fit_to_final_canvas(image: np.ndarray) -> np.ndarray:
    """Preserve overlay geometry while producing a 1080x720 visual output."""
    target_w, target_h = FINAL_VISUAL_SIZE
    height, width = image.shape[:2]
    scale = min(target_w / width, target_h / height)
    interpolation = cv2.INTER_AREA if scale < 1 else cv2.INTER_CUBIC
    resized = cv2.resize(image, (round(width * scale), round(height * scale)), interpolation=interpolation)
    canvas = np.zeros((target_h, target_w, 3), dtype=np.uint8)
    y = (target_h - resized.shape[0]) // 2
    x = (target_w - resized.shape[1]) // 2
    canvas[y:y + resized.shape[0], x:x + resized.shape[1]] = resized
    return canvas


def create_contact_sheet(image_paths, out_path: Path, cols=5):
    sheet_w, sheet_h = FINAL_VISUAL_SIZE
    thumbs = [Image.open(p).convert("RGB") for p in image_paths]
    rows = math.ceil(len(thumbs) / cols)
    cell_w, cell_h = sheet_w // cols, sheet_h // rows
    sheet = Image.new("RGB", FINAL_VISUAL_SIZE, (0, 0, 0))
    for idx, t in enumerate(thumbs):
        r = idx // cols
        c = idx % cols
        t.thumbnail((cell_w, cell_h), Image.Resampling.LANCZOS)
        x = c * cell_w + (cell_w - t.width) // 2
        y = r * cell_h + (cell_h - t.height) // 2
        sheet.paste(t, (x, y))
    sheet.save(out_path)


def main(sample_count: int = 10):
    train_images = sorted([p for p in (DATASET_YOLO / "images" / "train").glob("*.jpg")])
    if not train_images:
        print("No training images found in dataset_yolo/images/train")
        return
    sample_count = min(sample_count, len(train_images))
    sampled = random.sample(train_images, sample_count)
    saved = []
    for img_path in sampled:
        label_path = (DATASET_YOLO / "labels" / "train" / f"{img_path.stem}.txt")
        out_path = OUT_DIR / f"{img_path.stem}_viz.jpg"
        draw_polygons_on_image(img_path, label_path, out_path)
        saved.append(out_path)

    contact_sheet_path = OUT_DIR / "contact_sheet.jpg"
    create_contact_sheet(saved, contact_sheet_path)
    print(f"Saved {len(saved)} visualizations to {OUT_DIR} and contact sheet {contact_sheet_path}")


if __name__ == "__main__":
    main()

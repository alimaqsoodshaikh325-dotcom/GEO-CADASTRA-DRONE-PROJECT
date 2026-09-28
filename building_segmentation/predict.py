from __future__ import annotations

import argparse
from pathlib import Path

import cv2
import numpy as np
from ultralytics import YOLO

PROJECT_ROOT = Path(__file__).resolve().parent
PREDICTION_ROOT = PROJECT_ROOT / "runs" / "predictions_fixed"
DEFAULT_BEST = PROJECT_ROOT / "runs" / "segment" / "building_yolo11_fixed" / "weights" / "best.pt"
FINAL_VISUAL_SIZE = (1080, 720)  # width, height


def parse_args():
    parser = argparse.ArgumentParser(description="Run YOLOv11-Seg inference for building segmentation.")
    parser.add_argument("--source", type=str, required=True, help="Image file or folder path")
    parser.add_argument("--conf", type=float, default=0.25, help="Confidence threshold")
    parser.add_argument("--save-dir", type=str, default=str(PREDICTION_ROOT), help="Output directory for predictions")
    parser.add_argument("--model", type=str, default=str(DEFAULT_BEST), help="Path to model weights to use for inference")
    return parser.parse_args()


def is_image_file(path: Path) -> bool:
    return path.is_file() and path.suffix.lower() in {".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff"}


def render_final_visual(image: np.ndarray) -> np.ndarray:
    """Fit an annotated image into the required 1080x720 output canvas."""
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


if __name__ == "__main__":
    args = parse_args()
    best_model = Path(args.model)
    if not best_model.exists():
        raise FileNotFoundError(f"Best model not found: {best_model}. Train the model first.")

    model = YOLO(str(best_model))
    source = Path(args.source)
    save_dir = Path(args.save_dir)
    save_dir.mkdir(parents=True, exist_ok=True)

    if source.is_dir():
        image_paths = [p for p in sorted(source.iterdir()) if is_image_file(p)]
    else:
        image_paths = [source] if is_image_file(source) else []

    if not image_paths:
        raise FileNotFoundError(f"No valid image files found in source: {source}")

    for image_path in image_paths:
        results = model(image_path, conf=args.conf, imgsz=640, verbose=False)
        annotated = render_final_visual(results[0].plot())
        out_path = save_dir / f"{image_path.stem}_predicted.jpg"
        cv2.imwrite(str(out_path), cv2.cvtColor(annotated, cv2.COLOR_RGB2BGR))
        print(f"Saved prediction: {out_path}")

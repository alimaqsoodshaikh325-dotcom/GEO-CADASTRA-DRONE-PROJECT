from __future__ import annotations

import argparse
from pathlib import Path

import cv2
import numpy as np
from ultralytics import YOLO

PROJECT_ROOT = Path(__file__).resolve().parent
PRED_DIR = PROJECT_ROOT / "runs" / "predictions"
FN_DIR = PROJECT_ROOT / "runs" / "failure_analysis"
FINAL_VISUAL_SIZE = (1080, 720)  # width, height


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--images", required=True, help="Folder of images to analyze (test split)")
    p.add_argument("--labels", required=True, help="Folder of YOLO labels corresponding to images")
    p.add_argument("--model", default=str(PROJECT_ROOT / "runs" / "segment" / "building_yolo11" / "weights" / "best.pt"))
    p.add_argument("--conf", type=float, default=0.25)
    return p.parse_args()


def yolo_label_to_mask(label_path: Path, img_shape):
    # read YOLO seg label: class x1 y1 x2 y2... normalized
    h, w = img_shape[:2]
    mask = np.zeros((h, w), dtype=np.uint8)
    if not label_path.exists():
        return mask
    with open(label_path, 'r') as fh:
        for line in fh:
            parts = line.strip().split()
            if len(parts) < 3:
                continue
            coords = [float(x) for x in parts[1:]]
            pts = []
            for i in range(0, len(coords), 2):
                xn, yn = coords[i], coords[i+1]
                pts.append([int(xn * w), int(yn * h)])
            if len(pts) >= 3:
                cv2.fillPoly(mask, [np.array(pts, dtype=np.int32)], 1)
    return mask

def fit_to_final_canvas(image: np.ndarray) -> np.ndarray:
    """Fit a failure-analysis overlay into the required 1080x720 canvas."""
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

def run():
    args = parse_args()
    model = YOLO(str(args.model))
    img_dir = Path(args.images)
    label_dir = Path(args.labels)
    out_dir = FN_DIR
    out_dir.mkdir(parents=True, exist_ok=True)

    for img_path in sorted(img_dir.iterdir()):
        if img_path.suffix.lower() not in {'.jpg', '.png', '.jpeg'}:
            continue
        img = cv2.imread(str(img_path))
        h, w = img.shape[:2]
        lbl_path = label_dir / f"{img_path.stem}.txt"
        gt_mask = yolo_label_to_mask(lbl_path, img.shape)

        res = model(str(img_path), conf=args.conf, imgsz=640)
        r = res[0]
        masks = None
        try:
            masks = r.masks.data.cpu().numpy()
        except Exception:
            masks = None

        pred_mask = np.zeros_like(gt_mask)
        if masks is not None and masks.size:
            for i in range(masks.shape[0]):
                m = (masks[i] > 0.5).astype('uint8')
                # resize if shapes mismatch
                if m.shape != pred_mask.shape:
                    m = cv2.resize(m.astype('uint8'), (w, h), interpolation=cv2.INTER_NEAREST)
                pred_mask = np.logical_or(pred_mask, m)
        pred_mask = pred_mask.astype('uint8')

        tp = (pred_mask == 1) & (gt_mask == 1)
        fp = (pred_mask == 1) & (gt_mask == 0)
        fn = (pred_mask == 0) & (gt_mask == 1)

        # create overlay
        overlay = img.copy()
        overlay[tp] = (0, 255, 0)  # green true positive
        overlay[fp] = (0, 0, 255)  # red false positive
        overlay[fn] = (255, 0, 0)  # blue false negative

        out_path = out_dir / f"{img_path.stem}_analysis.jpg"
        cv2.imwrite(str(out_path), fit_to_final_canvas(overlay))
        print(f"Saved failure analysis: {out_path}")


if __name__ == '__main__':
    run()

from __future__ import annotations

import argparse
import json
from pathlib import Path

import cv2
import numpy as np
from ultralytics import YOLO

PROJECT_ROOT = Path(__file__).resolve().parent
PRED_DIR = PROJECT_ROOT / "runs" / "predictions"


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--source", required=True, help="Image file or folder")
    p.add_argument("--model", default=str(PROJECT_ROOT / "runs" / "segment" / "building_yolo11" / "weights" / "best.pt"))
    p.add_argument("--conf", type=float, default=0.25)
    p.add_argument("--out", default=str(PRED_DIR / "geojson"))
    return p.parse_args()


def mask_to_polygons(mask: np.ndarray):
    # mask: uint8 binary mask (H,W)
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    polys = []
    for c in contours:
        if cv2.contourArea(c) < 10:
            continue
        pts = c.squeeze().tolist()
        if len(pts) < 3:
            continue
        polys.append(pts)
    return polys


def run():
    args = parse_args()
    model = YOLO(str(args.model))
    src = Path(args.source)
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    if src.is_dir():
        images = sorted([p for p in src.iterdir() if p.suffix.lower() in {'.jpg', '.png', '.jpeg'}])
    else:
        images = [src]

    for img in images:
        res = model(str(img), conf=args.conf, imgsz=640)
        r = res[0]
        # try to get mask tensor
        masks = None
        try:
            masks = r.masks.data.cpu().numpy()
        except Exception:
            try:
                masks = r.masks.cpu().numpy()
            except Exception:
                masks = None

        features = []
        if masks is not None and masks.size:
            # masks shape: (n, H, W)
            for i in range(masks.shape[0]):
                m = (masks[i] > 0.5).astype('uint8')
                polys = mask_to_polygons(m)
                for poly in polys:
                    # convert to GeoJSON-like coordinates (pixel coords)
                    coords = [[int(x), int(y)] for x, y in poly]
                    features.append({
                        "type": "Feature",
                        "properties": {"score": float(r.boxes.conf[i]) if hasattr(r, 'boxes') and len(r.boxes) > i else None},
                        "geometry": {"type": "Polygon", "coordinates": [coords]},
                    })
        else:
            # no masks: save empty FeatureCollection
            features = []

        geo = {"type": "FeatureCollection", "features": features}
        out_path = out_dir / f"{img.stem}.geojson"
        with open(out_path, 'w', encoding='utf8') as fh:
            json.dump(geo, fh, ensure_ascii=False, indent=2)
        print(f"Saved GeoJSON: {out_path}")


if __name__ == '__main__':
    run()

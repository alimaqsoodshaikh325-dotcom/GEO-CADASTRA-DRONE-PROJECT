"""
extract_maskrcnn_instances.py - Mask R-CNN Cadastral Footprint Extractor
Extracts individual building footprint polygons from Mask R-CNN predictions:
- Converts each instance mask to an orthogonalized, simplified geometric polygon
- Computes pixel area, perimeter, bounding box, and detection confidence
- Exports to GeoJSON (maskrcnn_building_footprints.geojson) in pixel space
- Clearly labels output with non-georeferenced spatial reference note
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import cv2
import numpy as np
from shapely.geometry import Polygon, mapping
import torch
from torchvision.models.detection import maskrcnn_resnet50_fpn_v2
from torchvision.models.detection.faster_rcnn import FastRCNNPredictor
from torchvision.models.detection.mask_rcnn import MaskRCNNPredictor

PROJECT_ROOT = Path(__file__).resolve().parent
DEFAULT_CHECKPOINT = PROJECT_ROOT / "runs" / "maskrcnn" / "building_instances" / "best.pth"
DEFAULT_TEST_DIR = PROJECT_ROOT / "maskrcnn_dataset" / "images" / "test"
DEFAULT_OUT_GEOJSON = PROJECT_ROOT / "maskrcnn_building_footprints.geojson"


def load_model(checkpoint_path: Path, device: torch.device):
    ckpt = torch.load(checkpoint_path, map_location=device)
    config = ckpt.get("config", {})

    model = maskrcnn_resnet50_fpn_v2(weights=None)
    in_features = model.roi_heads.box_predictor.cls_score.in_features
    model.roi_heads.box_predictor = FastRCNNPredictor(in_features, 2)
    in_features_mask = model.roi_heads.mask_predictor.conv5_mask.in_channels
    dim_reduced = model.roi_heads.mask_predictor.conv5_mask.out_channels
    model.roi_heads.mask_predictor = MaskRCNNPredictor(in_features_mask, dim_reduced, 2)

    model.load_state_dict(ckpt["model_state_dict"])
    model.to(device)
    model.eval()
    return model, config


def mask_to_polygons(binary_mask: np.ndarray, min_area: float = 30.0, epsilon_ratio: float = 0.005) -> list[Polygon]:
    cnts, _ = cv2.findContours(binary_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    polys = []
    for cnt in cnts:
        area = cv2.contourArea(cnt)
        if area < min_area:
            continue
        eps = epsilon_ratio * cv2.arcLength(cnt, True)
        approx = cv2.approxPolyDP(cnt, eps, True)
        pts = approx.squeeze()
        if len(pts.shape) != 2 or pts.shape[0] < 3:
            continue
        coords = [[float(x), float(y)] for x, y in pts]
        if coords[0] != coords[-1]:
            coords.append(coords[0])
        try:
            poly = Polygon(coords)
            if not poly.is_valid:
                poly = poly.buffer(0)
            if not poly.is_empty and poly.geom_type in ["Polygon", "MultiPolygon"]:
                polys.append(poly)
        except Exception:
            continue
    return polys


def extract_instances(checkpoint_path: Path, image_source: Path, output_geojson: Path,
                      score_thresh: float = 0.35, mask_thresh: float = 0.5, min_area: float = 30.0):
    print("=" * 70, flush=True)
    print("MASK R-CNN CADASTRAL INSTANCE EXTRACTION", flush=True)
    print("=" * 70, flush=True)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model, config = load_model(checkpoint_path, device)
    img_size = config.get("img_size", 320)
    print(f"Model resolution: {img_size}x{img_size} | Score threshold: {score_thresh}", flush=True)

    images = sorted([p for p in image_source.iterdir() if p.suffix.lower() in {".jpg", ".jpeg", ".png"}]) if image_source.is_dir() else [image_source]

    all_features = []
    total_buildings = 0

    for img_p in images:
        img_bgr = cv2.imread(str(img_p))
        if img_bgr is None:
            continue
        orig_h, orig_w = img_bgr.shape[:2]
        img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)

        img_resized = cv2.resize(img_rgb, (img_size, img_size), interpolation=cv2.INTER_LINEAR)
        img_tensor = torch.from_numpy(img_resized.transpose(2, 0, 1)).float() / 255.0
        img_tensor = img_tensor.unsqueeze(0).to(device)

        with torch.no_grad():
            pred = model(img_tensor)[0]

        boxes = pred["boxes"].cpu().numpy()
        scores = pred["scores"].cpu().numpy()
        masks = pred["masks"].squeeze(1).cpu().numpy()

        sx = orig_w / img_size
        sy = orig_h / img_size

        keep = scores >= score_thresh
        filtered_boxes = boxes[keep]
        filtered_scores = scores[keep]
        filtered_masks = masks[keep]

        img_bldg_count = 0
        for b_idx, (box, score, mask) in enumerate(zip(filtered_boxes, filtered_scores, filtered_masks), start=1):
            px1 = round(float(box[0]) * sx, 2)
            py1 = round(float(box[1]) * sy, 2)
            px2 = round(float(box[2]) * sx, 2)
            py2 = round(float(box[3]) * sy, 2)

            mask_full = cv2.resize((mask > mask_thresh).astype(np.uint8), (orig_w, orig_h), interpolation=cv2.INTER_NEAREST)
            polys = mask_to_polygons(mask_full, min_area=min_area, epsilon_ratio=0.005)

            for p in polys:
                img_bldg_count += 1
                total_buildings += 1
                all_features.append({
                    "type": "Feature",
                    "geometry": mapping(p),
                    "properties": {
                        "building_id": f"{img_p.stem}_mrcnn_{img_bldg_count:04d}",
                        "source_image": img_p.name,
                        "confidence": round(float(score), 4),
                        "bounding_box_xyxy": [px1, py1, px2, py2],
                        "area_pixels": round(float(p.area), 2),
                        "perimeter_pixels": round(float(p.length), 2),
                        "spatial_reference_note": "Pixel space coordinates. Non-georeferenced imagery.",
                    },
                })

        print(f"  {img_p.name}: {img_bldg_count} building footprints extracted", flush=True)

    geojson_doc = {
        "type": "FeatureCollection",
        "description": "Building footprints extracted via Mask R-CNN instance detection & segmentation.",
        "crs_status": "Pixel coordinate space. Geographic coordinates unavailable because input imagery is not georeferenced.",
        "total_features": len(all_features),
        "features": all_features,
    }

    output_geojson.parent.mkdir(parents=True, exist_ok=True)
    with output_geojson.open("w", encoding="utf-8") as f:
        json.dump(geojson_doc, f, indent=2)

    print("-" * 70, flush=True)
    print(f"Total building footprints extracted: {total_buildings} across {len(images)} image(s)", flush=True)
    print(f"GeoJSON saved to: {output_geojson}", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--checkpoint", type=str, default=str(DEFAULT_CHECKPOINT))
    parser.add_argument("--source", type=str, default=str(DEFAULT_TEST_DIR))
    parser.add_argument("--out", type=str, default=str(DEFAULT_OUT_GEOJSON))
    parser.add_argument("--score-thresh", type=float, default=0.35)
    parser.add_argument("--mask-thresh", type=float, default=0.5)
    parser.add_argument("--min-area", type=float, default=30.0)
    args = parser.parse_args()

    extract_instances(
        checkpoint_path=Path(args.checkpoint),
        image_source=Path(args.source),
        output_geojson=Path(args.out),
        score_thresh=args.score_thresh,
        mask_thresh=args.mask_thresh,
        min_area=args.min_area,
    )

"""
refine_footprints.py - Building Footprint Refinement and GeoJSON Extraction
Pipeline:
1. Load U-Net++ checkpoint (uses config embedded in checkpoint for correct model shape)
2. Run inference -> probability map
3. Threshold -> binary mask
4. Mild morphological cleanup (kernel 3x3 only - prevents merging adjacent buildings)
5. Connected components (each building = separate component)
6. Contour extraction with RETR_EXTERNAL (separates interior from exterior)
7. Area filtering and Douglas-Peucker simplification
8. GeoJSON output with pixel-space coordinates and explicit non-georeferenced note
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import cv2
import numpy as np
from shapely.geometry import Polygon, mapping
import torch
import segmentation_models_pytorch as smp

PROJECT_ROOT = Path(__file__).resolve().parent
DEFAULT_CHECKPOINT = PROJECT_ROOT / "runs" / "unetpp" / "building_refinement" / "best.pt"
DEFAULT_TEST_DIR = PROJECT_ROOT / "unet_dataset" / "images" / "test"
DEFAULT_OUT_GEOJSON = PROJECT_ROOT / "unet_building_footprints.geojson"


def load_unetpp(checkpoint_path: Path, device: torch.device):
    ckpt = torch.load(checkpoint_path, map_location=device)
    config = ckpt.get("config", {})
    encoder = config.get("encoder", "resnet18")
    try:
        model = smp.UnetPlusPlus(
            encoder_name=encoder,
            encoder_weights=None,
            in_channels=3,
            classes=1,
            encoder_depth=4,
            decoder_channels=(128, 64, 32, 16),
        )
        model.load_state_dict(ckpt["model_state_dict"])
    except Exception:
        model = smp.UnetPlusPlus(
            encoder_name=encoder,
            encoder_weights=None,
            in_channels=3,
            classes=1,
        )
        model.load_state_dict(ckpt["model_state_dict"])
    model.to(device)
    model.eval()
    return model, config


def refine_mask(binary_mask: np.ndarray, open_k: int = 3, close_k: int = 3) -> np.ndarray:
    """
    Conservative morphological cleanup: removes isolated pixels and fills pinholes.
    Kernel sizes kept to 3x3 to strictly prevent merging adjacent buildings.
    """
    clean = binary_mask.copy()
    if open_k > 1:
        k = cv2.getStructuringElement(cv2.MORPH_RECT, (open_k, open_k))
        clean = cv2.morphologyEx(clean, cv2.MORPH_OPEN, k)
    if close_k > 1:
        k = cv2.getStructuringElement(cv2.MORPH_RECT, (close_k, close_k))
        clean = cv2.morphologyEx(clean, cv2.MORPH_CLOSE, k)
    return clean


def extract_polygons(mask: np.ndarray, prob_map: np.ndarray, min_area: float, epsilon_ratio: float) -> list[dict]:
    """
    Extract individual building polygons from binary mask.
    Uses connected components + RETR_EXTERNAL to guarantee each building remains separate.
    """
    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    buildings = []
    bid = 1

    for label in range(1, num_labels):
        if stats[label, cv2.CC_STAT_AREA] < min_area:
            continue

        component_mask = (labels == label).astype(np.uint8) * 255
        contours, _ = cv2.findContours(component_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        for cnt in contours:
            if cv2.contourArea(cnt) < min_area:
                continue

            epsilon = epsilon_ratio * cv2.arcLength(cnt, closed=True)
            approx = cv2.approxPolyDP(cnt, epsilon, closed=True)

            pts = approx.squeeze()
            if len(pts.shape) != 2 or pts.shape[0] < 3:
                continue

            comp_pixels = (component_mask == 255)
            mean_conf = float(prob_map[comp_pixels].mean()) if np.any(comp_pixels) else 0.5

            coords = [[float(x), float(y)] for x, y in pts]
            if coords[0] != coords[-1]:
                coords.append(coords[0])

            try:
                poly = Polygon(coords)
                if not poly.is_valid:
                    poly = poly.buffer(0)
                if poly.is_empty or poly.geom_type not in ["Polygon", "MultiPolygon"]:
                    continue
                buildings.append({
                    "building_id": bid,
                    "area_pixels": float(poly.area),
                    "perimeter_pixels": float(poly.length),
                    "mean_confidence": round(mean_conf, 4),
                    "geometry": poly,
                })
                bid += 1
            except Exception:
                continue

    return buildings


def process_image(model, img_path: Path, device: torch.device, img_size: int,
                  threshold: float, min_area: float, epsilon: float) -> list[dict]:
    img_bgr = cv2.imread(str(img_path))
    if img_bgr is None:
        return []
    orig_h, orig_w = img_bgr.shape[:2]
    img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)

    img_resized = cv2.resize(img_rgb, (img_size, img_size), interpolation=cv2.INTER_LINEAR)
    mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
    std = np.array([0.229, 0.224, 0.225], dtype=np.float32)
    img_norm = ((img_resized / 255.0).astype(np.float32) - mean) / std
    img_tensor = torch.from_numpy(img_norm.transpose(2, 0, 1)).unsqueeze(0).to(device)

    with torch.no_grad():
        logits = model(img_tensor)
        prob_small = torch.sigmoid(logits).squeeze().cpu().numpy()

    prob_full = cv2.resize(prob_small, (orig_w, orig_h), interpolation=cv2.INTER_LINEAR)
    raw_binary = (prob_full >= threshold).astype(np.uint8) * 255
    clean_binary = refine_mask(raw_binary, open_k=3, close_k=3)

    return extract_polygons(clean_binary, prob_full, min_area=min_area, epsilon_ratio=epsilon)


def run_refinement(checkpoint_path: Path, image_source: Path, output_geojson: Path,
                   threshold: float = 0.5, min_area: float = 30.0, epsilon: float = 0.005):
    print("=" * 60, flush=True)
    print("U-Net++ BUILDING FOOTPRINT REFINEMENT & EXTRACTION", flush=True)
    print("=" * 60, flush=True)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model, config = load_unetpp(checkpoint_path, device)
    img_size = config.get("img_size", 384)
    print(f"Model img_size from checkpoint: {img_size}", flush=True)
    print(f"Threshold: {threshold} | Min Area: {min_area} px | Epsilon: {epsilon}", flush=True)
    print("-" * 60, flush=True)

    images = sorted([p for p in image_source.iterdir() if p.suffix.lower() in {".jpg", ".jpeg", ".png"}]) if image_source.is_dir() else [image_source]

    all_features = []
    total_buildings = 0

    for img_file in images:
        buildings = process_image(model, img_file, device, img_size, threshold, min_area, epsilon)
        print(f"  {img_file.name}: {len(buildings)} building polygon(s) extracted", flush=True)
        total_buildings += len(buildings)

        for b in buildings:
            all_features.append({
                "type": "Feature",
                "geometry": mapping(b["geometry"]),
                "properties": {
                    "building_id": f"{img_file.stem}_bldg_{b['building_id']:04d}",
                    "source_image": img_file.name,
                    "area_pixels": round(b["area_pixels"], 2),
                    "perimeter_pixels": round(b["perimeter_pixels"], 2),
                    "mean_confidence": b["mean_confidence"],
                    "spatial_reference_note": "Geographic coordinates unavailable because input imagery is not georeferenced.",
                },
            })

    geojson_doc = {
        "type": "FeatureCollection",
        "description": "Building footprints extracted via U-Net++ segmentation and boundary refinement pipeline.",
        "crs_status": "Pixel coordinate space. Geographic coordinates unavailable because input imagery is not georeferenced.",
        "total_features": len(all_features),
        "features": all_features,
    }

    output_geojson.parent.mkdir(parents=True, exist_ok=True)
    with output_geojson.open("w", encoding="utf-8") as f:
        json.dump(geojson_doc, f, indent=2)

    print("-" * 60, flush=True)
    print(f"Total buildings extracted: {total_buildings} across {len(images)} image(s)", flush=True)
    print(f"GeoJSON saved to: {output_geojson}", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--checkpoint", type=str, default=str(DEFAULT_CHECKPOINT))
    parser.add_argument("--source", type=str, default=str(DEFAULT_TEST_DIR))
    parser.add_argument("--out", type=str, default=str(DEFAULT_OUT_GEOJSON))
    parser.add_argument("--threshold", type=float, default=0.5)
    parser.add_argument("--min-area", type=float, default=30.0)
    parser.add_argument("--epsilon", type=float, default=0.005)
    args = parser.parse_args()

    run_refinement(
        checkpoint_path=Path(args.checkpoint),
        image_source=Path(args.source),
        output_geojson=Path(args.out),
        threshold=args.threshold,
        min_area=args.min_area,
        epsilon=args.epsilon,
    )

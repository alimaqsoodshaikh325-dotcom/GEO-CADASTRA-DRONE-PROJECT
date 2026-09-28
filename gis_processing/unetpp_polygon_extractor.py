"""U-Net++ polygon extraction for the GIS pipeline.

This module loads the verified U-Net++ checkpoint from the building_segmentation
training code and infers building masks in the same image normalization and model
configuration used by the project evaluation code.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np
import rasterio
import segmentation_models_pytorch as smp
import torch
from shapely.geometry import Polygon
from shapely.geometry.base import BaseGeometry


@dataclass
class BuildingDetection:
    building_id: str
    confidence: float
    bbox_px: tuple[float, float, float, float]
    geometry_px: BaseGeometry
    mask: np.ndarray | None = None


def load_unetpp_model(checkpoint_path: str | Path, device: torch.device):
    # PyTorch 2.6+ changed torch.load() default to weights_only=True.
    # This trusted local project checkpoint requires weights_only=False
    # because it contains non-tensor Python objects (config dicts, etc.)
    # that are part of the expected checkpoint structure.
    # The checkpoint is always a local project artifact, never untrusted.
    checkpoint = torch.load(checkpoint_path, map_location=device, weights_only=False)
    config = checkpoint.get('config', {})
    encoder_name = config.get('encoder', 'resnet18')
    try:
        model = smp.UnetPlusPlus(
            encoder_name=encoder_name,
            encoder_weights=None,
            in_channels=3,
            classes=1,
            encoder_depth=4,
            decoder_channels=(128, 64, 32, 16),
        )
        model.load_state_dict(checkpoint['model_state_dict'])
    except Exception:
        model = smp.UnetPlusPlus(
            encoder_name=encoder_name,
            encoder_weights=None,
            in_channels=3,
            classes=1,
        )
        model.load_state_dict(checkpoint['model_state_dict'])
    model.to(device)
    model.eval()
    return model, config


def _preprocess_rgb(rgb_image: np.ndarray, img_size: int) -> torch.Tensor:
    mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
    std = np.array([0.229, 0.224, 0.225], dtype=np.float32)
    resized = cv2.resize(rgb_image, (img_size, img_size), interpolation=cv2.INTER_LINEAR)
    img_float = (resized / 255.0).astype(np.float32)
    img_norm = (img_float - mean) / std
    return torch.from_numpy(img_norm.transpose(2, 0, 1)).unsqueeze(0)


def _refine_mask(binary_mask: np.ndarray, open_k: int = 3, close_k: int = 3) -> np.ndarray:
    clean = binary_mask.copy()
    if open_k > 1:
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (open_k, open_k))
        clean = cv2.morphologyEx(clean, cv2.MORPH_OPEN, kernel)
    if close_k > 1:
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (close_k, close_k))
        clean = cv2.morphologyEx(clean, cv2.MORPH_CLOSE, kernel)
    return clean


def _polygon_from_mask(component_mask: np.ndarray, prob_map: np.ndarray) -> Polygon | None:
    contours, _ = cv2.findContours(component_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None

    best_polygon = None
    best_area = -1.0
    for contour in contours:
        area = cv2.contourArea(contour)
        if area < 5:
            continue
        epsilon = 0.005 * cv2.arcLength(contour, closed=True)
        approx = cv2.approxPolyDP(contour, epsilon, closed=True)
        points = approx.squeeze()
        if len(points.shape) != 2 or points.shape[0] < 3:
            continue
        coords = [[float(x), float(y)] for x, y in points]
        if coords[0] != coords[-1]:
            coords.append(coords[0])
        polygon = Polygon(coords)
        if polygon.is_empty or polygon.area <= 0:
            continue
        if polygon.is_valid:
            valid_polygon = polygon
        else:
            valid_polygon = polygon.buffer(0)
        if valid_polygon.is_empty:
            continue
        if valid_polygon.geom_type == 'Polygon':
            candidate = valid_polygon
        else:
            candidate = valid_polygon
        if candidate.area > best_area:
            best_polygon = candidate
            best_area = candidate.area
    return best_polygon


def extract_buildings(image_path: str | Path, model_path: str | Path, confidence: float = 0.5, imgsz: int = 384, min_area: int = 30) -> list[BuildingDetection]:
    model_path = Path(model_path)
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    model, config = load_unetpp_model(model_path, device)
    model_size = int(config.get('img_size', imgsz))

    with rasterio.open(image_path) as dataset:
        if dataset.count < 3:
            raise ValueError(f'Raster {image_path} does not contain at least 3 bands for RGB processing.')
        rgb = dataset.read([1, 2, 3]) if dataset.count >= 3 else dataset.read()

    rgb = np.moveaxis(rgb, 0, -1)
    if rgb.dtype != np.uint8:
        rgb = np.clip(rgb, 0, 255).astype(np.uint8)
    orig_h, orig_w = rgb.shape[:2]

    tensor = _preprocess_rgb(rgb, model_size).to(device)
    with torch.no_grad():
        logits = model(tensor)
        prob_map = torch.sigmoid(logits).squeeze().cpu().numpy()

    prob_full = cv2.resize(prob_map, (orig_w, orig_h), interpolation=cv2.INTER_LINEAR)
    mask = (prob_full >= confidence).astype(np.uint8) * 255
    mask = _refine_mask(mask, open_k=3, close_k=3)

    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    detections: list[BuildingDetection] = []

    for label in range(1, num_labels):
        area = stats[label, cv2.CC_STAT_AREA]
        if area < min_area:
            continue

        component_mask = (labels == label).astype(np.uint8) * 255
        polygon = _polygon_from_mask(component_mask, prob_full)
        if polygon is None:
            continue

        bounds = polygon.bounds
        mean_conf = float(prob_full[(labels == label)].mean()) if (labels == label).any() else float(confidence)
        detections.append(
            BuildingDetection(
                building_id=f'B{len(detections) + 1:03d}',
                confidence=mean_conf,
                bbox_px=(bounds[0], bounds[1], bounds[2], bounds[3]),
                geometry_px=polygon,
                mask=component_mask,
            )
        )

    return detections

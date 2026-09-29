"""U-Net++ building extraction for the GIS pipeline.

This module loads the verified project checkpoint and extracts building footprints
in pixel coordinates before the georeferencing step converts them to the raster CRS.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np
import rasterio
import segmentation_models_pytorch as smp
import torch
from rasterio.enums import Resampling
from shapely.affinity import scale, translate
from shapely.geometry import Polygon
from shapely.geometry.base import BaseGeometry

MAX_FULL_RESOLUTION_IMAGE_PIXELS = 1_000_000
CPU_UNETPP_IMAGE_SIZE = 320
CPU_MASKRCNN_TRANSFORM_SIZE = 512


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
    # because it contains non-tensor Python objects (config dicts, etc.).
    checkpoint_options = {'map_location': device, 'weights_only': False}
    if device.type == 'cpu':
        torch.set_num_threads(1)
        checkpoint_options['mmap'] = True
    checkpoint = torch.load(checkpoint_path, **checkpoint_options)
    if not isinstance(checkpoint, dict):
        raise TypeError(f'Checkpoint at {checkpoint_path} is not a dictionary payload.')
    config = checkpoint.get('config', {})
    encoder_name = config.get('encoder', 'resnet18')

    def build_model(**kwargs):
        if device.type == 'cpu':
            with torch.device('meta'):
                return smp.UnetPlusPlus(**kwargs)
        return smp.UnetPlusPlus(**kwargs)

    load_options = {'assign': True} if device.type == 'cpu' else {}
    try:
        model = build_model(
            encoder_name=encoder_name,
            encoder_weights=None,
            in_channels=3,
            classes=1,
            encoder_depth=4,
            decoder_channels=(128, 64, 32, 16),
        )
        model.load_state_dict(checkpoint['model_state_dict'], **load_options)
    except Exception:
        model = build_model(
            encoder_name=encoder_name,
            encoder_weights=None,
            in_channels=3,
            classes=1,
        )
        if 'model_state_dict' not in checkpoint:
            raise KeyError(f'Checkpoint at {checkpoint_path} does not contain model_state_dict.')
        model.load_state_dict(checkpoint['model_state_dict'], **load_options)
    del checkpoint
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
    cleaned = binary_mask.copy()
    if open_k > 1:
        open_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (open_k, open_k))
        cleaned = cv2.morphologyEx(cleaned, cv2.MORPH_OPEN, open_kernel)
    if close_k > 1:
        close_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (close_k, close_k))
        cleaned = cv2.morphologyEx(cleaned, cv2.MORPH_CLOSE, close_kernel)
    return cleaned


def _polygon_from_component(component_mask: np.ndarray) -> Polygon | None:
    from shapely.geometry import Polygon

    contours, _ = cv2.findContours(component_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None
    best_polygon = None
    best_area = -1.0
    for contour in contours:
        area = cv2.contourArea(contour)
        if area < 5:
            continue
        epsilon = 0.005 * cv2.arcLength(contour, True)
        approx = cv2.approxPolyDP(contour, epsilon, True)
        if len(approx) < 3:
            continue
        coords = [(float(x), float(y)) for x, y in approx[:, 0, :]]
        if coords and coords[0] != coords[-1]:
            coords.append(coords[0])
        polygon = Polygon(coords)
        if polygon.is_empty or polygon.area <= 0 or not polygon.is_valid:
            polygon = polygon.buffer(0)
        if polygon.is_empty:
            continue
        if polygon.geom_type not in {'Polygon', 'MultiPolygon'}:
            continue
        if polygon.area > best_area:
            best_polygon = polygon
            best_area = polygon.area
    return best_polygon


def _extract_buildings_yolo(image_path: str | Path, model_path: str | Path, confidence: float = 0.5, imgsz: int = 640, min_area: int = 30) -> list[BuildingDetection]:
    from ultralytics import YOLO
    model = YOLO(str(model_path))
    results = model(str(image_path), conf=confidence, imgsz=imgsz, verbose=False)[0]
    detections: list[BuildingDetection] = []

    if results.masks is not None and len(results.masks) > 0:
        if hasattr(results.masks, 'xy') and len(results.masks.xy) > 0:
            for idx, poly_pts in enumerate(results.masks.xy):
                if len(poly_pts) < 3:
                    continue
                coords = [(float(x), float(y)) for x, y in poly_pts]
                if coords and coords[0] != coords[-1]:
                    coords.append(coords[0])
                polygon = Polygon(coords)
                if polygon.is_empty or polygon.area < min_area:
                    continue
                if not polygon.is_valid:
                    polygon = polygon.buffer(0)
                if polygon.is_empty or polygon.geom_type not in {'Polygon', 'MultiPolygon'}:
                    continue
                bounds = polygon.bounds
                score = float(results.boxes.conf[idx]) if hasattr(results, 'boxes') and results.boxes is not None and len(results.boxes) > idx else float(confidence)
                detections.append(
                    BuildingDetection(
                        building_id=f'B{len(detections) + 1:03d}',
                        confidence=score,
                        bbox_px=(bounds[0], bounds[1], bounds[2], bounds[3]),
                        geometry_px=polygon,
                    )
                )
        elif hasattr(results.masks, 'data') and results.masks.data is not None:
            m_data = results.masks.data.cpu().numpy()
            with rasterio.open(image_path) as dataset:
                orig_h, orig_w = dataset.shape
            for idx in range(m_data.shape[0]):
                m_resized = cv2.resize(m_data[idx].astype(np.float32), (orig_w, orig_h), interpolation=cv2.INTER_LINEAR)
                bin_mask = (m_resized > 0.5).astype(np.uint8) * 255
                polygon = _polygon_from_component(bin_mask)
                if polygon is None or polygon.area < min_area:
                    continue
                bounds = polygon.bounds
                score = float(results.boxes.conf[idx]) if hasattr(results, 'boxes') and results.boxes is not None and len(results.boxes) > idx else float(confidence)
                detections.append(
                    BuildingDetection(
                        building_id=f'B{len(detections) + 1:03d}',
                        confidence=score,
                        bbox_px=(bounds[0], bounds[1], bounds[2], bounds[3]),
                        geometry_px=polygon,
                    )
                )
    return detections


def _extract_buildings_maskrcnn(image_path: str | Path, model_path: str | Path, confidence: float = 0.5, imgsz: int = 320, min_area: int = 30) -> list[BuildingDetection]:
    from torchvision.models.detection import maskrcnn_resnet50_fpn_v2
    from torchvision.models.detection.faster_rcnn import FastRCNNPredictor
    from torchvision.models.detection.mask_rcnn import MaskRCNNPredictor

    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    checkpoint_options = {'map_location': device, 'weights_only': False}
    if device.type == 'cpu':
        torch.set_num_threads(1)
        checkpoint_options['mmap'] = True
    ckpt = torch.load(model_path, **checkpoint_options)
    config = ckpt.get('config', {})
    model_img_size = config.get('img_size', imgsz)

    def build_model():
        if device.type == 'cpu':
            with torch.device('meta'):
                model = maskrcnn_resnet50_fpn_v2(weights=None)
        else:
            model = maskrcnn_resnet50_fpn_v2(weights=None)
        return model

    model = build_model()
    in_features = model.roi_heads.box_predictor.cls_score.in_features
    model.roi_heads.box_predictor = FastRCNNPredictor(in_features, 2)
    in_features_mask = model.roi_heads.mask_predictor.conv5_mask.in_channels
    dim_reduced = model.roi_heads.mask_predictor.conv5_mask.out_channels
    model.roi_heads.mask_predictor = MaskRCNNPredictor(in_features_mask, dim_reduced, 2)
    load_options = {'assign': True} if device.type == 'cpu' else {}
    model.load_state_dict(ckpt['model_state_dict'], **load_options)
    del ckpt
    if device.type == 'cpu':
        model.to(device, memory_format=torch.channels_last)
        model.transform.min_size = (min(CPU_MASKRCNN_TRANSFORM_SIZE, model_img_size * 2),)
        model.transform.max_size = min(CPU_MASKRCNN_TRANSFORM_SIZE, model_img_size * 2)
    else:
        model.to(device)
    model.eval()

    img_bgr = cv2.imread(str(image_path))
    if img_bgr is None:
        return []
    orig_h, orig_w = img_bgr.shape[:2]
    img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    del img_bgr
    img_resized = cv2.resize(img_rgb, (model_img_size, model_img_size), interpolation=cv2.INTER_LINEAR)
    del img_rgb
    img_tensor = torch.from_numpy(img_resized.transpose(2, 0, 1).copy()).float().div_(255.0)
    img_tensor = img_tensor.unsqueeze(0)
    if device.type == 'cpu':
        img_tensor = img_tensor.contiguous(memory_format=torch.channels_last)
    img_tensor = img_tensor.to(device)

    with torch.inference_mode():
        pred = model(img_tensor)[0]

    detections: list[BuildingDetection] = []
    for mask_index in torch.where(pred['scores'] >= confidence)[0].tolist():
        score = float(pred['scores'][mask_index].item())
        mask = pred['masks'][mask_index, 0].cpu().numpy()
        polygon = _polygon_from_component((mask > 0.5).astype(np.uint8) * 255)
        del mask
        if polygon is None:
            continue
        polygon = scale(polygon, xfact=orig_w / model_img_size, yfact=orig_h / model_img_size, origin=(0, 0))
        if polygon.area < min_area:
            continue
        bounds = polygon.bounds
        detections.append(
            BuildingDetection(
                building_id=f'B{len(detections) + 1:03d}',
                confidence=score,
                bbox_px=(bounds[0], bounds[1], bounds[2], bounds[3]),
                geometry_px=polygon,
            )
        )
    return detections


def _is_yolo_model(model_path: str | Path) -> bool:
    p_str = Path(model_path).as_posix().lower()
    return '/segment/' in p_str or 'yolo' in p_str or 'yolo11' in p_str


def _is_maskrcnn_model(model_path: str | Path) -> bool:
    p_str = Path(model_path).as_posix().lower()
    return '/maskrcnn/' in p_str or 'maskrcnn' in p_str or (p_str.endswith('.pth') and 'unet' not in p_str)


def extract_buildings(image_path: str | Path, model_path: str | Path, confidence: float = 0.5, imgsz: int = 384, min_area: int = 30) -> list[BuildingDetection]:
    if _is_yolo_model(model_path):
        return _extract_buildings_yolo(image_path, model_path, confidence=confidence, imgsz=640, min_area=min_area)
    if _is_maskrcnn_model(model_path):
        return _extract_buildings_maskrcnn(image_path, model_path, confidence=confidence, imgsz=320, min_area=min_area)

    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    model, config = load_unetpp_model(model_path, device)
    model_img_size = int(config.get('img_size', imgsz))
    if device.type == 'cpu':
        model_img_size = min(model_img_size, CPU_UNETPP_IMAGE_SIZE)

    with rasterio.open(image_path) as dataset:
        count = dataset.count
        if count not in {1} and count < 3:
            raise ValueError(f'Raster {image_path} must contain 1 or 3 bands for segmentation.')
        original_h, original_w = dataset.height, dataset.width
        if original_h * original_w > MAX_FULL_RESOLUTION_IMAGE_PIXELS:
            indexes = [1] if count == 1 else [1, 2, 3]
            rgb = dataset.read(
                indexes,
                out_shape=(len(indexes), model_img_size, model_img_size),
                resampling=Resampling.bilinear,
            )
            if count == 1:
                rgb = np.repeat(rgb[0][..., None], 3, axis=-1)
            else:
                rgb = np.moveaxis(rgb, 0, -1)
        elif count == 1:
            rgb = dataset.read(1)
            rgb = np.repeat(rgb[..., None], 3, axis=-1)
        else:
            rgb = np.dstack([dataset.read(1), dataset.read(2), dataset.read(3)])

    if rgb.dtype != np.uint8:
        rgb = np.clip(rgb, 0, 255).astype(np.uint8)

    tensor = _preprocess_rgb(rgb, model_img_size).to(device)
    del rgb
    with torch.inference_mode():
        logits = model(tensor)
        probs = torch.sigmoid(logits).squeeze().cpu().numpy()
    del logits, tensor, model

    if probs.ndim == 3:
        probs = probs[0]
    resized_probs = cv2.resize(probs.astype(np.float32), (original_w, original_h), interpolation=cv2.INTER_LINEAR)
    del probs
    binary_mask = cv2.compare(resized_probs, confidence, cv2.CMP_GE)
    binary_mask = _refine_mask(binary_mask, open_k=3, close_k=3)

    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(binary_mask, connectivity=8)
    del binary_mask
    detections: list[BuildingDetection] = []
    for label_index in range(1, num_labels):
        area = stats[label_index, cv2.CC_STAT_AREA]
        if area < min_area:
            continue
        left = stats[label_index, cv2.CC_STAT_LEFT]
        top = stats[label_index, cv2.CC_STAT_TOP]
        width = stats[label_index, cv2.CC_STAT_WIDTH]
        height = stats[label_index, cv2.CC_STAT_HEIGHT]
        component_mask = cv2.compare(
            labels[top:top + height, left:left + width],
            label_index,
            cv2.CMP_EQ,
        )
        polygon = _polygon_from_component(component_mask)
        if polygon is None:
            continue
        polygon = translate(polygon, xoff=left, yoff=top)
        bounds = polygon.bounds
        mean_conf = float(cv2.mean(
            resized_probs[top:top + height, left:left + width],
            mask=component_mask,
        )[0])
        detections.append(
            BuildingDetection(
                building_id=f'B{len(detections) + 1:03d}',
                confidence=mean_conf,
                bbox_px=(bounds[0], bounds[1], bounds[2], bounds[3]),
                geometry_px=polygon,
            )
        )
    del labels, stats, resized_probs
    return detections


def write_pixel_geojson(detections: list[BuildingDetection], output_path: str | Path) -> None:
    """Write explicitly pixel-space GeoJSON-like output with no CRS claim."""
    import json
    features = []
    for item in detections:
        features.append({
            'type': 'Feature',
            'properties': {'building_id': item.building_id, 'confidence': item.confidence, 'coordinate_space': 'pixel'},
            'geometry': item.geometry_px.__geo_interface__,
        })
    Path(output_path).write_text(json.dumps({'type': 'FeatureCollection', 'features': features}, indent=2), encoding='utf-8')


def save_image_visualization(image_path: str | Path, detections: list[BuildingDetection], output_path: str | Path) -> None:
    """Render detections on the original image for quick QA."""
    image = cv2.imread(str(image_path))
    if image is None:
        raise ValueError(f'Cannot read input image: {image_path}')
    for index, item in enumerate(detections):
        color = (int(80 + (index * 67) % 175), int(130 + (index * 83) % 125), int(50 + (index * 107) % 205))
        geometries = item.geometry_px.geoms if item.geometry_px.geom_type == 'MultiPolygon' else [item.geometry_px]
        for geometry in geometries:
            points = np.asarray(geometry.exterior.coords, dtype=np.int32)
            cv2.polylines(image, [points], True, color, 2)
        x, y, _, _ = item.bbox_px
        cv2.putText(image, f'{item.building_id} {item.confidence:.2f}', (int(x), max(18, int(y) - 6)), cv2.FONT_HERSHEY_SIMPLEX, .45, color, 1, cv2.LINE_AA)
    height, width = image.shape[:2]
    scale = min(1080 / width, 720 / height)
    resized = cv2.resize(image, (round(width * scale), round(height * scale)), interpolation=cv2.INTER_AREA if scale < 1 else cv2.INTER_CUBIC)
    canvas = np.zeros((720, 1080, 3), dtype=np.uint8)
    top, left = (720 - resized.shape[0]) // 2, (1080 - resized.shape[1]) // 2
    canvas[top:top + resized.shape[0], left:left + resized.shape[1]] = resized
    cv2.imwrite(str(output_path), canvas)

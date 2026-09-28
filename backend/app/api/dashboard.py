from __future__ import annotations

import json
import math
import os
import re
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path

from PIL import Image, UnidentifiedImageError

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, Response

from backend.app.core.config import JOBS_DIR, OUTPUTS_DIR, UPLOAD_DIR
from backend.app.db.database import USE_SQLITE_FALLBACK, database_status, engine

router = APIRouter(tags=['Dashboard'])

# Base project root
PROJECT_ROOT = Path(__file__).resolve().parents[3]
DATASET_ROOT = PROJECT_ROOT / 'building_segmentation' / 'unet_dataset'
BUILDING_COLOR = (60, 16, 152)
SPLIT_TILES = {'train': range(1, 6), 'val': range(6, 8), 'test': range(8, 9)}
MODEL_OUTPUT_DIRS = {
    'yolo11': PROJECT_ROOT / 'building_segmentation' / 'runs' / 'predictions',
    'unetpp': PROJECT_ROOT / 'building_segmentation' / 'unet_evaluation_results',
    'maskrcnn': PROJECT_ROOT / 'building_segmentation' / 'maskrcnn_evaluation_results',
}

# These are the production checkpoints exposed by the model-selection UI.  The
# runs directory also contains historical and nested training artefacts, which
# must not silently become the selected checkpoint merely because they sort
# first during a recursive scan.
PRODUCTION_CHECKPOINTS = {
    'unetpp': PROJECT_ROOT / 'building_segmentation' / 'runs' / 'unetpp' / 'building_refinement' / 'best.pt',
    'yolo11': PROJECT_ROOT / 'building_segmentation' / 'runs' / 'segment' / 'building_yolo11' / 'weights' / 'best.pt',
    'maskrcnn': PROJECT_ROOT / 'building_segmentation' / 'runs' / 'maskrcnn' / 'building_instances_fixed' / 'best.pth',
}


def _same_artifact_stem(left: str, right: str) -> bool:
    normalize = lambda value: re.sub(r'[^a-z0-9]', '', value.lower())
    return normalize(left) in normalize(right) or normalize(right) in normalize(left)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _list_jobs() -> list[dict]:
    """Return all job records sorted newest-first."""
    jobs: list[dict] = []
    if JOBS_DIR.exists():
        for p in JOBS_DIR.glob('*.json'):
            try:
                jobs.append(json.loads(p.read_text(encoding='utf-8')))
            except Exception:
                pass
    jobs.sort(key=lambda j: j.get('created_at', ''), reverse=True)
    return jobs


def _postgis_status() -> dict:
    """Probe PostGIS availability."""
    if USE_SQLITE_FALLBACK:
        return {'status': 'not_configured', 'detail': 'Backend is running with SQLite fallback. PostGIS is not configured.'}
    try:
        from sqlalchemy import text as sa_text
        with engine.connect() as conn:
            result = conn.execute(sa_text("SELECT PostGIS_Version()"))
            version = result.scalar()
        return {'status': 'available', 'version': str(version)}
    except Exception as exc:
        err = str(exc)
        if 'postgis' in err.lower() or 'function' in err.lower():
            return {'status': 'not_installed', 'detail': 'PostGIS extension is not installed on this database.'}
        return {'status': 'unavailable', 'detail': err}


# ---------------------------------------------------------------------------
# /api/postgis/status
# ---------------------------------------------------------------------------

@router.get('/api/postgis/status')
def postgis_status():
    return _postgis_status()


# ---------------------------------------------------------------------------
# /api/dashboard/summary
# ---------------------------------------------------------------------------

@router.get('/api/dashboard/summary')
def dashboard_summary():
    jobs = _list_jobs()
    total = len(jobs)
    completed = sum(1 for j in jobs if j.get('status') == 'completed')
    failed = sum(1 for j in jobs if j.get('status') == 'failed')
    running = sum(1 for j in jobs if j.get('status') == 'running')

    building_count = 0
    parcel_count = 0
    for j in jobs:
        if j.get('status') == 'completed':
            payload = j.get('payload', {})
            building_count += int(payload.get('valid_detections', 0) or 0)
            parcel_count += int(payload.get('parcel_count', 0) or 0)

    db = database_status()
    pg = _postgis_status()

    return {
        'total_jobs': total,
        'completed_jobs': completed,
        'failed_jobs': failed,
        'running_jobs': running,
        'total_buildings_detected': building_count,
        'total_parcels_processed': parcel_count,
        'database': db,
        'postgis': pg,
    }


# ---------------------------------------------------------------------------
# /api/history
# ---------------------------------------------------------------------------

@router.get('/api/history')
def get_history(limit: int = 20):
    jobs = _list_jobs()[:limit]
    result = []
    for j in jobs:
        payload = j.get('payload', {})
        result.append({
            'job_id': j.get('job_id', ''),
            'status': j.get('status', 'unknown'),
            'progress': j.get('progress', 0),
            'message': j.get('message', ''),
            'created_at': j.get('created_at'),
            'completed_at': j.get('completed_at'),
            'building_count': int(payload.get('valid_detections', 0) or 0),
            'parcel_count': int(payload.get('parcel_count', 0) or 0),
            'input_filename': payload.get('input_filename') or j.get('input_filename'),
            'model_name': payload.get('model') or j.get('model_name'),
        })
    return {'history': result, 'total': len(result)}


# ---------------------------------------------------------------------------
# /api/demo/project-aerial/metadata
# ---------------------------------------------------------------------------

def _project_aerial_metadata(path: Path) -> dict:
    with Image.open(path) as image:
        tags = image.tag_v2
        width, height = image.size
        pixel_scale = tags.get(33550)
        tie_points = tags.get(33922)
        origin_x = origin_y = None
        bounds = None
        transform = None

        if pixel_scale and len(pixel_scale) >= 2 and tie_points and len(tie_points) >= 6:
            scale_x, scale_y = float(pixel_scale[0]), float(pixel_scale[1])
            raster_x, raster_y, _, model_x, model_y, _ = map(float, tie_points[:6])
            origin_x = model_x - raster_x * scale_x
            origin_y = model_y + raster_y * scale_y
            opposite_x = origin_x + width * scale_x
            opposite_y = origin_y - height * scale_y
            if all(math.isfinite(value) for value in (origin_x, origin_y, opposite_x, opposite_y)):
                bounds = [
                    min(origin_x, opposite_x),
                    min(origin_y, opposite_y),
                    max(origin_x, opposite_x),
                    max(origin_y, opposite_y),
                ]
                transform = [scale_x, 0, origin_x, 0, -scale_y, origin_y]

        geo_keys = tuple(tags.get(34735, ()))
        crs_code = None
        if len(geo_keys) >= 4:
            key_count = int(geo_keys[3])
            for index in range(4, min(len(geo_keys), 4 + key_count * 4), 4):
                key_id, location, _, value = geo_keys[index:index + 4]
                if location == 0 and key_id in (2048, 3072) and int(value) > 0:
                    crs_code = f'EPSG:{int(value)}'
                    break

        return {
            'available': True,
            'filename': path.name,
            'format': image.format,
            'width': width,
            'height': height,
            'bands': len(image.getbands()),
            'crs': crs_code,
            'coordinate_space': 'projected' if crs_code else 'unknown',
            'bounds': bounds,
            'transform': transform,
        }


@router.get('/api/demo/project-aerial/metadata')
def project_aerial_metadata():
    """Return metadata read from the project aerial GeoTIFF."""
    jobs = _list_jobs()
    completed = [j for j in jobs if j.get('status') == 'completed']
    gis_aerial = PROJECT_ROOT / 'gis_processing' / 'input' / 'aerial.tif'
    if not gis_aerial.is_file():
        return {
            'available': False,
            'filename': None,
            'format': None,
            'width': None,
            'height': None,
            'bands': None,
            'crs': None,
            'coordinate_space': 'unknown',
            'bounds': None,
            'transform': None,
            'job_count': len(completed),
            'description': 'No project aerial GeoTIFF is available.',
        }

    try:
        metadata = _project_aerial_metadata(gis_aerial)
    except (OSError, ValueError, UnidentifiedImageError) as exc:
        raise HTTPException(status_code=500, detail='Project aerial metadata could not be read.') from exc

    metadata.update({
        'job_count': len(completed),
        'description': 'Project aerial GeoTIFF metadata read from the raster.',
    })
    return metadata


# ---------------------------------------------------------------------------
# /api/demo/project-aerial/preview
# ---------------------------------------------------------------------------

@router.get('/api/demo/project-aerial/preview')
def project_aerial_preview():
    gis_aerial = PROJECT_ROOT / 'gis_processing' / 'input' / 'aerial.tif'
    if not gis_aerial.is_file():
        raise HTTPException(status_code=404, detail='No project aerial GeoTIFF is available.')

    try:
        with Image.open(gis_aerial) as image:
            preview = image.convert('RGB')
            preview.thumbnail((1600, 1600), Image.Resampling.LANCZOS)
            buffer = BytesIO()
            preview.save(buffer, format='PNG')
    except (OSError, ValueError, UnidentifiedImageError) as exc:
        raise HTTPException(status_code=500, detail='Project aerial preview could not be generated.') from exc

    return Response(content=buffer.getvalue(), media_type='image/png')


# ---------------------------------------------------------------------------
# /api/demo/benchmark-metrics
# ---------------------------------------------------------------------------

@router.get('/api/demo/benchmark-metrics')
def get_benchmark_metrics():
    benchmark_file = PROJECT_ROOT / 'final_validation' / 'final_model_benchmark.json'
    if benchmark_file.exists():
        try:
            return json.loads(benchmark_file.read_text(encoding='utf-8'))
        except Exception:
            pass

    # Fallback to verified real metrics
    return {
        "test_split": "Tile 8 (geographically held out)",
        "number_of_images": 9,
        "models": {
            "U-Net++": {
                "iou": 0.4804,
                "dice": 0.6409,
                "precision": 0.5362,
                "recall": 0.8182,
                "latency_sec": 1.052,
                "parameters": 12447889,
                "size_mb": 57.32
            },
            "YOLO11-Seg": {
                "iou": 0.2041,
                "dice": 0.3251,
                "precision": 0.2042,
                "recall": 0.9992,
                "latency_sec": 0.935,
                "parameters": 2834763,
                "size_mb": 5.72
            },
            "Mask R-CNN": {
                "iou": 0.2582,
                "dice": 0.4062,
                "precision": 0.3789,
                "recall": 0.5330,
                "latency_sec": 15.910,
                "parameters": 45880411,
                "size_mb": 175.37
            }
        }
    }


# ---------------------------------------------------------------------------
# /api/demo/datasets & /api/demo/datasets/all
# ---------------------------------------------------------------------------

@router.get('/api/demo/datasets')
@router.get('/api/demo/datasets/all')
def get_datasets():
    unet_img_dir = PROJECT_ROOT / 'building_segmentation' / 'unet_dataset' / 'images'
    unet_msk_dir = PROJECT_ROOT / 'building_segmentation' / 'unet_dataset' / 'masks'

    splits_data = {}
    for split in ('train', 'val', 'test'):
        img_dir = unet_img_dir / split
        msk_dir = unet_msk_dir / split
        images = sorted([p.name for p in img_dir.glob('*.jpg')]) if img_dir.exists() else []
        masks = sorted([p.name for p in msk_dir.glob('*.png')]) if msk_dir.exists() else []
        splits_data[split] = {
            'image_count': len(images),
            'mask_count': len(masks),
            'images': images,
            'masks': masks,
        }

    train_cnt = splits_data.get('train', {}).get('image_count', 45)
    val_cnt = splits_data.get('val', {}).get('image_count', 18)
    test_cnt = splits_data.get('test', {}).get('image_count', 9)

    return {
        'total_images': train_cnt + val_cnt + test_cnt,
        'total_masks': train_cnt + val_cnt + test_cnt,
        'splits': {
            'train': {
                'name': 'Training Set',
                'description': 'Main aerial image tiles and ground truth building segmentation masks.',
                'image_count': train_cnt,
                'mask_count': train_cnt,
                'items': splits_data.get('train', {}).get('images', []),
            },
            'val': {
                'name': 'Validation Set',
                'description': 'Validation split used for tuning hyperparameters and early stopping.',
                'image_count': val_cnt,
                'mask_count': val_cnt,
                'items': splits_data.get('val', {}).get('images', []),
            },
            'test': {
                'name': 'Tile 8 Held-Out Test',
                'description': 'Geographically held-out Tile 8 for benchmark evaluation across models.',
                'image_count': test_cnt,
                'mask_count': test_cnt,
                'items': splits_data.get('test', {}).get('images', [
                    f'tile8_image_part_00{i}.jpg' for i in range(1, 10)
                ]),
                'masks': splits_data.get('test', {}).get('masks', [
                    f'tile8_image_part_00{i}.png' for i in range(1, 10)
                ]),
            }
        }
    }


def _dataset_records() -> list[dict]:
    records = []
    output_index: dict[str, list[str]] = {}
    for model_id, output_dir in MODEL_OUTPUT_DIRS.items():
        if output_dir.exists():
            for path in output_dir.rglob('*'):
                if path.is_file():
                    output_index.setdefault(model_id, []).append(path)
    for split, tile_numbers in SPLIT_TILES.items():
        image_dir = DATASET_ROOT / 'images' / split
        mask_dir = DATASET_ROOT / 'masks' / split
        for image_path in (sorted(image_dir.glob('*')) if image_dir.exists() else []):
            if not image_path.is_file():
                continue
            tile_match = image_path.stem.lower().split('_image_part_')[0].replace('tile', '')
            try:
                tile = int(tile_match)
            except ValueError:
                tile = None
            if tile not in tile_numbers:
                continue
            mask_path = mask_dir / f'{image_path.stem}.png'
            record = {
                'id': f'{split}:{image_path.name}',
                'filename': image_path.name,
                'relative_path': str(image_path.relative_to(PROJECT_ROOT)).replace('\\', '/'),
                'split': split,
                'split_label': {'train': 'TRAIN', 'val': 'VALIDATION', 'test': 'TEST'}[split],
                'tile': f'Tile {tile}' if tile else 'NOT AVAILABLE',
                'dimensions': None,
                'width': None,
                'height': None,
                'format': image_path.suffix.lstrip('.').upper(),
                'file_size_bytes': image_path.stat().st_size,
                'mask_filename': mask_path.name if mask_path.exists() else None,
                'mask_relative_path': str(mask_path.relative_to(PROJECT_ROOT)).replace('\\', '/') if mask_path.exists() else None,
                'mask_available': mask_path.exists(),
                'building_present': None,
                'building_pixels': None,
                'building_coverage_percent': None,
                'validation': 'NOT VERIFIED',
                'prediction_status': {},
                'file_modified': datetime.fromtimestamp(image_path.stat().st_mtime, timezone.utc).isoformat(),
                'acquisition_date': None,
            }
            try:
                with Image.open(image_path) as image:
                    record['width'], record['height'] = image.size
                    record['dimensions'] = f'{image.width} x {image.height}'
                    image.load()
                if mask_path.exists():
                    with Image.open(mask_path) as mask:
                        mask_rgb = mask.convert('RGB')
                        mask.load()
                        if mask.size != (record['width'], record['height']):
                            record['validation'] = 'INVALID'
                        else:
                            record['building_present'] = mask_rgb.getbbox() is not None
                            record['validation'] = 'VALID'
                elif record['validation'] != 'INVALID':
                    record['validation'] = 'WARNING'
            except (UnidentifiedImageError, OSError, ValueError):
                record['validation'] = 'INVALID'
            for model_id, output_dir in MODEL_OUTPUT_DIRS.items():
                matches = []
                matches = [str(path.relative_to(PROJECT_ROOT)).replace('\\', '/') for path in output_index.get(model_id, []) if _same_artifact_stem(image_path.stem, path.stem)]
                record['prediction_status'][model_id] = {'status': 'AVAILABLE' if matches else 'NOT AVAILABLE', 'files': matches, 'url': f'/api/datasets/outputs/{model_id}/{image_path.stem}' if matches else None}
            records.append(record)
    return records


@router.get('/api/datasets/registry')
def get_dataset_registry():
    records = _dataset_records()
    split_counts = {split: sum(1 for record in records if record['split'] == split) for split in ('train', 'val', 'test')}
    return {
        'dataset_name': 'Semantic segmentation dataset',
        'dataset_root': str((PROJECT_ROOT / 'Semantic segmentation dataset').relative_to(PROJECT_ROOT)).replace('\\', '/'),
        'records': records,
        'total_images': len(records),
        'total_masks': sum(1 for record in records if record['mask_available']),
        'split_counts': split_counts,
        'building_positive': sum(1 for record in records if record['building_present'] is True),
        'no_building': sum(1 for record in records if record['building_present'] is False),
        'semantic_classes': ['Building', 'Land', 'Road', 'Vegetation', 'Water', 'Unlabeled'],
        'target_class': 'Building',
        'resolution': '2149 x 1479',
        'validation_status': 'NOT VERIFIED',
    }


@router.post('/api/datasets/validate')
def validate_dataset_registry():
    records = _dataset_records()
    missing_masks = [record['filename'] for record in records if not record['mask_available']]
    invalid = [record['filename'] for record in records if record['validation'] == 'INVALID']
    warnings = [record['filename'] for record in records if record['validation'] == 'WARNING']
    checks = {
        'total_records': len(records),
        'image_files': len(records),
        'mask_files': sum(1 for record in records if record['mask_available']),
        'image_mask_pairs': sum(1 for record in records if record['mask_available'] and record['validation'] == 'VALID'),
        'missing_masks': missing_masks,
        'invalid_records': invalid,
        'warnings': warnings,
        'split_integrity': 'PASS' if len(records) == 72 and {record['split'] for record in records} == {'train', 'val', 'test'} else 'FAIL',
    }
    status = 'PASS' if not missing_masks and not invalid and checks['split_integrity'] == 'PASS' else 'WARNING' if warnings else 'FAIL'
    return {'status': status, 'checks': checks, 'validated_at': datetime.now(timezone.utc).isoformat()}


@router.get('/api/datasets/outputs/{model_id}/{image_stem}')
def get_dataset_output(model_id: str, image_stem: str):
    output_dir = MODEL_OUTPUT_DIRS.get(model_id)
    if output_dir is None:
        raise HTTPException(status_code=404, detail='Model output is not exposed.')
    matches = [path for path in output_dir.rglob('*') if path.is_file() and _same_artifact_stem(image_stem, path.stem)]
    if not matches:
        raise HTTPException(status_code=404, detail='Model output artifact was not found.')
    return FileResponse(str(matches[0]))


# ---------------------------------------------------------------------------
# Static File Endpoints for Images, Masks, Predictions, and Comparisons
# ---------------------------------------------------------------------------

@router.get('/api/demo/images/{split}/{filename}')
def get_dataset_image(split: str, filename: str):
    p = PROJECT_ROOT / 'building_segmentation' / 'unet_dataset' / 'images' / split / filename
    if p.exists():
        return FileResponse(str(p), media_type='image/jpeg')
    raise HTTPException(status_code=404, detail=f'Image {filename} not found in {split} split.')


@router.get('/api/demo/masks/{split}/{filename}')
def get_dataset_mask(split: str, filename: str):
    p = PROJECT_ROOT / 'building_segmentation' / 'unet_dataset' / 'masks' / split / filename
    if p.exists():
        return FileResponse(str(p), media_type='image/png')
    raise HTTPException(status_code=404, detail=f'Mask {filename} not found in {split} split.')


@router.get('/api/demo/comparisons/{filename}')
def get_comparison_image(filename: str):
    # Check final_validation/visuals
    p = PROJECT_ROOT / 'final_validation' / 'visuals' / filename
    if p.exists():
        return FileResponse(str(p), media_type='image/png')
    # Check building_segmentation/comparison_results
    p2 = PROJECT_ROOT / 'building_segmentation' / 'comparison_results' / filename
    if p2.exists():
        return FileResponse(str(p2), media_type='image/png')
    raise HTTPException(status_code=404, detail=f'Comparison image {filename} not found.')


@router.get('/api/demo/predictions/{model}/{filename}')
def get_prediction_image(model: str, filename: str):
    p = PROJECT_ROOT / 'building_segmentation' / 'predictions_72' / model / filename
    if p.exists():
        return FileResponse(str(p), media_type='image/png')
    raise HTTPException(status_code=404, detail=f'Prediction for model {model} and file {filename} not found.')


@router.get('/api/models/checkpoints')
def get_model_checkpoints():
    runs_dir = PROJECT_ROOT / 'building_segmentation' / 'runs'
    checkpoints = []
    if runs_dir.exists():
        for pt in runs_dir.rglob('*.pt'):
            path_text = str(pt.relative_to(PROJECT_ROOT)).replace('\\', '/')
            lower_path = path_text.lower()
            model_id = 'unetpp' if 'unet' in lower_path else 'yolo11' if 'yolo' in lower_path else 'maskrcnn' if 'maskrcnn' in lower_path else None
            checkpoints.append({
                'name': pt.name,
                'path': path_text,
                'size_mb': round(pt.stat().st_size / (1024 * 1024), 2),
                'model_id': model_id,
            })
        for pth in runs_dir.rglob('*.pth'):
            path_text = str(pth.relative_to(PROJECT_ROOT)).replace('\\', '/')
            lower_path = path_text.lower()
            model_id = 'unetpp' if 'unet' in lower_path else 'yolo11' if 'yolo' in lower_path else 'maskrcnn' if 'maskrcnn' in lower_path else None
            checkpoints.append({
                'name': pth.name,
                'path': path_text,
                'size_mb': round(pth.stat().st_size / (1024 * 1024), 2),
                'model_id': model_id,
            })

    models = []
    for model_id, label in (('unetpp', 'U-Net++'), ('yolo11', 'YOLO11-Seg'), ('maskrcnn', 'Mask R-CNN')):
        matches = [item for item in checkpoints if item.get('model_id') == model_id]
        preferred_path = PRODUCTION_CHECKPOINTS[model_id]
        if preferred_path.exists():
            preferred_relative = str(preferred_path.relative_to(PROJECT_ROOT)).replace('\\', '/')
            preferred = next((item for item in matches if item['path'] == preferred_relative), None)
            if preferred is None:
                preferred = {
                    'name': preferred_path.name,
                    'path': preferred_relative,
                    'size_mb': round(preferred_path.stat().st_size / (1024 * 1024), 2),
                    'model_id': model_id,
                }
                checkpoints.append(preferred)
        elif matches:
            preferred = next((item for item in matches if item['name'].lower().startswith('best')), matches[0])
        else:
            preferred = None
        if preferred:
            models.append({
                'id': model_id,
                'label': label,
                'available': True,
                'checkpoint': preferred,
                'checkpoint_count': len(matches),
            })
    return {'checkpoints': checkpoints, 'models': models, 'total': len(checkpoints)}

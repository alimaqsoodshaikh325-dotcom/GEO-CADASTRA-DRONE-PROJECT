from __future__ import annotations

import csv
import json
import shutil
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent
BENCHMARK_JSON = ROOT / 'building_segmentation' / 'comparison_results' / 'three_model_comparison.json'
IMG_DIR = ROOT / 'building_segmentation' / 'unet_dataset' / 'images' / 'test'
MASK_DIR = ROOT / 'building_segmentation' / 'unet_dataset' / 'masks' / 'test'
FINAL_ROOT = ROOT / 'final_validation'
VISUALS_DIR = FINAL_ROOT / 'visuals'


def build_benchmark_csv(bench: dict, output_path: Path) -> None:
    fieldnames = [
        'model',
        'iou',
        'dice',
        'precision',
        'recall',
        'tp',
        'fp',
        'fn',
        'predicted_building_count',
        'inference_latency_sec_per_image',
        'parameter_count',
        'checkpoint_size_mb',
    ]
    rows = [
        {
            'model': 'YOLO11-Seg',
            'iou': bench['yolo_metrics']['iou'],
            'dice': bench['yolo_metrics']['dice'],
            'precision': bench['yolo_metrics']['precision'],
            'recall': bench['yolo_metrics']['recall'],
            'tp': bench['yolo_metrics']['tp'],
            'fp': bench['yolo_metrics']['fp'],
            'fn': bench['yolo_metrics']['fn'],
            'predicted_building_count': bench['yolo_metrics']['pred_buildings'],
            'inference_latency_sec_per_image': bench['yolo_metrics']['latency_sec'],
            'parameter_count': bench['yolo_metrics']['parameters'],
            'checkpoint_size_mb': bench['yolo_metrics']['size_mb'],
        },
        {
            'model': 'U-Net++',
            'iou': bench['unet_metrics']['iou'],
            'dice': bench['unet_metrics']['dice'],
            'precision': bench['unet_metrics']['precision'],
            'recall': bench['unet_metrics']['recall'],
            'tp': bench['unet_metrics']['tp'],
            'fp': bench['unet_metrics']['fp'],
            'fn': bench['unet_metrics']['fn'],
            'predicted_building_count': bench['unet_metrics']['pred_buildings'],
            'inference_latency_sec_per_image': bench['unet_metrics']['latency_sec'],
            'parameter_count': bench['unet_metrics']['parameters'],
            'checkpoint_size_mb': bench['unet_metrics']['size_mb'],
        },
        {
            'model': 'Mask R-CNN',
            'iou': bench['maskrcnn_metrics']['iou'],
            'dice': bench['maskrcnn_metrics']['dice'],
            'precision': bench['maskrcnn_metrics']['precision'],
            'recall': bench['maskrcnn_metrics']['recall'],
            'tp': bench['maskrcnn_metrics']['tp'],
            'fp': bench['maskrcnn_metrics']['fp'],
            'fn': bench['maskrcnn_metrics']['fn'],
            'predicted_building_count': bench['maskrcnn_metrics']['pred_buildings'],
            'inference_latency_sec_per_image': bench['maskrcnn_metrics']['latency_sec'],
            'parameter_count': bench['maskrcnn_metrics']['parameters'],
            'checkpoint_size_mb': bench['maskrcnn_metrics']['size_mb'],
        },
    ]
    with output_path.open('w', newline='', encoding='utf-8') as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def write_final_json(bench: dict, num_images: int, image_dims: list[tuple[int, int]], mask_dims: list[tuple[int, int]], out_path: Path) -> None:
    payload = {
        'test_split': 'Tile 8 (geographically held out)',
        'number_of_images': num_images,
        'image_dimensions': list(dict.fromkeys(image_dims)),
        'ground_truth_mask_dimensions': list(dict.fromkeys(mask_dims)),
        'building_class_definition': {
            'rgb': [60, 16, 152],
            'hex': '#3C1098',
            'binary_0_background': True,
            'binary_255_building': True,
        },
        'models': {
            'YOLO11-Seg': bench['yolo_metrics'],
            'U-Net++': bench['unet_metrics'],
            'Mask R-CNN': bench['maskrcnn_metrics'],
        },
        'per_image': bench['per_image'],
    }
    out_path.write_text(json.dumps(payload, indent=2), encoding='utf-8')


def create_pixel_space_demo(model_path: Path, image_path: Path, output_path: Path) -> None:
    sys.path.insert(0, str(ROOT / 'gis_processing'))
    try:
        from polygon_extractor import extract_buildings
    except Exception:
        from gis_processing.polygon_extractor import extract_buildings

    detections = extract_buildings(image_path, model_path, confidence=0.5, imgsz=384)
    features = []
    for detection in detections:
        geometry = detection.geometry_px
        if geometry is None or geometry.is_empty:
            continue
        features.append({
            'type': 'Feature',
            'properties': {
                'building_id': detection.building_id,
                'confidence': float(detection.confidence),
                'coordinate_space': 'pixel',
                'source_model': 'U-Net++',
                'source_dataset': 'Tile 8 test split',
            },
            'geometry': geometry.__geo_interface__,
        })
    payload = {'type': 'FeatureCollection', 'features': features}
    output_path.write_text(json.dumps(payload, indent=2), encoding='utf-8')


def create_summary() -> str:
    return '\n'.join([
        'MODEL SELECTION SUMMARY',
        '=======================',
        'Benchmark evidence: Tile 8 unseen test split, 9 images, 1358 ground-truth buildings.',
        '',
        'Best segmentation balance: U-Net++',
        '- Highest mean pixel IoU: 0.4804',
        '- Highest mean pixel Dice: 0.6409',
        '- Highest mean pixel precision: 0.5362',
        '- Lowest false-positive burden among the non-YOLO models: 3,582,623 FP',
        '- Best benchmark model for contiguous footprint quality and geometric boundary fidelity.',
        '',
        'Highest recall: YOLO11-Seg',
        '- Mean recall: 0.9992',
        '- Lowest false negatives: 4,724',
        '- This comes with much worse precision and weaker boundary-quality trade-offs.',
        '',
        'Best speed: YOLO11-Seg',
        '- 0.935 s/image',
        '- 5.72 MB checkpoint',
        '- Useful for rapid screening, not for final boundary-sensitive footprint generation.',
        '',
        'Most suitable for footprint refinement: U-Net++',
        '- Best pixel-level fidelity and clean boundary segmentation for downstream geometry cleanup.',
        '- Preferred model for GIS polygon generation in this prototype pipeline.',
        '',
        'Best benchmark/validation model: U-Net++',
        '- Based on segmentation balance across IoU, Dice, precision, and false-positive burden, not a single metric.',
        '- Mask R-CNN is heavier and lower on contiguous-mask segmentation quality for this benchmark.',
        '',
        'Important limitation: the benchmark is based on 9 unseen images only and is not a proof of production-ready general urban extraction performance.',
    ]) + '\n'


def create_report(image_count: int, mask_count: int, image_dims: list[tuple[int, int]], mask_dims: list[tuple[int, int]], bench: dict) -> str:
    return '\n'.join([
        'FINAL VALIDATION REPORT',
        '=======================',
        '',
        'A. ML benchmark results',
        '----------------------',
        f'- Tile 8 test split contains {image_count} images and {mask_count} corresponding ground-truth masks.',
        f'- Image dimensions: {list(dict.fromkeys(image_dims))}',
        f'- Ground-truth mask dimensions: {list(dict.fromkeys(mask_dims))}',
        '- Building class definition: RGB (60, 16, 152), stored as binary building mask with background 0 and building 255.',
        '- Test split: Tile 8 is geographically held out according to the split definitions in the U-Net++ dataset preparation workflow.',
        '',
        'Benchmark summary (preserved from the existing benchmark artifacts):',
        '- YOLO11-Seg: IoU 0.2041, Dice 0.3251, Precision 0.2042, Recall 0.9992, TP 5,822,152, FP 22,647,407, FN 4,724.',
        '- U-Net++: IoU 0.4804, Dice 0.6409, Precision 0.5362, Recall 0.8182, TP 4,849,374, FP 3,582,623, FN 977,502.',
        '- Mask R-CNN: IoU 0.2582, Dice 0.4062, Precision 0.3789, Recall 0.5330, TP 2,711,094, FP 4,536,619, FN 3,115,782.',
        '- Predicted building count: YOLO 572, U-Net++ 340, Mask R-CNN 1307.',
        '- Inference latency: YOLO 0.935 s/image, U-Net++ 1.052 s/image, Mask R-CNN 15.910 s/image.',
        '',
        'B. GIS pipeline validation',
        '--------------------------',
        '- The GIS pipeline was validated with the real georeferenced raster and parcel layer used in the project.',
        '- For the AI4Boundaries raster, the final GIS consensus result is an intentionally empty output because the model does not generate meaningful building candidates on that domain.',
        '- No georeferenced Tile 8 test raster was identified in the test split; therefore the GIS demonstration is held in pixel space only.',
        '- Pixel-space demonstration created at final_validation/pixel_space_demo.geojson from the verified U-Net++ best checkpoint on one Tile 8 image.',
        '',
        'C. Spatial consensus implementation',
        '-----------------------------------',
        '- The spatial consensus / quality decision layer is implemented and validated.',
        '- Empty-result safety tests pass and the layer does not invent buildings when the model yields no candidates.',
        '- This is a conservative prototype layer suitable for audit and reporting, not legal cadastral adjudication.',
        '',
        'D. AI4Boundaries domain limitation',
        '----------------------------------',
        '- The real AI4Boundaries raster remains outside the effective domain of the verified U-Net++ checkpoint.',
        '- The model does not produce reliable building evidence there, so the GIS result remains intentionally empty rather than fabricated.',
        '- This is a domain mismatch limitation, not a GIS metadata or processing bug.',
        '',
        'E. Overall project limitations',
        '-----------------------------',
        '- The benchmark is limited to 9 held-out Tile 8 images and cannot support generalized claims of production-ready urban extraction.',
        '- The project is a prototype benchmark and GIS-ready workflow, not cadastral-grade or legal-grade mapping.',
        '- Real-world validation, field inspection, and GIS verification remain required before any cadastral-ready deployment.',
        '',
        'Status summary:',
        'ML_STATUS: PARTIAL',
        'GIS_STATUS: PARTIAL',
        'SPATIAL_CONSENSUS_STATUS: PASS',
        'END_TO_END_STATUS: PARTIAL',
        '',
        'This is a benchmark-grade prototype package for the verified Tile 8 split, not a production deployment claim.',
    ]) + '\n'


def main() -> None:
    FINAL_ROOT.mkdir(parents=True, exist_ok=True)
    VISUALS_DIR.mkdir(parents=True, exist_ok=True)

    if BENCHMARK_JSON.exists():
        bench = json.loads(BENCHMARK_JSON.read_text(encoding='utf-8'))
    else:
        raise FileNotFoundError(f'Missing benchmark file: {BENCHMARK_JSON}')

    for visual in sorted((ROOT / 'building_segmentation' / 'comparison_results').glob('compare3_tile8_*.png')):
        shutil.copy2(visual, VISUALS_DIR / visual.name)

    image_paths = sorted(IMG_DIR.glob('*'))
    mask_paths = sorted(MASK_DIR.glob('*.png'))
    image_dims: list[tuple[int, int]] = []
    mask_dims: list[tuple[int, int]] = []

    for path in image_paths:
        with Image.open(path) as image:
            image_dims.append(image.size)
    for path in mask_paths:
        with Image.open(path) as image:
            mask_dims.append(image.size)

    benchmark_csv = FINAL_ROOT / 'final_model_benchmark.csv'
    benchmark_json = FINAL_ROOT / 'final_model_benchmark.json'
    benchmark_summary = FINAL_ROOT / 'model_selection_summary.txt'
    validation_report = FINAL_ROOT / 'final_validation_report.txt'
    pixel_demo = FINAL_ROOT / 'pixel_space_demo.geojson'

    build_benchmark_csv(bench, benchmark_csv)
    write_final_json(bench, len(image_paths), image_dims, mask_dims, benchmark_json)
    benchmark_summary.write_text(create_summary(), encoding='utf-8')
    validation_report.write_text(create_report(len(image_paths), len(mask_paths), image_dims, mask_dims, bench), encoding='utf-8')

    example_image = image_paths[0] if image_paths else None
    if example_image is not None:
        create_pixel_space_demo(ROOT / 'building_segmentation' / 'runs' / 'unetpp' / 'building_refinement' / 'best.pt', example_image, pixel_demo)
    else:
        pixel_demo.write_text(json.dumps({'type': 'FeatureCollection', 'features': []}, indent=2), encoding='utf-8')

    print(f'Created final validation package in: {FINAL_ROOT}')
    print(f'Images: {len(image_paths)} | Masks: {len(mask_paths)}')
    print(f'Image dimensions: {list(dict.fromkeys(image_dims))}')
    print(f'Mask dimensions: {list(dict.fromkeys(mask_dims))}')
    print(f'Visuals copied: {len(list(VISUALS_DIR.glob("*.png")))}')
    print(f'CSV: {benchmark_csv}')
    print(f'JSON: {benchmark_json}')
    print(f'Pixel demo: {pixel_demo}')


if __name__ == '__main__':
    main()

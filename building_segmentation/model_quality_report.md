# Model Quality Report — YOLO11-Seg Building Footprint

## Snapshot
- Checkpoint used: `runs/segment/building_yolo11/weights/best.pt`
- Evaluation artifacts: `runs/segment/evaluation_results/test/` and `runs/segment/evaluation_results/validation/`
- Predictions (annotated): `runs/predictions/test/`

## Key Metrics (test)
- Precision (building): 0.02185
- Recall (building): 0.04812
- mAP50 (building): 0.0009873
- mAP50-95 (building): 0.0001991

These metrics were produced by a short smoke training run (1 epoch) on CPU using transfer learning from `yolo11n-seg.pt`.

## Observations
- Extremely low mAP and precision — expected given the tiny dataset (72 images) and CPU-only short training.
- High number of false negatives and few confident detections; see `runs/segment/evaluation_results/test/val_batch0_pred.jpg` for qualitative example.

## Recommendations
- Retrain with GPU and increase epochs (e.g., 100) and a proper early-stopping patience (20).
- Consider stronger augmentations and learning-rate tuning.
- Manually review and correct any polygon label errors (verify `dataset_yolo/labels/*`).

## How to reproduce evaluation & inference
Run evaluation (uses checkpoint at `runs/segment/building_yolo11/weights/best.pt`):

```bash
py building_segmentation\evaluate.py
```

Run inference on the test split (saves annotated images):

```bash
py building_segmentation\predict.py --source building_segmentation\dataset_yolo\images\test --save-dir building_segmentation\runs\predictions\test
```

## Artifacts to inspect
- `runs/segment/evaluation_results/test/` — PR/ROC/curves, confusion matrices, sample label/pred images.
- `building_segmentation/runs/predictions/test/` — predicted overlays per test image.

---
Generated automatically by the assistant on 2026-08-28.

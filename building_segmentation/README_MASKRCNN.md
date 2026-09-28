# Mask R-CNN Building Instance Segmentation & 3-Way Model Benchmark

Part of the **AI-Based Urban Parcel Mapping and Cadastral Feature Extraction System** for **Smart India Hackathon (SIH 2026)**.

---

## 1. Overview & Objectives

In urban cadastral mapping, knowing *where* buildings are located is necessary, but delineating *individual property parcels* requires separating touching, adjacent buildings into discrete objects with clear boundaries.

This module implements **Mask R-CNN (ResNet-50-FPN-V2)** as the **Third ML Component** to:
1. Extract individual building instances using connected component and contour analysis from semantic aerial masks.
2. Train a two-stage instance segmentation model with RoIAlign.
3. Compare **YOLOv11-Seg vs U-Net++ vs Mask R-CNN** on the exact same held-out test split (**Tile 8**, 9 aerial images).
4. Provide an empirical architectural decision for the SIH 2026 prototype.

---

## 2. Directory Structure

```
building_segmentation/
├── maskrcnn_dataset/                      # Instance-level dataset
│   ├── images/{train,val,test}/           # Aerial images split by tile
│   └── annotations/                       # Instance bounding boxes & contour polygons
│       ├── train.json                     # 45 images, 912 instances
│       ├── val.json                       # 18 images, 738 instances
│       └── test.json                      # 9 images, 1358 instances (Tile 8)
├── maskrcnn_validation_results/           # Pre-training instance audit reports
├── maskrcnn_evaluation_results/           # Evaluation metrics & 4-panel visual overlays
│   ├── val/                               # Validation set results
│   └── test/                              # Held-out Tile 8 test results
├── comparison_results/                    # 3-Way side-by-side benchmark artifacts
│   ├── compare3_tile8_image_part_*.png    # 6-panel comparative figures per test image
│   ├── three_model_comparison.json        # Quantitative benchmark JSON
│   └── three_model_comparison_report.txt  # Scientific comparison & verdict
├── runs/maskrcnn/building_instances/      # Model checkpoints
│   ├── best.pth                           # Best checkpoint weights
│   ├── last.pth                           # Final epoch weights
│   ├── training_curves.png                # Loss & validation metric plots
│   └── training_history.json              # Epoch-by-epoch history
├── maskrcnn_dataset_validation.py         # Instance dataset audit tool
├── prepare_maskrcnn_dataset.py            # Converts semantic masks to instance annotations
├── train_maskrcnn.py                      # Mask R-CNN training engine (CPU-optimized)
├── evaluate_maskrcnn.py                   # Instance Precision, Recall, and Mask IoU evaluator
├── extract_maskrcnn_instances.py          # Extracts GeoJSON cadastral polygons
├── compare_three_models.py                # YOLOv11-Seg vs U-Net++ vs Mask R-CNN benchmark
└── maskrcnn_building_footprints.geojson   # Extracted building instance footprints
```

---

## 3. Quickstart & Execution Commands

### Step 1: Audit Instance Dataset
Analyzes connected components, instance counts, bounding box distributions, and scale breakdown:
```bash
python maskrcnn_dataset_validation.py
```

### Step 2: Prepare Instance Dataset
Converts semantic masks into individual instance bounding boxes and polygons with spatial tile splitting:
```bash
python prepare_maskrcnn_dataset.py
```

### Step 3: Train Mask R-CNN
Trains Mask R-CNN with ResNet-50-FPN-V2, freezing early backbone layers for CPU efficiency:
```bash
python train_maskrcnn.py --epochs 8 --batch-size 2 --img-size 320 --lr 1e-4
```
*Saves the best checkpoint to `runs/maskrcnn/building_instances/best.pth`.*

### Step 4: Evaluate Model Performance
Evaluates instance detection precision/recall and pixel-level mask IoU:
```bash
# Evaluate on unseen Test Set (Tile 8)
python evaluate_maskrcnn.py --checkpoint runs/maskrcnn/building_instances/best.pth --split test

# Evaluate on Validation Set (Tiles 6-7)
python evaluate_maskrcnn.py --checkpoint runs/maskrcnn/building_instances/best.pth --split val
```

### Step 5: Extract Cadastral Polygons to GeoJSON
Vectorizes instance masks into clean GIS-ready polygons:
```bash
python extract_maskrcnn_instances.py \
    --checkpoint runs/maskrcnn/building_instances/best.pth \
    --source maskrcnn_dataset/images/test \
    --out maskrcnn_building_footprints.geojson \
    --score-thresh 0.35 \
    --min-area 30
```

### Step 6: Run 3-Way Model Scientific Comparison
Compares YOLOv11-Seg, U-Net++, and Mask R-CNN side-by-side on Tile 8:
```bash
python compare_three_models.py
```

---

## 4. Cadastral Coordinate Note

> **Spatial Reference Note:**
> Aerial images in this dataset are unreferenced JPEG files without embedded GeoTIFF tags or CRS projections.
> All polygon coordinates in `maskrcnn_building_footprints.geojson` are expressed in **pixel space** with explicit metadata annotations.

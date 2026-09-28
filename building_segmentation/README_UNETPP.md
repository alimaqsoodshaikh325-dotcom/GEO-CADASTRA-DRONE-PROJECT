# U-Net++ Building Footprint Segmentation & Boundary Refinement

Part of the **AI-Based Urban Parcel Mapping and Cadastral Feature Extraction System** for **Smart India Hackathon (SIH 2026)**.

---

## 1. Overview & Architecture

While **YOLOv11-Seg** acts as the primary detector and instance locator, **U-Net++** acts as the secondary high-fidelity pixel-level segmentation and boundary refinement engine.

### Why U-Net++ for Cadastral Feature Extraction?
- **Nested Dense Skip Connections**: Bridges the semantic gap between shallow spatial edge features and deep feature maps.
- **Dense Building Mask Generation**: Classifies every pixel into `0 (Background)` or `1 (Building)` with smooth sub-pixel boundary probability.
- **Cadastral Boundary Refinement**: Refines noisy drone/aerial boundaries into crisp, simplified geometric polygons for GIS integration.

```
Aerial Drone Image (2149x1479)
             │
             ▼
U-Net++ Segmentation Engine (ResNet18, 384x384)
             │
             ▼
High-Confidence Probability Map [0.0 - 1.0]
             │
             ▼
Conservative Morphological Cleanup (3x3 structuring elements)
             │
             ▼
Connected Component Contour Extraction (cv2.RETR_EXTERNAL)
             │
             ▼
Douglas-Peucker Geometric Simplification (epsilon = 0.005)
             │
             ▼
Cadastral Building Footprint Polygons (GeoJSON)
```

---

## 2. Directory Structure

```
building_segmentation/
├── unet_dataset/                          # Prepared binary dataset
│   ├── images/{train,val,test}/           # Aerial images (split by tile)
│   ├── masks/{train,val,test}/            # Binary masks (0 or 255)
│   └── split_report.txt                   # Tile assignment log
├── unet_validation_results/               # Pre-training dataset audit reports & visualizations
├── unet_evaluation_results/               # Evaluation plots and overlays
│   ├── val/                               # Validation split overlays
│   └── test/                              # Test split (Tile 8) overlays
├── comparison_results/                    # YOLOv11-Seg vs U-Net++ side-by-side benchmarks
│   ├── compare_tile8_image_part_*.png     # 5-panel comparative visualization per image
│   ├── comparison_results.json            # Machine-readable benchmark data
│   └── model_comparison_report.txt       # Quantitative benchmark summary
├── runs/unetpp/building_refinement/       # Model artifacts
│   ├── best.pt                            # Best checkpoint (Val IoU: 0.5776, Dice: 0.6512)
│   ├── last.pt                            # Final checkpoint
│   ├── training_curves.png                # Loss & validation metric plots
│   └── training_history.json              # Per-epoch training log
├── unet_dataset_validation.py             # Pre-training audit tool
├── prepare_unet_dataset.py                # Binary mask extraction & tile-aware split
├── train_unetpp.py                        # U-Net++ training engine
├── evaluate_unetpp.py                     # Quantitative evaluator (IoU, Dice, Prec, Rec)
├── refine_footprints.py                   # Morphological cleanup & GeoJSON extraction
├── compare_models.py                      # YOLOv11-Seg vs U-Net++ scientific comparator
├── unet_quality_report.txt                # Comprehensive experimental report
└── unet_building_footprints.geojson       # Extracted cadastral footprints (284 polygons)
```

---

## 3. Installation & Setup

Ensure the virtual environment is activated and required dependencies are installed:

```bash
pip install torch torchvision
pip install segmentation-models-pytorch shapely opencv-python matplotlib
```

---

## 4. Pipeline Execution Guide

### Step 1: Pre-training Dataset Audit
Validates dataset integrity, image-mask dimensions, and positive building color `(60, 16, 152)` presence:
```bash
python unet_dataset_validation.py
```

### Step 2: Binary Mask Extraction & Tile-Aware Split
Extracts building pixels (`0` or `255`) and performs spatial tile-aware splitting (Tiles 1–5 train, Tiles 6–7 val, Tile 8 test):
```bash
python prepare_unet_dataset.py
```

### Step 3: Model Training
Trains U-Net++ with ResNet18 encoder, custom bias initialization (`-1.9`), and combined BCE + Soft Dice Loss:
```bash
python train_unetpp.py --epochs 12 --batch-size 4 --lr 5e-4 --img-size 384
```
*Trained checkpoint automatically saves to `runs/unetpp/building_refinement/best.pt`.*

### Step 4: Model Evaluation
Evaluates test and validation splits against ground truth:
```bash
# Evaluate on unseen Test Set (Tile 8)
python evaluate_unetpp.py --checkpoint runs/unetpp/building_refinement/best.pt --split test --threshold 0.5

# Evaluate on Validation Set (Tiles 6-7)
python evaluate_unetpp.py --checkpoint runs/unetpp/building_refinement/best.pt --split val --threshold 0.5
```

### Step 5: Cadastral Footprint Extraction & Refinement
Extracts simplified GIS-ready building footprints in GeoJSON format:
```bash
python refine_footprints.py \
    --checkpoint runs/unetpp/building_refinement/best.pt \
    --source unet_dataset/images/test \
    --out unet_building_footprints.geojson \
    --threshold 0.5 \
    --min-area 30 \
    --epsilon 0.005
```

### Step 6: YOLOv11-Seg vs U-Net++ Scientific Comparison
Generates 5-panel visual overlays and quantitative metric comparisons between both architectures:
```bash
python compare_models.py \
    --yolo runs/segment/building_yolo11/weights/best.pt \
    --unet runs/unetpp/building_refinement/best.pt \
    --test-images unet_dataset/images/test \
    --test-masks unet_dataset/masks/test \
    --out comparison_results
```

---

## 5. Quantitative Benchmark Results

Evaluated on the unseen test partition (**Tile 8**, 9 high-resolution aerial images, 20.37% building density):

| Metric | YOLOv11-Seg | U-Net++ | Absolute Delta | Relative Gain |
|---|:---:|:---:|:---:|:---:|
| **Mean IoU (Jaccard)** | 0.2041 | **0.4804** | **+0.2763** | **+135.4%** |
| **Mean Dice (F1-Score)** | 0.3251 | **0.6409** | **+0.3158** | **+97.1%** |
| **Mean Precision** | 0.2042 | **0.5362** | **+0.3320** | **+162.6%** |
| **Mean Recall** | 0.9992 | **0.8182** | -0.1810 | Balanced |
| **Per-Image Win Rate** | 0 / 9 (0%) | **9 / 9 (100%)** | — | — |

---

## 6. Cadastral Spatial Note

> **Note on Spatial Coordinates:**
> The input aerial images (2149 x 1479 px) are raw unreferenced JPEG files lacking embedded GeoTIFF metadata / CRS projections.
> All GeoJSON polygons in `unet_building_footprints.geojson` are expressed in **pixel coordinate space** with explicit metadata tagging.
> If real-world ground control points (GCPs) or world files (`.jgw`) are provided, coordinates can be transformed to UTM/WGS84 using affine transformations.

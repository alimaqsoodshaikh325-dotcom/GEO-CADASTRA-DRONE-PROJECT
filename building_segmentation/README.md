# AI-Based Urban Parcel Mapping and Cadastral Feature Extraction System

## Project objective

This prototype focuses on the first machine learning component: YOLOv11-Seg based building detection and building footprint segmentation from aerial imagery.

The goal is to detect buildings from overhead imagery and generate segmentation polygons that approximate building footprints.

## Dataset structure

The dataset is expected to be located under a folder named `Semantic segmentation dataset` with the following layout:

```text
Semantic segmentation dataset/
├── Tile 1/
│   ├── images/
│   └── masks/
├── Tile 2/
│   ├── images/
│   └── masks/
...
└── Tile 8/
    ├── images/
    └── masks/
```

The masks contain RGB semantic labels. The building class to train on is:

- Building color: (60, 16, 152)
- HEX: #3C1098
- Class index: 0

Only the building class is used for YOLO segmentation training.

## Dataset conversion

The RGB semantic masks are converted to binary building masks, connected-component filtering is applied, and each building is converted into a YOLO segmentation polygon annotation.

The training labels use the YOLO segmentation format:

```text
0 0.123 0.245 0.130 0.245 0.135 0.260 ...
```

This format stores the class index followed by normalized polygon coordinates.

## Installation

```bash
pip install -r requirements.txt
```

## Dataset validation

Run:

```bash
python dataset_validation.py
```

This validates:

- image and mask pairing
- dimension consistency
- corrupted files
- building color presence
- coverage statistics
- zero-building images
- summary generation
- sample visualizations under `validation_results/`

## Dataset splitting

Run:

```bash
python split_dataset.py
```

The script creates a tile-aware train/validation/test split and writes `split_report.txt`.

## Training

Run:

```bash
python train.py
```

This trains a `YOLOv11n-Seg` model using transfer learning from `yolo11n-seg.pt`.

The best model is saved to:

```text
runs/segment/building_yolo11/weights/best.pt
```

## Evaluation

Run:

```bash
python evaluate.py
```

This evaluates the trained model on validation and test data and stores results under `evaluation_results/`.

## Inference

Run inference on a single image:

```bash
python predict.py --source test_image.jpg
```

Run inference on a folder:

```bash
python predict.py --source test_images/ --conf 0.40
```

The annotated results are saved under `runs/predictions/`.

### Quick commands used by assistant during finish-up

- Run evaluation (uses copied checkpoint):

```bash
py building_segmentation\evaluate.py
```

- Run inference on test split (saved to `building_segmentation/runs/predictions/test`):

```bash
py building_segmentation\predict.py --source building_segmentation\dataset_yolo\images\test --save-dir building_segmentation\runs\predictions\test
```

## Expected outputs

The project produces the following outputs:

- dataset validation reports and visualizations in `validation_results/`
- YOLO-formatted labels in `dataset_yolo/labels/`
- prepared image folders in `dataset_yolo/images/`
- split report in `split_report.txt`
- trained model in `runs/segment/building_yolo11/weights/best.pt`
- evaluation report in `evaluation_results/`
- prediction overlays in `runs/predictions/`

## New utilities (added)

- `pred_to_geojson.py` — converts model segmentation masks into per-image GeoJSON polygon files. Example:

```bash
py building_segmentation\pred_to_geojson.py --source building_segmentation\runs\predictions\test
```

- `failure_analysis.py` — rasterizes YOLO labels and compares model predictions to produce TP/FP/FN overlay images. Example:

```bash
py building_segmentation\failure_analysis.py --images building_segmentation\dataset_yolo\images\test --labels building_segmentation\dataset_yolo\labels\test
```

These scripts help produce GeoJSON outputs and failure-analysis overlays for the test split.

## Limitations

- The dataset is small (72 images), so this is a prototype-scale project.
- Transfer learning is required because the dataset is limited.
- The model should be treated as a research prototype rather than a production-ready cadastral system.
- Building footprint geometry may be imperfect on very small or partially occluded structures.
- This phase covers building detection and footprint segmentation only.

## Execution order

1. `python dataset_validation.py`
2. `python convert_masks.py`
3. `python split_dataset.py`
4. `python train.py`
5. `python evaluate.py`
6. `python predict.py --source test_image.jpg`

---

This project intentionally excludes GIS processing, DB/API work, parcel generation, flood/earthquake modelling, and deployment layers, as requested for the first ML component only.

from __future__ import annotations

from pathlib import Path

from ultralytics import YOLO

PROJECT_ROOT = Path(__file__).resolve().parent
BEST_MODEL = PROJECT_ROOT / "runs" / "segment" / "building_yolo11" / "weights" / "best.pt"
DATA_YAML = PROJECT_ROOT / "data.yaml"


if __name__ == "__main__":
    if not BEST_MODEL.exists():
        raise FileNotFoundError(f"Best model not found: {BEST_MODEL}. Train the model before evaluation.")
    if not DATA_YAML.exists():
        raise FileNotFoundError(f"data.yaml not found: {DATA_YAML}")

    model = YOLO(str(BEST_MODEL))
    val_metrics = model.val(data=str(DATA_YAML), split="val", imgsz=640, project="evaluation_results", name="validation", exist_ok=True)
    test_metrics = model.val(data=str(DATA_YAML), split="test", imgsz=640, project="evaluation_results", name="test", exist_ok=True)

    print("Validation metrics:")
    print(val_metrics)
    print("\nTest metrics:")
    print(test_metrics)

    prediction_dir = PROJECT_ROOT / "evaluation_results"
    prediction_dir.mkdir(exist_ok=True, parents=True)
    print(f"Evaluation results saved under: {prediction_dir}")

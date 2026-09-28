from __future__ import annotations

from pathlib import Path
import argparse
import torch
from ultralytics import YOLO

PROJECT_ROOT = Path(__file__).resolve().parent
DATA_YAML = PROJECT_ROOT / "data.yaml"
DEFAULT_MODEL = PROJECT_ROOT / "yolo11n-seg.pt"
DEFAULT_RUNS = PROJECT_ROOT / "runs" / "segment"
DEFAULT_NAME = "building_yolo11_fixed"


def detect_device(preferred: str | None = None) -> str:
    if preferred:
        return preferred
    if torch.cuda.is_available():
        print(f"CUDA available: {torch.cuda.get_device_name(0)}")
        return "0"
    print("CUDA not available. Falling back to CPU.")
    return "cpu"


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Train YOLO11-Seg building segmentation")
    p.add_argument("--epochs", type=int, default=100)
    p.add_argument("--imgsz", type=int, default=640)
    p.add_argument("--batch", type=int, default=-1)
    p.add_argument("--patience", type=int, default=20)
    p.add_argument("--model", type=str, default=str(DEFAULT_MODEL))
    p.add_argument("--project", type=str, default=str(DEFAULT_RUNS.resolve()))
    p.add_argument("--name", type=str, default=DEFAULT_NAME)
    p.add_argument("--device", type=str, default=None)
    p.add_argument("--pretrained", action="store_true")
    p.add_argument("--resume", action="store_true")
    return p.parse_args()


if __name__ == "__main__":
    if not DATA_YAML.exists():
        raise FileNotFoundError(f"YOLO data file not found: {DATA_YAML}. Run split_dataset.py first.")

    args = parse_args()
    device = detect_device(args.device)

    model = YOLO(str(args.model))

    # Conservative aerial augmentations
    results = model.train(
        data=str(DATA_YAML),
        epochs=args.epochs,
        imgsz=args.imgsz,
        patience=args.patience,
        batch=args.batch,
        device=device,
        project=str(Path(args.project).resolve()),
        name=args.name,
        exist_ok=True,
        pretrained=args.pretrained,
        resume=args.resume,
        # conservative augmentation suitable for aerial imagery
        fliplr=True,
        degrees=10,
        translate=0.05,
        scale=0.1,
        hsv_h=0.01,
        hsv_s=0.01,
        hsv_v=0.01,
        mosaic=0.0,
        mixup=0.0,
    )

    run_dir = Path(args.project) / args.name
    weights_dir = run_dir / "weights"
    best_pt = weights_dir / "best.pt"

    print("Training finished. Gathering run summary...")
    print(f"Requested epochs: {args.epochs}")

    # Try to infer actual completed epochs
    actual_epochs = "unknown"
    try:
        # ultralytics may return object with attribute 'epochs'
        if hasattr(results, "epochs"):
            actual_epochs = getattr(results, "epochs")
        elif isinstance(results, (list, tuple)) and results:
            r0 = results[0]
            if isinstance(r0, dict) and "epochs" in r0:
                actual_epochs = r0.get("epochs")
    except Exception:
        actual_epochs = "unknown"

    # Fallback: count epoch*.pt files
    if actual_epochs == "unknown":
        try:
            epoch_files = [p for p in weights_dir.glob("*.pt")]
            max_epoch = -1
            for p in epoch_files:
                name = p.stem
                import re

                m = re.search(r"epoch(\d+)", name)
                if m:
                    max_epoch = max(max_epoch, int(m.group(1)))
            if max_epoch >= 0:
                actual_epochs = max_epoch
        except Exception:
            pass

    print(f"Actual completed epochs: {actual_epochs}")

    if best_pt.exists():
        print(f"Best model found at: {best_pt}")
        # Evaluate the best model on val and test and print metrics
        try:
            eval_model = YOLO(str(best_pt))
            val_metrics = eval_model.val(data=str(DATA_YAML), split="val", imgsz=args.imgsz)
            test_metrics = eval_model.val(data=str(DATA_YAML), split="test", imgsz=args.imgsz)
            print("Validation metrics:")
            print(val_metrics)
            print("Test metrics:")
            print(test_metrics)
        except Exception as e:
            print(f"Evaluation failed: {e}")
    else:
        print(f"Best model not found at expected path: {best_pt}")

    print(f"Training device: {device}")

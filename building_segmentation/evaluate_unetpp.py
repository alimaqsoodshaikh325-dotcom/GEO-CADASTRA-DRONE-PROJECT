"""
Evaluate U-Net++ Building Segmentation Model
Computes:
- Dice Score
- IoU / Jaccard Index
- Precision, Recall, F1 Score
- Loss (BCE + Dice)
Generates 5-panel visual evaluations:
1. Original Image
2. Ground Truth Building Mask
3. U-Net++ Probability Heatmap
4. Binary Prediction & Error Overlay (TP=Green, FP=Red, FN=Blue)
5. Boundary Comparison (Contour overlay: GT=Cyan, Prediction=Yellow)
Categorizes predictions (good predictions, missed buildings, false positives, poor boundaries).
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import cv2
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import segmentation_models_pytorch as smp
import torch
from torch.utils.data import DataLoader, Dataset

PROJECT_ROOT = Path(__file__).resolve().parent
UNET_DATASET_DIR = PROJECT_ROOT / "unet_dataset"
CHECKPOINT_PATH = PROJECT_ROOT / "runs" / "unetpp" / "building_refinement" / "best.pt"
EVAL_RESULTS_DIR = PROJECT_ROOT / "unet_evaluation_results"


def load_trained_model(checkpoint_path: Path, device: torch.device):
    checkpoint = torch.load(checkpoint_path, map_location=device)
    config = checkpoint.get("config", {})
    encoder_name = config.get("encoder", "resnet18")
    try:
        model = smp.UnetPlusPlus(
            encoder_name=encoder_name,
            encoder_weights=None,
            in_channels=3,
            classes=1,
            encoder_depth=4,
            decoder_channels=(128, 64, 32, 16),
        )
        model.load_state_dict(checkpoint["model_state_dict"])
    except Exception:
        model = smp.UnetPlusPlus(
            encoder_name=encoder_name,
            encoder_weights=None,
            in_channels=3,
            classes=1,
        )
        model.load_state_dict(checkpoint["model_state_dict"])
    model.to(device)
    model.eval()
    return model, checkpoint


class EvalDataset(Dataset):
    def __init__(self, img_dir: Path, mask_dir: Path, img_size: int = 384):
        self.img_dir = img_dir
        self.mask_dir = mask_dir
        self.img_size = img_size

        self.img_files = sorted([p for p in img_dir.iterdir() if p.suffix.lower() in {".jpg", ".jpeg", ".png"}])
        self.pairs = []
        for img_p in self.img_files:
            mask_p = mask_dir / f"{img_p.stem}.png"
            if mask_p.exists():
                self.pairs.append((img_p, mask_p))

        self.mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
        self.std = np.array([0.229, 0.224, 0.225], dtype=np.float32)

    def __len__(self):
        return len(self.pairs)

    def __getitem__(self, idx: int):
        img_path, mask_path = self.pairs[idx]

        img_bgr = cv2.imread(str(img_path))
        orig_h, orig_w = img_bgr.shape[:2]
        img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)

        mask = cv2.imread(str(mask_path), cv2.IMREAD_GRAYSCALE)
        mask_binary = (mask > 127).astype(np.float32)

        img_resized = cv2.resize(img_rgb, (self.img_size, self.img_size), interpolation=cv2.INTER_LINEAR)
        img_float = (img_resized / 255.0).astype(np.float32)
        img_norm = (img_float - self.mean) / self.std
        img_tensor = torch.from_numpy(img_norm.transpose(2, 0, 1))

        return {
            "img_tensor": img_tensor,
            "orig_img": img_rgb,
            "orig_mask": mask_binary,
            "filename": img_path.name,
            "stem": img_path.stem,
            "orig_size": (orig_h, orig_w),
        }


def compute_metrics(pred_binary: np.ndarray, gt_binary: np.ndarray, smooth: float = 1e-6) -> dict:
    tp = np.sum((pred_binary == 1) & (gt_binary == 1))
    fp = np.sum((pred_binary == 1) & (gt_binary == 0))
    fn = np.sum((pred_binary == 0) & (gt_binary == 1))
    tn = np.sum((pred_binary == 0) & (gt_binary == 0))

    precision = (tp + smooth) / (tp + fp + smooth)
    recall = (tp + smooth) / (tp + fn + smooth)
    f1 = (2.0 * precision * recall) / (precision + recall + smooth)
    iou = (tp + smooth) / (tp + fp + fn + smooth)
    dice = (2.0 * tp + smooth) / (2.0 * tp + fp + fn + smooth)

    return {
        "iou": float(iou),
        "dice": float(dice),
        "precision": float(precision),
        "recall": float(recall),
        "f1": float(f1),
        "tp": int(tp),
        "fp": int(fp),
        "fn": int(fn),
        "tn": int(tn),
    }


def evaluate(checkpoint_path: Path, split: str = "test", threshold: float = 0.5, img_size: int = 384):
    print("=" * 60)
    print(f"U-Net++ EVALUATION ON '{split.upper()}' SPLIT")
    print("=" * 60)

    if not checkpoint_path.exists():
        raise FileNotFoundError(f"Checkpoint not found at: {checkpoint_path}")

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Loading checkpoint: {checkpoint_path}")
    model, checkpoint = load_trained_model(checkpoint_path, device)

    cfg = checkpoint.get("config", {})
    actual_img_size = cfg.get("img_size", img_size)

    split_img_dir = UNET_DATASET_DIR / "images" / split
    split_mask_dir = UNET_DATASET_DIR / "masks" / split
    dataset = EvalDataset(split_img_dir, split_mask_dir, img_size=actual_img_size)

    print(f"Found {len(dataset)} images in {split} set (eval input size: {actual_img_size}x{actual_img_size}).")
    out_dir = EVAL_RESULTS_DIR / split
    out_dir.mkdir(parents=True, exist_ok=True)

    all_metrics = []
    case_analysis = {
        "good_predictions": [],
        "missed_buildings": [],
        "false_positives": [],
        "fragmented_or_poor_boundary": [],
    }

    with torch.no_grad():
        for i in range(len(dataset)):
            sample = dataset[i]
            img_tensor = sample["img_tensor"].unsqueeze(0).to(device)
            orig_img = sample["orig_img"]
            gt_mask = sample["orig_mask"]
            stem = sample["stem"]
            orig_h, orig_w = sample["orig_size"]

            logits = model(img_tensor)
            prob_tensor = torch.sigmoid(logits).squeeze().cpu().numpy()

            # Resize predicted probability map back to original image dimensions for full-scale evaluation
            prob_full = cv2.resize(prob_tensor, (orig_w, orig_h), interpolation=cv2.INTER_LINEAR)
            pred_binary = (prob_full >= threshold).astype(np.uint8)
            gt_binary = (gt_mask > 0.5).astype(np.uint8)

            m = compute_metrics(pred_binary, gt_binary)
            m["filename"] = sample["filename"]
            all_metrics.append(m)

            gt_has_building = np.sum(gt_binary) > 0
            pred_has_building = np.sum(pred_binary) > 0

            if gt_has_building and m["iou"] >= 0.50:
                case_analysis["good_predictions"].append(sample["filename"])
            elif gt_has_building and m["recall"] < 0.40:
                case_analysis["missed_buildings"].append(sample["filename"])
            elif not gt_has_building and pred_has_building:
                case_analysis["false_positives"].append(sample["filename"])
            elif gt_has_building and m["precision"] < 0.40:
                case_analysis["fragmented_or_poor_boundary"].append(sample["filename"])

            # Generate 5-panel visual evaluation figure
            fig, axs = plt.subplots(1, 5, figsize=(25, 5))

            # 1. Original Image
            axs[0].imshow(orig_img)
            axs[0].set_title(f"Aerial Image\n({sample['filename']})", fontsize=11)
            axs[0].axis("off")

            # 2. Ground Truth Building Mask
            axs[1].imshow(gt_binary, cmap="gray")
            axs[1].set_title(f"Ground Truth Mask\n({np.mean(gt_binary)*100:.1f}% bldg)", fontsize=11)
            axs[1].axis("off")

            # 3. U-Net++ Probability Heatmap
            im_heat = axs[2].imshow(prob_full, cmap="plasma", vmin=0.0, vmax=1.0)
            axs[2].set_title(f"U-Net++ Probability\n(Mean: {prob_full.mean():.3f})", fontsize=11)
            axs[2].axis("off")
            plt.colorbar(im_heat, ax=axs[2], fraction=0.046, pad=0.04)

            # 4. Binary Prediction & Error Overlay (TP=Green, FP=Red, FN=Blue)
            error_map = np.zeros((*gt_binary.shape, 3), dtype=np.uint8)
            tp_mask = (pred_binary == 1) & (gt_binary == 1)
            fp_mask = (pred_binary == 1) & (gt_binary == 0)
            fn_mask = (pred_binary == 0) & (gt_binary == 1)
            error_map[tp_mask] = [0, 255, 0]    # Green = TP
            error_map[fp_mask] = [255, 0, 0]    # Red = FP
            error_map[fn_mask] = [0, 100, 255]  # Blue/Orange = FN

            alpha = 0.5
            overlay = (orig_img * (1 - alpha) + error_map * alpha).astype(np.uint8)
            overlay[~tp_mask & ~fp_mask & ~fn_mask] = orig_img[~tp_mask & ~fp_mask & ~fn_mask]

            axs[3].imshow(overlay)
            axs[3].set_title(f"Prediction & Errors\n(IoU: {m['iou']:.3f}, Dice: {m['dice']:.3f})", fontsize=11)
            axs[3].axis("off")

            # 5. Boundary Comparison Contours (GT=Cyan, Prediction=Yellow)
            boundary_viz = orig_img.copy()
            gt_contours, _ = cv2.findContours(gt_binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            pred_contours, _ = cv2.findContours(pred_binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

            cv2.drawContours(boundary_viz, gt_contours, -1, (0, 255, 255), 2)     # Cyan = GT
            cv2.drawContours(boundary_viz, pred_contours, -1, (255, 255, 0), 2)  # Yellow = Pred

            axs[4].imshow(boundary_viz)
            axs[4].set_title("Boundaries\n(Cyan=GT, Yellow=Pred)", fontsize=11)
            axs[4].axis("off")

            fig.tight_layout()
            fig_path = out_dir / f"eval_{stem}.png"
            fig.savefig(fig_path, dpi=120)
            plt.close(fig)

    avg_iou = float(np.mean([m["iou"] for m in all_metrics]))
    avg_dice = float(np.mean([m["dice"] for m in all_metrics]))
    avg_prec = float(np.mean([m["precision"] for m in all_metrics]))
    avg_rec = float(np.mean([m["recall"] for m in all_metrics]))
    avg_f1 = float(np.mean([m["f1"] for m in all_metrics]))

    print("-" * 60)
    print(f"SUMMARY FOR {split.upper()} SET (Images: {len(all_metrics)}):")
    print(f"  Mean IoU / Jaccard : {avg_iou:.4f}")
    print(f"  Mean Dice Score    : {avg_dice:.4f}")
    print(f"  Mean Precision     : {avg_prec:.4f}")
    print(f"  Mean Recall        : {avg_rec:.4f}")
    print(f"  Mean F1 Score      : {avg_f1:.4f}")
    print(f"  Visual results saved under: {out_dir}")
    print("-" * 60)

    eval_report = {
        "split": split,
        "total_images": len(all_metrics),
        "mean_iou": round(avg_iou, 4),
        "mean_dice": round(avg_dice, 4),
        "mean_precision": round(avg_prec, 4),
        "mean_recall": round(avg_rec, 4),
        "mean_f1": round(avg_f1, 4),
        "threshold": threshold,
        "case_analysis": case_analysis,
        "per_image_metrics": all_metrics,
    }

    with (out_dir / "evaluation_summary.json").open("w", encoding="utf-8") as f:
        json.dump(eval_report, f, indent=2)

    with (out_dir / "evaluation_summary.txt").open("w", encoding="utf-8") as f:
        f.write(f"U-Net++ Evaluation Report - {split.upper()} SPLIT\n")
        f.write("=" * 50 + "\n")
        f.write(f"Images evaluated: {len(all_metrics)}\n")
        f.write(f"Mean IoU / Jaccard: {avg_iou:.4f}\n")
        f.write(f"Mean Dice Score: {avg_dice:.4f}\n")
        f.write(f"Mean Precision: {avg_prec:.4f}\n")
        f.write(f"Mean Recall: {avg_rec:.4f}\n")
        f.write(f"Mean F1 Score: {avg_f1:.4f}\n")
        f.write("-" * 50 + "\n")
        f.write(f"Good predictions (IoU >= 0.50): {len(case_analysis['good_predictions'])}\n")
        f.write(f"Missed buildings (Recall < 0.40): {len(case_analysis['missed_buildings'])}\n")
        f.write(f"False positive detections: {len(case_analysis['false_positives'])}\n")
        f.write(f"Fragmented or poor boundary (Precision < 0.40): {len(case_analysis['fragmented_or_poor_boundary'])}\n")

    return eval_report


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--checkpoint", type=str, default=str(CHECKPOINT_PATH))
    parser.add_argument("--split", type=str, default="test", choices=["test", "val", "train"])
    parser.add_argument("--threshold", type=float, default=0.5)
    parser.add_argument("--img-size", type=int, default=384)
    args = parser.parse_args()

    evaluate(Path(args.checkpoint), split=args.split, threshold=args.threshold, img_size=args.img_size)

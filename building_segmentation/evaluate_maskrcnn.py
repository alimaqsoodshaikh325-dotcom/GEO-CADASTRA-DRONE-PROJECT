"""
evaluate_maskrcnn.py - Mask R-CNN Comprehensive Evaluation Engine
Evaluates trained Mask R-CNN model on Validation and Test (Tile 8) sets.
Computes:
- Instance Precision, Recall, F1
- Pixel-level Mask IoU, Dice
- Count of detected, missed, and false positive buildings
- Average prediction confidence
- Generates 4-panel visual comparison figures with error diagnosis
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
import torch
from torchvision.models.detection import maskrcnn_resnet50_fpn_v2
from torchvision.models.detection.faster_rcnn import FastRCNNPredictor
from torchvision.models.detection.mask_rcnn import MaskRCNNPredictor

PROJECT_ROOT = Path(__file__).resolve().parent
DEFAULT_CHECKPOINT = PROJECT_ROOT / "runs" / "maskrcnn" / "building_instances" / "best.pth"
DATASET_DIR = PROJECT_ROOT / "maskrcnn_dataset"
OUT_BASE = PROJECT_ROOT / "maskrcnn_evaluation_results"


def load_model(checkpoint_path: Path, device: torch.device):
    print(f"Loading checkpoint: {checkpoint_path}", flush=True)
    ckpt = torch.load(checkpoint_path, map_location=device)
    config = ckpt.get("config", {})

    model = maskrcnn_resnet50_fpn_v2(weights=None)
    in_features = model.roi_heads.box_predictor.cls_score.in_features
    model.roi_heads.box_predictor = FastRCNNPredictor(in_features, 2)
    in_features_mask = model.roi_heads.mask_predictor.conv5_mask.in_channels
    dim_reduced = model.roi_heads.mask_predictor.conv5_mask.out_channels
    model.roi_heads.mask_predictor = MaskRCNNPredictor(in_features_mask, dim_reduced, 2)

    model.load_state_dict(ckpt["model_state_dict"])
    model.to(device)
    model.eval()
    return model, config


def box_iou(boxA: list[float], boxB: list[float]) -> float:
    xA = max(boxA[0], boxB[0])
    yA = max(boxA[1], boxB[1])
    xB = min(boxA[2], boxB[2])
    yB = min(boxA[3], boxB[3])
    inter = max(0.0, xB - xA) * max(0.0, yB - yA)
    areaA = max(0.0, boxA[2] - boxA[0]) * max(0.0, boxA[3] - boxA[0])
    areaB = max(0.0, boxB[2] - boxB[0]) * max(0.0, boxB[3] - boxB[0])
    union = areaA + areaB - inter
    return inter / union if union > 0 else 0.0


def evaluate_split(checkpoint_path: Path, split: str = "test", score_thresh: float = 0.35,
                   mask_thresh: float = 0.5, iou_match_thresh: float = 0.5):
    out_dir = OUT_BASE / split
    out_dir.mkdir(parents=True, exist_ok=True)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    model, config = load_model(checkpoint_path, device)
    img_size = config.get("img_size", 320)

    anno_file = DATASET_DIR / "annotations" / f"{split}.json"
    with anno_file.open("r", encoding="utf-8") as f:
        data = json.load(f)

    images_meta = data["images"]
    img_dir = DATASET_DIR / "images" / split

    print("=" * 70, flush=True)
    print(f"EVALUATING MASK R-CNN ON '{split.upper()}' SPLIT ({len(images_meta)} images)", flush=True)
    print(f"Confidence Threshold: {score_thresh} | Mask Threshold: {mask_thresh}", flush=True)
    print("=" * 70, flush=True)

    total_gt_instances = 0
    total_pred_instances = 0
    total_tp = 0
    total_fp = 0
    total_fn = 0

    pixel_ious = []
    pixel_dices = []
    confidences = []
    per_image_stats = []

    for idx, rec in enumerate(images_meta, start=1):
        img_p = img_dir / rec["file_name"]
        img_bgr = cv2.imread(str(img_p))
        if img_bgr is None:
            continue
        orig_h, orig_w = img_bgr.shape[:2]
        img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)

        # Prepare model input
        img_resized = cv2.resize(img_rgb, (img_size, img_size), interpolation=cv2.INTER_LINEAR)
        img_tensor = torch.from_numpy(img_resized.transpose(2, 0, 1)).float() / 255.0
        img_tensor = img_tensor.unsqueeze(0).to(device)

        # Ground Truth setup
        gt_instances = rec.get("instances", [])
        total_gt_instances += len(gt_instances)
        gt_mask_full = np.zeros((orig_h, orig_w), dtype=np.uint8)
        gt_boxes = []

        for inst in gt_instances:
            gt_boxes.append(inst["bbox"])
            poly = inst.get("polygon", [])
            if len(poly) >= 3:
                cv2.fillPoly(gt_mask_full, [np.array(poly, dtype=np.int32)], 1)
            else:
                x1, y1, x2, y2 = inst["bbox"]
                cv2.rectangle(gt_mask_full, (int(x1), int(y1)), (int(x2), int(y2)), 1, -1)

        # Run model inference
        with torch.no_grad():
            pred = model(img_tensor)[0]

        pred_boxes_raw = pred["boxes"].cpu().numpy()
        pred_scores = pred["scores"].cpu().numpy()
        pred_masks_raw = pred["masks"].squeeze(1).cpu().numpy()

        sx = orig_w / img_size
        sy = orig_h / img_size

        keep = pred_scores >= score_thresh
        filtered_boxes = pred_boxes_raw[keep]
        filtered_scores = pred_scores[keep]
        filtered_masks = pred_masks_raw[keep]

        total_pred_instances += len(filtered_boxes)
        pred_mask_full = np.zeros((orig_h, orig_w), dtype=np.uint8)
        scaled_pred_boxes = []

        for p_box, p_mask, p_score in zip(filtered_boxes, filtered_masks, filtered_scores):
            confidences.append(float(p_score))
            px1 = float(p_box[0]) * sx
            py1 = float(p_box[1]) * sy
            px2 = float(p_box[2]) * sx
            py2 = float(p_box[3]) * sy
            scaled_pred_boxes.append([px1, py1, px2, py2])

            mask_resized = cv2.resize((p_mask > mask_thresh).astype(np.uint8), (orig_w, orig_h),
                                      interpolation=cv2.INTER_NEAREST)
            pred_mask_full = np.maximum(pred_mask_full, mask_resized)

        # Instance matching (Hungarian or greedy by IoU)
        matched_gt = set()
        img_tp = 0
        img_fp = 0

        for p_idx, p_box in enumerate(scaled_pred_boxes):
            best_iou = 0.0
            best_gt_idx = -1
            for g_idx, g_box in enumerate(gt_boxes):
                if g_idx in matched_gt:
                    continue
                iou = box_iou(p_box, g_box)
                if iou > best_iou:
                    best_iou = iou
                    best_gt_idx = g_idx

            if best_iou >= iou_match_thresh and best_gt_idx >= 0:
                matched_gt.add(best_gt_idx)
                img_tp += 1
            else:
                img_fp += 1

        img_fn = len(gt_boxes) - len(matched_gt)
        total_tp += img_tp
        total_fp += img_fp
        total_fn += img_fn

        # Pixel IoU and Dice
        inter = np.sum((pred_mask_full == 1) & (gt_mask_full == 1))
        union = np.sum((pred_mask_full == 1) | (gt_mask_full == 1))
        img_iou = float(inter / union) if union > 0 else (1.0 if np.sum(gt_mask_full) == 0 else 0.0)
        img_dice = float(2.0 * inter / (np.sum(pred_mask_full) + np.sum(gt_mask_full) + 1e-6))
        pixel_ious.append(img_iou)
        pixel_dices.append(img_dice)

        img_prec = img_tp / (img_tp + img_fp) if (img_tp + img_fp) > 0 else 0.0
        img_rec = img_tp / (img_tp + img_fn) if (img_tp + img_fn) > 0 else 0.0

        per_image_stats.append({
            "image": rec["file_name"],
            "gt_instances": len(gt_boxes),
            "pred_instances": len(scaled_pred_boxes),
            "tp": img_tp,
            "fp": img_fp,
            "fn": img_fn,
            "instance_precision": round(img_prec, 4),
            "instance_recall": round(img_rec, 4),
            "pixel_iou": round(img_iou, 4),
            "pixel_dice": round(img_dice, 4),
        })

        print(f"[{idx:02d}/{len(images_meta):02d}] {rec['file_name']:<28} "
              f"GT: {len(gt_boxes):<3} | Pred: {len(scaled_pred_boxes):<3} | "
              f"Inst Prec: {img_prec:.3f}, Rec: {img_rec:.3f} | Pixel IoU: {img_iou:.4f}", flush=True)

        # 4-Panel Visualization
        fig, axs = plt.subplots(1, 4, figsize=(24, 6))

        axs[0].imshow(img_rgb)
        axs[0].set_title(f"Aerial Image\n({rec['file_name']})", fontsize=11)
        axs[0].axis("off")

        # Ground Truth Instances
        vis_gt = img_rgb.copy()
        for g_idx, g_box in enumerate(gt_boxes):
            gx1, gy1, gx2, gy2 = map(int, g_box)
            cv2.rectangle(vis_gt, (gx1, gy1), (gx2, gy2), (0, 255, 0), 2)
        axs[1].imshow(vis_gt)
        axs[1].set_title(f"Ground Truth ({len(gt_boxes)} instances)\nGreen=Bounding Boxes", fontsize=11)
        axs[1].axis("off")

        # Predicted Instances
        vis_pred = img_rgb.copy()
        for p_idx, (p_box, p_score) in enumerate(zip(scaled_pred_boxes, filtered_scores)):
            px1, py1, px2, py2 = map(int, p_box)
            cv2.rectangle(vis_pred, (px1, py1), (px2, py2), (255, 100, 0), 2)
            cv2.putText(vis_pred, f"#{p_idx+1}:{p_score:.2f}", (px1, max(15, py1 - 4)),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 255, 0), 1)
        # Apply semi-transparent mask overlay
        pred_colored = vis_pred.copy()
        pred_colored[pred_mask_full == 1] = (0.5 * pred_colored[pred_mask_full == 1] + 0.5 * np.array([255, 50, 50])).astype(np.uint8)
        axs[2].imshow(pred_colored)
        axs[2].set_title(f"Mask R-CNN Predictions ({len(scaled_pred_boxes)} bldgs)\nPrec: {img_prec:.2f} | Rec: {img_rec:.2f}", fontsize=11)
        axs[2].axis("off")

        # Error / Overlap Map (Green=TP, Red=FP, Blue=FN)
        error_map = np.zeros((orig_h, orig_w, 3), dtype=np.uint8)
        error_map[(pred_mask_full == 1) & (gt_mask_full == 1)] = [0, 255, 0]    # TP: Green
        error_map[(pred_mask_full == 1) & (gt_mask_full == 0)] = [255, 0, 0]    # FP: Red
        error_map[(pred_mask_full == 0) & (gt_mask_full == 1)] = [0, 100, 255]  # FN: Orange/Blue
        axs[3].imshow(error_map)
        axs[3].set_title(f"Pixel Error Map (IoU: {img_iou:.3f})\nGreen=TP | Red=FP | Orange=FN", fontsize=11)
        axs[3].axis("off")

        fig.tight_layout()
        fig.savefig(out_dir / f"eval_{Path(rec['file_name']).stem}.png", dpi=120)
        plt.close(fig)

    # Summary Metrics
    overall_inst_precision = total_tp / (total_tp + total_fp) if (total_tp + total_fp) > 0 else 0.0
    overall_inst_recall = total_tp / (total_tp + total_fn) if (total_tp + total_fn) > 0 else 0.0
    overall_inst_f1 = (2 * overall_inst_precision * overall_inst_recall) / (overall_inst_precision + overall_inst_recall + 1e-6)
    mean_pixel_iou = float(np.mean(pixel_ious))
    mean_pixel_dice = float(np.mean(pixel_dices))
    mean_conf = float(np.mean(confidences)) if confidences else 0.0

    print("\n" + "=" * 70, flush=True)
    print(f"MASK R-CNN EVALUATION SUMMARY ({split.upper()} SPLIT):", flush=True)
    print("=" * 70, flush=True)
    print(f"  Total GT Buildings       : {total_gt_instances}")
    print(f"  Total Predicted Buildings: {total_pred_instances}")
    print(f"  True Positives (TP)      : {total_tp}")
    print(f"  False Positives (FP)     : {total_fp}")
    print(f"  Missed Buildings (FN)    : {total_fn}")
    print(f"  Instance Precision       : {overall_inst_precision:.4f}")
    print(f"  Instance Recall          : {overall_inst_recall:.4f}")
    print(f"  Instance F1-Score        : {overall_inst_f1:.4f}")
    print(f"  Mean Pixel IoU           : {mean_pixel_iou:.4f}")
    print(f"  Mean Pixel Dice          : {mean_pixel_dice:.4f}")
    print(f"  Average Confidence       : {mean_conf:.4f}")
    print("=" * 70, flush=True)

    summary_doc = {
        "split": split,
        "total_images": len(images_meta),
        "total_gt_instances": total_gt_instances,
        "total_pred_instances": total_pred_instances,
        "true_positives": total_tp,
        "false_positives": total_fp,
        "false_negatives": total_fn,
        "instance_precision": round(overall_inst_precision, 4),
        "instance_recall": round(overall_inst_recall, 4),
        "instance_f1": round(overall_inst_f1, 4),
        "mean_pixel_iou": round(mean_pixel_iou, 4),
        "mean_pixel_dice": round(mean_pixel_dice, 4),
        "mean_confidence": round(mean_conf, 4),
        "per_image": per_image_stats,
    }

    with (out_dir / "evaluation_summary.json").open("w", encoding="utf-8") as f:
        json.dump(summary_doc, f, indent=2)

    report_text = f"""MASK R-CNN EVALUATION REPORT ({split.upper()} SET)
========================================================================
Dataset Partition        : {split.upper()} Split ({len(images_meta)} images)
Model Checkpoint         : {checkpoint_path}
Confidence Threshold     : {score_thresh}
Mask Threshold           : {mask_thresh}

QUANTITATIVE PERFORMANCE METRICS
------------------------------------------------------------------------
Total Ground Truth Buildings    : {total_gt_instances}
Total Predicted Buildings       : {total_pred_instances}
True Positives (TP)             : {total_tp}
False Positives (FP)            : {total_fp}
Missed Buildings (FN)           : {total_fn}

Instance Precision              : {overall_inst_precision:.4f}
Instance Recall                 : {overall_inst_recall:.4f}
Instance F1-Score               : {overall_inst_f1:.4f}
Mean Pixel IoU (Jaccard)        : {mean_pixel_iou:.4f}
Mean Pixel Dice (F1)            : {mean_pixel_dice:.4f}
Average Detection Confidence    : {mean_conf:.4f}
========================================================================
"""
    (out_dir / "evaluation_report.txt").write_text(report_text, encoding="utf-8")
    print(f"Results saved to: {out_dir / 'evaluation_report.txt'}", flush=True)
    return summary_doc


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--checkpoint", type=str, default=str(DEFAULT_CHECKPOINT))
    parser.add_argument("--split", type=str, default="test", choices=["val", "test", "train"])
    parser.add_argument("--score-thresh", type=float, default=0.35)
    parser.add_argument("--mask-thresh", type=float, default=0.5)
    args = parser.parse_args()

    evaluate_split(
        checkpoint_path=Path(args.checkpoint),
        split=args.split,
        score_thresh=args.score_thresh,
        mask_thresh=args.mask_thresh,
    )

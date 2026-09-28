"""
evaluate_maskrcnn_fixed.py  -  Evaluation for the fixed Mask R-CNN pipeline.
Loads checkpoint from runs/maskrcnn/building_instances_fixed/best.pth and
evaluates the model on the fixed dataset (processed_maskrcnn_fixed/).
"""

from __future__ import annotations
import argparse
import json
from pathlib import Path

import cv2
import numpy as np
import torch
from PIL import Image
from torchvision import transforms as T
from torchvision.models.detection import (
    MaskRCNN_ResNet50_FPN_V2_Weights,
    maskrcnn_resnet50_fpn_v2,
)
from torchvision.models.detection.faster_rcnn import FastRCNNPredictor
from torchvision.models.detection.mask_rcnn import MaskRCNNPredictor

PROJECT_ROOT = Path(__file__).resolve().parent
RUNS_DIR = PROJECT_ROOT / "runs" / "maskrcnn" / "building_instances_fixed"
DATASET_DIR = PROJECT_ROOT / "processed_maskrcnn_fixed"
OUT_DIR = PROJECT_ROOT / "maskrcnn_evaluation_results"

IMG_TRANSFORM = T.Compose([T.ToTensor()])


def load_model(checkpoint_path: Path, num_classes: int = 2):
    model = maskrcnn_resnet50_fpn_v2(
        weights=None,
        box_detections_per_img=150,
        box_score_thresh=0.05,
    )
    in_features = model.roi_heads.box_predictor.cls_score.in_features
    model.roi_heads.box_predictor = FastRCNNPredictor(in_features, num_classes)
    in_features_mask = model.roi_heads.mask_predictor.conv5_mask.in_channels
    dim_reduced = model.roi_heads.mask_predictor.conv5_mask.out_channels
    model.roi_heads.mask_predictor = MaskRCNNPredictor(in_features_mask, dim_reduced, num_classes)

    ckpt = torch.load(checkpoint_path, map_location="cpu")
    model.load_state_dict(ckpt["model_state_dict"])
    print(f"Loaded checkpoint from {checkpoint_path} (epoch {ckpt.get('epoch', '?')}, val_iou={ckpt.get('val_iou', 0):.4f})")
    model.eval()
    return model


def rle_to_mask(rle_encoded, h, w):
    """Convert RLE or polygon to binary mask."""
    if isinstance(rle_encoded, dict):
        import pycocotools.mask as maskutil
        return maskutil.decode(rle_encoded)
    mask = np.zeros((h, w), dtype=np.uint8)
    if isinstance(rle_encoded, list):
        if len(rle_encoded) > 0 and isinstance(rle_encoded[0], list):
            for poly in rle_encoded:
                pts = np.array(poly, dtype=np.int32).reshape(-1, 2)
                cv2.fillPoly(mask, [pts], 1)
        else:
            pts = np.array(rle_encoded, dtype=np.int32).reshape(-1, 2)
            cv2.fillPoly(mask, [pts], 1)
    return mask


def compute_iou(pred_bin, gt_bin):
    inter = np.logical_and(pred_bin, gt_bin).sum()
    union = np.logical_or(pred_bin, gt_bin).sum()
    return float(inter / union) if union > 0 else 0.0


def compute_dice(pred_bin, gt_bin):
    inter = np.logical_and(pred_bin, gt_bin).sum()
    total = pred_bin.sum() + gt_bin.sum()
    return float(2.0 * inter / total) if total > 0 else (1.0 if inter == 0 else 0.0)


def box_iou(b1, b2):
    x1 = max(b1[0], b2[0])
    y1 = max(b1[1], b2[1])
    x2 = min(b1[2], b2[2])
    y2 = min(b1[3], b2[3])
    inter = max(0.0, x2 - x1) * max(0.0, y2 - y1)
    a1 = max(0.0, b1[2] - b1[0]) * max(0.0, b1[3] - b1[1])
    a2 = max(0.0, b2[2] - b2[0]) * max(0.0, b2[3] - b2[1])
    union = a1 + a2 - inter
    return float(inter / union) if union > 0 else 0.0


def evaluate(model, split: str, score_thresh: float = 0.35, iou_match_thresh: float = 0.5, img_size: int = 256, save_viz: bool = True):
    ann_file = DATASET_DIR / "annotations" / f"{split}.json"
    img_dir = DATASET_DIR / "images" / split
    split_viz_dir = OUT_DIR / split
    split_viz_dir.mkdir(parents=True, exist_ok=True)

    with open(ann_file, encoding="utf-8") as f:
        coco_data = json.load(f)

    images_list = coco_data.get("images", [])

    total_gt = 0
    total_pred = 0
    total_tp = 0
    total_fp = 0
    total_fn = 0
    pixel_ious = []
    pixel_dices = []
    all_pred_confs = []
    tp_confs = []
    tp_mask_ious = []
    tp_box_ious = []
    per_image_results = []

    print(f"\n{'='*70}")
    print(f"EVALUATION: {split.upper()} split | threshold={score_thresh} | match_iou={iou_match_thresh}")
    print(f"Dataset dir: {DATASET_DIR} | Images: {len(images_list)}")
    print(f"{'='*70}", flush=True)

    for img_idx, img_info in enumerate(images_list, start=1):
        file_name = img_info["file_name"]
        img_path = img_dir / file_name

        if not img_path.exists():
            print(f"  [WARN] Missing image: {img_path}")
            continue

        img_bgr = cv2.imread(str(img_path))
        if img_bgr is None:
            print(f"  [WARN] Failed to load {img_path}")
            continue
        h, w = img_bgr.shape[:2]
        img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)

        # Preprocess input (resize to model img_size)
        img_resized = cv2.resize(img_rgb, (img_size, img_size), interpolation=cv2.INTER_LINEAR)
        tensor = torch.from_numpy(img_resized.transpose(2, 0, 1)).float() / 255.0
        tensor = tensor.unsqueeze(0)

        with torch.no_grad():
            pred = model(tensor)[0]

        keep = pred["scores"] >= score_thresh
        raw_pred_masks = pred["masks"].squeeze(1)[keep].cpu().numpy()
        pred_scores_np = pred["scores"][keep].cpu().numpy()
        pred_boxes_np = pred["boxes"][keep].cpu().numpy()

        sx = w / float(img_size)
        sy = h / float(img_size)

        # Resize predicted masks and scale boxes to original image dimension
        pred_masks_bin = []
        pred_boxes_scaled = []
        for pi in range(len(raw_pred_masks)):
            m_scaled = cv2.resize((raw_pred_masks[pi] > 0.5).astype(np.uint8), (w, h), interpolation=cv2.INTER_NEAREST)
            pred_masks_bin.append(m_scaled)
            b = pred_boxes_np[pi]
            pred_boxes_scaled.append([b[0] * sx, b[1] * sy, b[2] * sx, b[3] * sy])

        all_pred_confs.extend([float(s) for s in pred_scores_np])

        # Ground truth instances from img_info["instances"]
        gt_instances = img_info.get("instances", [])
        gt_masks_bin = []
        gt_boxes = []

        for inst in gt_instances:
            m = np.zeros((h, w), dtype=np.uint8)
            poly = inst.get("polygon", [])
            if len(poly) >= 3:
                pts = np.array(poly, dtype=np.int32).reshape(-1, 2)
                cv2.fillPoly(m, [pts], 1)
            else:
                bx1, by1, bx2, by2 = inst["bbox"]
                cv2.rectangle(m, (int(bx1), int(by1)), (int(bx2), int(by2)), 1, -1)
            gt_masks_bin.append(m)
            gt_boxes.append(inst["bbox"])

        n_gt = len(gt_masks_bin)
        n_pred = len(pred_masks_bin)
        total_gt += n_gt
        total_pred += n_pred

        # Combined pixel-level IoU and Dice
        gt_comb = np.zeros((h, w), dtype=np.uint8)
        for m in gt_masks_bin:
            gt_comb = np.maximum(gt_comb, m)
        pred_comb = np.zeros((h, w), dtype=np.uint8)
        for m in pred_masks_bin:
            pred_comb = np.maximum(pred_comb, m)

        img_pix_iou = compute_iou(pred_comb, gt_comb)
        img_pix_dice = compute_dice(pred_comb, gt_comb)
        pixel_ious.append(img_pix_iou)
        pixel_dices.append(img_pix_dice)

        # Instance-level matching (greedy by score descending with spatial bbox indexing)
        matched_gt = set()
        matched_pred = set()
        img_tp_box_ious = []
        img_tp_mask_ious = []

        if n_pred > 0 and n_gt > 0:
            order = np.argsort(-pred_scores_np)
            for pi in order:
                best_iou = 0.0
                best_gi = -1
                p_box = pred_boxes_scaled[pi]

                for gi in range(n_gt):
                    if gi in matched_gt:
                        continue
                    g_box = gt_boxes[gi]

                    # Fast spatial pre-filter: no bbox intersection -> mask IoU is guaranteed 0
                    if (p_box[0] >= g_box[2] or p_box[2] <= g_box[0] or
                        p_box[1] >= g_box[3] or p_box[3] <= g_box[1]):
                        continue

                    # Slice local sub-region for instantaneous mask IoU
                    x_min = max(0, int(min(p_box[0], g_box[0])))
                    x_max = min(w, int(max(p_box[2], g_box[2])) + 1)
                    y_min = max(0, int(min(p_box[1], g_box[1])))
                    y_max = min(h, int(max(p_box[3], g_box[3])) + 1)

                    p_sub = pred_masks_bin[pi][y_min:y_max, x_min:x_max]
                    g_sub = gt_masks_bin[gi][y_min:y_max, x_min:x_max]

                    inter = np.logical_and(p_sub, g_sub).sum()
                    union = np.logical_or(p_sub, g_sub).sum()
                    iou = float(inter / union) if union > 0 else 0.0

                    if iou > best_iou:
                        best_iou = iou
                        best_gi = gi

                if best_iou >= iou_match_thresh:
                    matched_gt.add(best_gi)
                    matched_pred.add(pi)
                    tp_mask_ious.append(best_iou)
                    img_tp_mask_ious.append(best_iou)
                    tp_confs.append(float(pred_scores_np[pi]))

                    # Compute matched box IoU
                    b_iou = box_iou(p_box, gt_boxes[best_gi])
                    tp_box_ious.append(b_iou)
                    img_tp_box_ious.append(b_iou)

        n_tp = len(matched_pred)
        n_fp = n_pred - n_tp
        n_fn = n_gt - len(matched_gt)
        total_tp += n_tp
        total_fp += n_fp
        total_fn += n_fn

        img_prec = n_tp / (n_tp + n_fp) if (n_tp + n_fp) > 0 else 0.0
        img_rec = n_tp / (n_tp + n_fn) if (n_tp + n_fn) > 0 else 0.0
        img_f1 = (2 * img_prec * img_rec) / (img_prec + img_rec) if (img_prec + img_rec) > 0 else 0.0

        per_image_results.append({
            "image": file_name,
            "gt_count": n_gt,
            "pred_count": n_pred,
            "tp": n_tp,
            "fp": n_fp,
            "fn": n_fn,
            "precision": round(img_prec, 4),
            "recall": round(img_rec, 4),
            "f1": round(img_f1, 4),
            "pixel_iou": round(img_pix_iou, 4),
            "pixel_dice": round(img_pix_dice, 4),
            "mean_matched_mask_iou": round(float(np.mean(img_tp_mask_ious)), 4) if img_tp_mask_ious else 0.0,
            "mean_matched_box_iou": round(float(np.mean(img_tp_box_ious)), 4) if img_tp_box_ious else 0.0,
        })

        print(f"  [{img_idx:02d}/{len(images_list):02d}] {file_name:<28} | GT={n_gt:3d} | Pred={n_pred:3d} | TP={n_tp:3d} | FP={n_fp:3d} | FN={n_fn:3d} | PixIoU={img_pix_iou:.3f}", flush=True)

        # Save diagnostic visualization for representative images
        if save_viz and img_idx <= 6:
            import matplotlib
            matplotlib.use("Agg")
            import matplotlib.pyplot as plt

            fig, axs = plt.subplots(1, 4, figsize=(20, 5))
            axs[0].imshow(img_rgb)
            axs[0].set_title(f"Original Image\n{file_name}")
            axs[0].axis("off")

            # Ground truth overlay (Green)
            gt_vis = img_rgb.copy()
            gt_vis[gt_comb == 1] = (0.4 * gt_vis[gt_comb == 1] + 0.6 * np.array([0, 220, 80])).astype(np.uint8)
            axs[1].imshow(gt_vis)
            axs[1].set_title(f"Ground Truth ({n_gt} bldgs)")
            axs[1].axis("off")

            # Prediction overlay (Orange/Red)
            pred_vis = img_rgb.copy()
            pred_vis[pred_comb == 1] = (0.4 * pred_vis[pred_comb == 1] + 0.6 * np.array([220, 80, 0])).astype(np.uint8)
            axs[2].imshow(pred_vis)
            axs[2].set_title(f"Mask R-CNN ({n_pred} bldgs, {n_tp} TP)")
            axs[2].axis("off")

            # Diagnostic error overlay: Green=TP, Red=FP, Blue=FN
            err_vis = img_rgb.copy().astype(np.float32)
            tp_mask = (gt_comb == 1) & (pred_comb == 1)
            fp_mask = (gt_comb == 0) & (pred_comb == 1)
            fn_mask = (gt_comb == 1) & (pred_comb == 0)

            err_vis[tp_mask] = err_vis[tp_mask] * 0.4 + np.array([0, 230, 80]) * 0.6
            err_vis[fp_mask] = err_vis[fp_mask] * 0.4 + np.array([230, 40, 40]) * 0.6
            err_vis[fn_mask] = err_vis[fn_mask] * 0.4 + np.array([40, 100, 255]) * 0.6
            axs[3].imshow(np.clip(err_vis, 0, 255).astype(np.uint8))
            axs[3].set_title(f"Error Diagnostic\nGreen=TP | Red=FP | Blue=FN\nPixIoU: {img_pix_iou:.3f}")
            axs[3].axis("off")

            plt.tight_layout()
            viz_path = split_viz_dir / f"diag_{Path(file_name).stem}.png"
            fig.savefig(viz_path, dpi=120)
            plt.close(fig)

    precision = total_tp / (total_tp + total_fp) if (total_tp + total_fp) > 0 else 0.0
    recall = total_tp / (total_tp + total_fn) if (total_tp + total_fn) > 0 else 0.0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0.0
    mean_pix_iou = float(np.mean(pixel_ious)) if pixel_ious else 0.0
    mean_pix_dice = float(np.mean(pixel_dices)) if pixel_dices else 0.0
    mean_tp_mask_iou = float(np.mean(tp_mask_ious)) if tp_mask_ious else 0.0
    mean_tp_box_iou = float(np.mean(tp_box_ious)) if tp_box_ious else 0.0

    conf_stats = {
        "all_predictions": {
            "count": len(all_pred_confs),
            "mean": round(float(np.mean(all_pred_confs)), 4) if all_pred_confs else 0.0,
            "min": round(float(np.min(all_pred_confs)), 4) if all_pred_confs else 0.0,
            "max": round(float(np.max(all_pred_confs)), 4) if all_pred_confs else 0.0,
            "std": round(float(np.std(all_pred_confs)), 4) if all_pred_confs else 0.0,
        },
        "matched_true_positives": {
            "count": len(tp_confs),
            "mean": round(float(np.mean(tp_confs)), 4) if tp_confs else 0.0,
            "min": round(float(np.min(tp_confs)), 4) if tp_confs else 0.0,
            "max": round(float(np.max(tp_confs)), 4) if tp_confs else 0.0,
            "std": round(float(np.std(tp_confs)), 4) if tp_confs else 0.0,
        }
    }

    print(f"\n{'='*70}")
    print(f"RESULTS: {split.upper()} | score_thresh={score_thresh} | match_iou={iou_match_thresh}")
    print(f"  Total GT Buildings          : {total_gt}")
    print(f"  Total Predicted Buildings   : {total_pred}")
    print(f"  TP={total_tp} | FP={total_fp} | FN={total_fn}")
    print(f"  Instance Precision          : {precision:.4f}")
    print(f"  Instance Recall             : {recall:.4f}")
    print(f"  Instance F1                 : {f1:.4f}")
    print(f"  Mean Pixel IoU (Jaccard)    : {mean_pix_iou:.4f}")
    print(f"  Mean Pixel Dice             : {mean_pix_dice:.4f}")
    print(f"  Mean Matched Mask IoU       : {mean_tp_mask_iou:.4f}")
    print(f"  Mean Matched BBox IoU       : {mean_tp_box_iou:.4f}")
    print(f"  Pred Confidence (All)       : mean={conf_stats['all_predictions']['mean']:.4f} [min={conf_stats['all_predictions']['min']:.4f}, max={conf_stats['all_predictions']['max']:.4f}]")
    print(f"  Pred Confidence (TP)        : mean={conf_stats['matched_true_positives']['mean']:.4f} [min={conf_stats['matched_true_positives']['min']:.4f}, max={conf_stats['matched_true_positives']['max']:.4f}]")
    print(f"{'='*70}", flush=True)

    summary = {
        "split": split,
        "score_thresh": score_thresh,
        "iou_match_thresh": iou_match_thresh,
        "total_gt": total_gt,
        "total_pred": total_pred,
        "tp": total_tp,
        "fp": total_fp,
        "fn": total_fn,
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "f1": round(f1, 4),
        "mean_pixel_iou": round(mean_pix_iou, 4),
        "mean_pixel_dice": round(mean_pix_dice, 4),
        "mean_matched_mask_iou": round(mean_tp_mask_iou, 4),
        "mean_matched_box_iou": round(mean_tp_box_iou, 4),
        "confidence_statistics": conf_stats,
        "per_image": per_image_results,
    }

    report_lines = [
        f"MASK R-CNN FIXED EVALUATION REPORT: {split.upper()} SPLIT",
        "=" * 70,
        f"Model Checkpoint        : {RUNS_DIR / 'best.pth'}",
        f"Dataset Directory       : {DATASET_DIR}",
        f"Score Threshold         : {score_thresh}",
        f"IoU Match Threshold     : {iou_match_thresh}",
        "-" * 70,
        f"Total Ground Truth Buildings : {total_gt}",
        f"Total Predicted Buildings    : {total_pred}",
        f"True Positives (TP)          : {total_tp}",
        f"False Positives (FP)         : {total_fp}",
        f"False Negatives (FN)         : {total_fn}",
        "-" * 70,
        f"Instance Precision           : {precision:.4f}",
        f"Instance Recall              : {recall:.4f}",
        f"Instance F1 Score            : {f1:.4f}",
        f"Mean Pixel IoU (Jaccard)     : {mean_pix_iou:.4f}",
        f"Mean Pixel Dice              : {mean_pix_dice:.4f}",
        f"Mean Matched Mask IoU        : {mean_tp_mask_iou:.4f}",
        f"Mean Matched Bounding-Box IoU: {mean_tp_box_iou:.4f}",
        "-" * 70,
        f"All Predictions Confidence   : Mean={conf_stats['all_predictions']['mean']:.4f}, Min={conf_stats['all_predictions']['min']:.4f}, Max={conf_stats['all_predictions']['max']:.4f}, Std={conf_stats['all_predictions']['std']:.4f}",
        f"Matched TP Confidence        : Mean={conf_stats['matched_true_positives']['mean']:.4f}, Min={conf_stats['matched_true_positives']['min']:.4f}, Max={conf_stats['matched_true_positives']['max']:.4f}, Std={conf_stats['matched_true_positives']['std']:.4f}",
        "=" * 70,
    ]
    report_text = "\n".join(report_lines)

    # Save to both maskrcnn_evaluation_results and RUNS_DIR
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / f"evaluation_{split}.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    (OUT_DIR / f"evaluation_{split}_report.txt").write_text(report_text, encoding="utf-8")
    (RUNS_DIR / f"evaluation_{split}.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")

    print(f"Results saved to: {OUT_DIR / f'evaluation_{split}.json'}")
    print(f"Report saved to:  {OUT_DIR / f'evaluation_{split}_report.txt'}")

    return summary


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--checkpoint", type=str, default=str(RUNS_DIR / "best.pth"))
    parser.add_argument("--split", type=str, default="val", choices=["val", "test"])
    parser.add_argument("--score-thresh", type=float, default=0.35)
    parser.add_argument("--match-thresh", type=float, default=0.5)
    parser.add_argument("--img-size", type=int, default=256)
    args = parser.parse_args()

    torch.set_num_threads(4)
    ckpt_path = Path(args.checkpoint)

    if not ckpt_path.exists():
        raise FileNotFoundError(f"Checkpoint not found: {ckpt_path}\nTrain first: python train_maskrcnn_fixed.py")

    model = load_model(ckpt_path)
    evaluate(model, args.split, score_thresh=args.score_thresh, iou_match_thresh=args.match_thresh, img_size=args.img_size)


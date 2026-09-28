"""
visualize_maskrcnn_debug.py - Debug visualizer for Mask R-CNN fixed pipeline.
Loads the checkpoint from runs/maskrcnn/building_instances_fixed/best.pth and
generates 4-panel figures (original | GT masks | predicted masks | overlay)
for 6 validation images to visually inspect model behaviour.
"""

from __future__ import annotations
import json
from pathlib import Path

import cv2
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import torch
from PIL import Image
from torchvision import transforms as T
from torchvision.models.detection import maskrcnn_resnet50_fpn_v2
from torchvision.models.detection.faster_rcnn import FastRCNNPredictor
from torchvision.models.detection.mask_rcnn import MaskRCNNPredictor

PROJECT_ROOT = Path(__file__).resolve().parent
RUNS_DIR = PROJECT_ROOT / "runs" / "maskrcnn" / "building_instances_fixed"
VIZ_DIR = RUNS_DIR / "debug_visualizations"
DATASET_DIR = PROJECT_ROOT / "processed_maskrcnn_fixed"

IMG_TRANSFORM = T.Compose([T.ToTensor()])
SCORE_THRESH = 0.35

# ──────────────────────────────────────────────────────────────────────────────

def load_model(checkpoint_path: Path, num_classes: int = 2):
    model = maskrcnn_resnet50_fpn_v2(weights=None, box_detections_per_img=150, box_score_thresh=0.05)
    in_features = model.roi_heads.box_predictor.cls_score.in_features
    model.roi_heads.box_predictor = FastRCNNPredictor(in_features, num_classes)
    in_features_mask = model.roi_heads.mask_predictor.conv5_mask.in_channels
    dim_reduced = model.roi_heads.mask_predictor.conv5_mask.out_channels
    model.roi_heads.mask_predictor = MaskRCNNPredictor(in_features_mask, dim_reduced, num_classes)

    ckpt = torch.load(checkpoint_path, map_location="cpu")
    model.load_state_dict(ckpt["model_state_dict"])
    print(f"Loaded checkpoint (epoch {ckpt.get('epoch','?')}, val_iou={ckpt.get('val_iou',0):.4f})")
    model.eval()
    return model


def draw_masks(img_np, masks_bin, color, alpha=0.55):
    out = img_np.copy().astype(np.float32)
    for m in masks_bin:
        overlay = np.zeros_like(out)
        overlay[m] = color
        out = cv2.addWeighted(out, 1.0, overlay, alpha, 0)
    return np.clip(out, 0, 255).astype(np.uint8)


def poly_to_mask(segs, h, w):
    mask = np.zeros((h, w), dtype=np.uint8)
    for seg in (segs if isinstance(segs[0], list) else [segs]):
        poly = np.array(seg, dtype=np.int32).reshape(-1, 2)
        cv2.fillPoly(mask, [poly], 1)
    return mask


def visualize(model, n_samples: int = 6):
    VIZ_DIR.mkdir(parents=True, exist_ok=True)
    ann_file = DATASET_DIR / "annotations" / "val.json"
    img_dir = DATASET_DIR / "images" / "val"

    with open(ann_file) as f:
        coco = json.load(f)

    id_to_img = {i["id"]: i for i in coco["images"]}
    anns_by_img: dict[int, list] = {}
    for ann in coco["annotations"]:
        anns_by_img.setdefault(ann["image_id"], []).append(ann)

    sampled = coco["images"][:n_samples]

    for idx, img_info in enumerate(sampled):
        img_id = img_info["id"]
        file_name = img_info["file_name"]
        img_path = img_dir / file_name

        if not img_path.exists():
            print(f"  [WARN] Missing {img_path}")
            continue

        pil_img = Image.open(img_path).convert("RGB")
        w, h = pil_img.size
        img_np = np.array(pil_img)

        # ---- Predict ----
        tensor = IMG_TRANSFORM(pil_img).unsqueeze(0)
        with torch.no_grad():
            pred = model(tensor)[0]

        keep = pred["scores"] >= SCORE_THRESH
        pred_masks_t = pred["masks"].squeeze(1)[keep]
        pred_masks_bin = [(pred_masks_t[i] > 0.5).cpu().numpy() for i in range(len(pred_masks_t))]
        pred_scores = pred["scores"][keep].cpu().numpy()

        # ---- GT ----
        gt_anns = anns_by_img.get(img_id, [])
        gt_masks_bin = []
        for ann in gt_anns:
            seg = ann["segmentation"]
            if isinstance(seg, list):
                m = poly_to_mask(seg, h, w)
            else:
                import pycocotools.mask as maskutil
                m = maskutil.decode(seg)
            gt_masks_bin.append(m.astype(bool))

        # ---- Pixel-level combine ----
        gt_comb = np.zeros((h, w), dtype=bool)
        for m in gt_masks_bin:
            gt_comb |= m
        pred_comb = np.zeros((h, w), dtype=bool)
        for m in pred_masks_bin:
            pred_comb |= m

        inter = np.sum(gt_comb & pred_comb)
        union = np.sum(gt_comb | pred_comb)
        pix_iou = inter / union if union > 0 else 0.0

        # ---- Build panels ----
        gt_vis = draw_masks(img_np, [m.astype(np.uint8) for m in gt_masks_bin], color=[0, 200, 80])
        pred_vis = draw_masks(img_np, [m.astype(np.uint8) for m in pred_masks_bin], color=[200, 80, 0])

        # Overlay: GT=green, Pred=red, both=yellow
        overlay = img_np.copy().astype(np.float32)
        both_mask = gt_comb & pred_comb
        gt_only = gt_comb & ~both_mask
        pred_only = pred_comb & ~both_mask
        overlay[gt_only] = overlay[gt_only] * 0.4 + np.array([0, 220, 80]) * 0.6
        overlay[pred_only] = overlay[pred_only] * 0.4 + np.array([220, 80, 0]) * 0.6
        overlay[both_mask] = overlay[both_mask] * 0.4 + np.array([255, 255, 0]) * 0.6
        overlay = np.clip(overlay, 0, 255).astype(np.uint8)

        fig, axs = plt.subplots(1, 4, figsize=(20, 5))
        axs[0].imshow(img_np); axs[0].set_title("Original"); axs[0].axis("off")
        axs[1].imshow(gt_vis); axs[1].set_title(f"GT ({len(gt_masks_bin)} bldgs)"); axs[1].axis("off")
        axs[2].imshow(pred_vis); axs[2].set_title(f"Pred ({len(pred_masks_bin)} bldgs, IoU={pix_iou:.2f})"); axs[2].axis("off")
        axs[3].imshow(overlay); axs[3].set_title("Overlay\n(Green=GT | Red=Pred | Yellow=Both)"); axs[3].axis("off")

        plt.suptitle(f"{file_name} | GT={len(gt_masks_bin)} | Pred={len(pred_masks_bin)} | PixelIoU={pix_iou:.4f}", fontsize=11)
        plt.tight_layout()

        out_path = VIZ_DIR / f"val_{idx:02d}_{Path(file_name).stem}.png"
        fig.savefig(out_path, dpi=120, bbox_inches="tight")
        plt.close(fig)
        print(f"  Saved: {out_path} | GT={len(gt_masks_bin)} | Pred={len(pred_masks_bin)} | Pixel IoU={pix_iou:.4f}", flush=True)

    print(f"\nAll debug visualizations saved to: {VIZ_DIR}")


if __name__ == "__main__":
    torch.set_num_threads(4)
    ckpt_path = RUNS_DIR / "best.pth"
    if not ckpt_path.exists():
        raise FileNotFoundError(f"Checkpoint not found: {ckpt_path}\nRun: python train_maskrcnn_fixed.py")
    model = load_model(ckpt_path)
    visualize(model, n_samples=6)

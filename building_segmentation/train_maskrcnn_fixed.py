"""
train_maskrcnn_fixed.py - Corrected Mask R-CNN Training Engine
Uses processed_maskrcnn_fixed/ which has unique deterministic filenames.
Old checkpoint runs/maskrcnn/building_instances/best.pth must NOT be reused -
it was trained on a corrupted dataset with filename collisions.
Saves to runs/maskrcnn/building_instances_fixed/
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import torch
from torch.utils.data import DataLoader
from torchvision.models.detection import (
    MaskRCNN_ResNet50_FPN_V2_Weights,
    maskrcnn_resnet50_fpn_v2,
)
from torchvision.models.detection.faster_rcnn import FastRCNNPredictor
from torchvision.models.detection.mask_rcnn import MaskRCNNPredictor

from prepare_maskrcnn_fixed_dataset import FixedBuildingInstanceDataset, collate_fn

PROJECT_ROOT = Path(__file__).resolve().parent
RUNS_DIR = PROJECT_ROOT / "runs" / "maskrcnn" / "building_instances_fixed"


def get_model(num_classes: int = 2, freeze_backbone: bool = True):
    print("Loading pretrained maskrcnn_resnet50_fpn_v2 (COCO weights)...", flush=True)
    model = maskrcnn_resnet50_fpn_v2(
        weights=MaskRCNN_ResNet50_FPN_V2_Weights.DEFAULT,
        rpn_pre_nms_top_n_train=600,
        rpn_post_nms_top_n_train=150,
        box_batch_size_per_image=64,
        rpn_pre_nms_top_n_test=600,
        rpn_post_nms_top_n_test=150,
        box_detections_per_img=150,
        box_score_thresh=0.05,  # Low during training so RPN can learn; filtered during eval
        box_nms_thresh=0.5,
    )

    if freeze_backbone:
        print("Freezing ResNet-50 backbone body; training FPN + RPN + RoI heads only.", flush=True)
        for param in model.backbone.body.parameters():
            param.requires_grad = False

    # Replace box predictor
    in_features = model.roi_heads.box_predictor.cls_score.in_features
    model.roi_heads.box_predictor = FastRCNNPredictor(in_features, num_classes)

    # Replace mask predictor
    in_features_mask = model.roi_heads.mask_predictor.conv5_mask.in_channels
    dim_reduced = model.roi_heads.mask_predictor.conv5_mask.out_channels
    model.roi_heads.mask_predictor = MaskRCNNPredictor(in_features_mask, dim_reduced, num_classes)

    return model


def evaluate_val_iou(model, val_loader, device, max_samples=12, score_thresh=0.35):
    model.eval()
    ious = []
    evaluated = 0
    with torch.no_grad():
        for images, targets in val_loader:
            if evaluated >= max_samples:
                break
            imgs_dev = [img.to(device) for img in images]
            preds = model(imgs_dev)

            for pred, tgt in zip(preds, targets):
                gt_m = tgt["masks"]
                if len(gt_m) == 0:
                    continue
                gt_comb = (gt_m.sum(0) > 0).cpu().numpy().astype(np.uint8)

                pm = pred["masks"].squeeze(1)
                keep = pred["scores"] >= score_thresh
                pm = pm[keep]

                pred_comb = (pm > 0.5).sum(0).gt(0).cpu().numpy().astype(np.uint8) if len(pm) > 0 else np.zeros_like(gt_comb)

                inter = np.sum((pred_comb == 1) & (gt_comb == 1))
                union = np.sum((pred_comb == 1) | (gt_comb == 1))
                if union > 0:
                    ious.append(inter / union)
                evaluated += 1

    return float(np.mean(ious)) if ious else 0.0


def train(args):
    RUNS_DIR.mkdir(parents=True, exist_ok=True)
    device = torch.device("cpu")
    torch.set_num_threads(4)
    print(f"Device: CPU | Threads: 4 | img_size={args.img_size} | batch={args.batch_size}", flush=True)
    print("NOTE: Old checkpoint at runs/maskrcnn/building_instances/best.pth is NOT loaded.", flush=True)
    print("      Training fresh from COCO pretrained weights on the FIXED dataset.", flush=True)

    train_ds = FixedBuildingInstanceDataset(split="train", img_size=args.img_size, augment=True)
    val_ds = FixedBuildingInstanceDataset(split="val", img_size=args.img_size, augment=False)

    train_ld = DataLoader(train_ds, batch_size=args.batch_size, shuffle=True, collate_fn=collate_fn, num_workers=0)
    val_ld = DataLoader(val_ds, batch_size=args.batch_size, shuffle=False, collate_fn=collate_fn, num_workers=0)
    print(f"Train: {len(train_ds)} unique images | Val: {len(val_ds)} unique images", flush=True)
    print(f"Batches per epoch: {len(train_ld)}", flush=True)

    model = get_model(num_classes=2, freeze_backbone=True)
    model.to(device)

    trainable = [p for p in model.parameters() if p.requires_grad]
    print(f"Trainable parameters: {sum(p.numel() for p in trainable):,}", flush=True)

    optimizer = torch.optim.SGD(trainable, lr=args.lr, momentum=0.9, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.StepLR(optimizer, step_size=3, gamma=0.5)

    config = {
        "model": "maskrcnn_resnet50_fpn_v2",
        "dataset": "processed_maskrcnn_fixed",
        "num_classes": 2,
        "freeze_backbone": True,
        "img_size": args.img_size,
        "batch_size": args.batch_size,
        "epochs": args.epochs,
        "optimizer": "SGD",
        "lr": args.lr,
    }
    (RUNS_DIR / "config.json").write_text(json.dumps(config, indent=2))

    history = {"train_loss": [], "loss_cls": [], "loss_box": [], "loss_mask": [], "val_iou": []}
    best_val_iou = -1.0
    t_start = time.time()

    print("\n" + "=" * 70)
    print(f"TRAINING: {args.epochs} EPOCHS | FIXED DATASET")
    print("=" * 70, flush=True)

    for epoch in range(1, args.epochs + 1):
        ep_t0 = time.time()
        model.train()
        tot, c_l, b_l, m_l, n = 0.0, 0.0, 0.0, 0.0, 0

        for b_idx, (images, targets) in enumerate(train_ld, 1):
            images = [img.to(device) for img in images]
            targets = [{k: v.to(device) for k, v in t.items()} for t in targets]

            if not any(len(t["boxes"]) > 0 for t in targets):
                continue

            loss_dict = model(images, targets)
            losses = sum(v for v in loss_dict.values())

            optimizer.zero_grad()
            losses.backward()
            torch.nn.utils.clip_grad_norm_(trainable, max_norm=10.0)
            optimizer.step()

            tot += losses.detach().item()
            c_l += loss_dict.get("loss_classifier", torch.tensor(0.0)).detach().item()
            b_l += loss_dict.get("loss_box_reg", torch.tensor(0.0)).detach().item()
            m_l += loss_dict.get("loss_mask", torch.tensor(0.0)).detach().item()
            n += 1

            if b_idx % 5 == 0 or b_idx == len(train_ld):
                print(f"  [Ep{epoch:02d}|B{b_idx:02d}/{len(train_ld):02d}] "
                      f"Total={losses.item():.3f} Cls={loss_dict.get('loss_classifier',0.0):.3f} "
                      f"Box={loss_dict.get('loss_box_reg',0.0):.3f} Mask={loss_dict.get('loss_mask',0.0):.3f}", flush=True)

        scheduler.step()
        avg_loss = tot / max(1, n)
        val_iou = evaluate_val_iou(model, val_ld, device, max_samples=12, score_thresh=0.35)

        history["train_loss"].append(avg_loss)
        history["loss_cls"].append(c_l / max(1, n))
        history["loss_box"].append(b_l / max(1, n))
        history["loss_mask"].append(m_l / max(1, n))
        history["val_iou"].append(val_iou)

        ep_min = (time.time() - ep_t0) / 60
        print(f"\n--> Epoch {epoch:02d} done in {ep_min:.1f}m | Loss={avg_loss:.4f} | Val_IoU={val_iou:.4f}", flush=True)

        torch.save({"epoch": epoch, "model_state_dict": model.state_dict(), "config": config, "val_iou": val_iou}, RUNS_DIR / "last.pth")
        if val_iou >= best_val_iou:
            best_val_iou = val_iou
            torch.save({"epoch": epoch, "model_state_dict": model.state_dict(), "config": config, "val_iou": val_iou}, RUNS_DIR / "best.pth")
            print(f"  *** NEW BEST Val_IoU={val_iou:.4f} ***", flush=True)

    total_min = (time.time() - t_start) / 60
    print(f"\nTraining COMPLETE in {total_min:.1f} min. Best Val IoU={best_val_iou:.4f}")
    (RUNS_DIR / "training_history.json").write_text(json.dumps(history, indent=2))

    epochs_r = list(range(1, len(history["train_loss"]) + 1))
    fig, axs = plt.subplots(1, 2, figsize=(14, 5))
    axs[0].plot(epochs_r, history["train_loss"], label="Total Loss", color="navy", lw=2)
    axs[0].plot(epochs_r, history["loss_mask"], label="Mask Loss", color="purple")
    axs[0].set_title("Training Losses"); axs[0].set_xlabel("Epoch"); axs[0].legend(); axs[0].grid(alpha=0.3)
    axs[1].plot(epochs_r, history["val_iou"], color="darkgreen", lw=2, marker="o", label="Val Mask IoU")
    axs[1].set_title("Validation Mask IoU"); axs[1].set_xlabel("Epoch"); axs[1].legend(); axs[1].grid(alpha=0.3)
    plt.tight_layout(); fig.savefig(RUNS_DIR / "training_curves.png", dpi=120); plt.close(fig)
    print(f"Curves saved to: {RUNS_DIR / 'training_curves.png'}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--epochs", type=int, default=2)
    parser.add_argument("--batch-size", type=int, default=2)
    parser.add_argument("--img-size", type=int, default=256)
    parser.add_argument("--lr", type=float, default=5e-3)
    args = parser.parse_args()
    train(args)

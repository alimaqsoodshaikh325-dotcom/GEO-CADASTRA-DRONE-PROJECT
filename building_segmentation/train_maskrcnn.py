"""
train_maskrcnn.py - Optimized CPU Mask R-CNN Training Engine
Trains torchvision Mask R-CNN (ResNet-50-FPN-V2) for building instance segmentation.
Configured for rapid CPU execution (256x256, 2 epochs) to finish within execution windows.
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import cv2
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

from prepare_maskrcnn_dataset import BuildingInstanceDataset, collate_fn

PROJECT_ROOT = Path(__file__).resolve().parent
RUNS_DIR = PROJECT_ROOT / "runs" / "maskrcnn" / "building_instances"


def get_model(num_classes: int = 2, freeze_backbone: bool = True):
    print("Loading pretrained maskrcnn_resnet50_fpn_v2...", flush=True)
    weights = MaskRCNN_ResNet50_FPN_V2_Weights.DEFAULT
    model = maskrcnn_resnet50_fpn_v2(
        weights=weights,
        rpn_pre_nms_top_n_train=400,
        rpn_post_nms_top_n_train=80,
        box_batch_size_per_image=48,
        rpn_pre_nms_top_n_test=400,
        rpn_post_nms_top_n_test=80,
        box_detections_per_img=80,
    )

    if freeze_backbone:
        print("Freezing ResNet-50 backbone body; training FPN + RPN + RoI heads.", flush=True)
        for param in model.backbone.body.parameters():
            param.requires_grad = False

    # Replace FastRCNN box predictor
    in_features = model.roi_heads.box_predictor.cls_score.in_features
    model.roi_heads.box_predictor = FastRCNNPredictor(in_features, num_classes)

    # Replace MaskRCNN mask predictor
    in_features_mask = model.roi_heads.mask_predictor.conv5_mask.in_channels
    dim_reduced = model.roi_heads.mask_predictor.conv5_mask.out_channels
    model.roi_heads.mask_predictor = MaskRCNNPredictor(in_features_mask, dim_reduced, num_classes)

    return model


def evaluate_val_iou(model, val_loader, device: torch.device, max_samples: int = 10, score_thresh: float = 0.3):
    model.eval()
    ious = []
    evaluated = 0

    with torch.no_grad():
        for images, targets in val_loader:
            if evaluated >= max_samples:
                break
            images_dev = [img.to(device) for img in images]
            preds = model(images_dev)

            for pred, target in zip(preds, targets):
                gt_masks = target["masks"]
                if len(gt_masks) == 0:
                    continue
                gt_combined = (torch.sum(gt_masks, dim=0) > 0).cpu().numpy().astype(np.uint8)

                pred_masks = pred["masks"].squeeze(1)
                scores = pred["scores"]
                keep = scores >= score_thresh
                pred_masks = pred_masks[keep]

                if len(pred_masks) == 0:
                    pred_combined = np.zeros_like(gt_combined)
                else:
                    pred_combined = (torch.sum(pred_masks > 0.5, dim=0) > 0).cpu().numpy().astype(np.uint8)

                inter = np.sum((pred_combined == 1) & (gt_combined == 1))
                union = np.sum((pred_combined == 1) | (gt_combined == 1))
                if union > 0:
                    ious.append(inter / union)
                evaluated += 1

    return float(np.mean(ious)) if ious else 0.0


def train(args):
    RUNS_DIR.mkdir(parents=True, exist_ok=True)
    device = torch.device(args.device if torch.cuda.is_available() and args.device == "cuda" else "cpu")
    if device.type == "cpu":
        torch.set_num_threads(4)
    print(f"Device: {device} | Intra-op threads: {torch.get_num_threads()}", flush=True)

    print(f"Loading datasets (img_size={args.img_size})...", flush=True)
    train_dataset = BuildingInstanceDataset(split="train", img_size=args.img_size, augment=True)
    val_dataset = BuildingInstanceDataset(split="val", img_size=args.img_size, augment=False)

    train_loader = DataLoader(
        train_dataset,
        batch_size=args.batch_size,
        shuffle=True,
        collate_fn=collate_fn,
        num_workers=0,
    )
    val_loader = DataLoader(
        val_dataset,
        batch_size=args.batch_size,
        shuffle=False,
        collate_fn=collate_fn,
        num_workers=0,
    )

    print(f"Train samples: {len(train_dataset)} | Val samples: {len(val_dataset)}", flush=True)
    print(f"Batches per epoch: {len(train_loader)} (Batch size={args.batch_size})", flush=True)

    model = get_model(num_classes=2, freeze_backbone=args.freeze_backbone)
    model.to(device)

    trainable_params = [p for p in model.parameters() if p.requires_grad]
    print(f"Trainable parameters: {sum(p.numel() for p in trainable_params):,}", flush=True)

    optimizer = torch.optim.AdamW(trainable_params, lr=args.lr, weight_decay=1e-4)

    config = {
        "model": "maskrcnn_resnet50_fpn_v2",
        "num_classes": 2,
        "freeze_backbone": args.freeze_backbone,
        "img_size": args.img_size,
        "batch_size": args.batch_size,
        "epochs": args.epochs,
        "lr": args.lr,
        "device": str(device),
    }
    with (RUNS_DIR / "config.json").open("w", encoding="utf-8") as f:
        json.dump(config, f, indent=2)

    # Save initial checkpoint as baseline
    torch.save({
        "epoch": 0,
        "model_state_dict": model.state_dict(),
        "config": config,
        "val_iou": 0.0,
    }, RUNS_DIR / "best.pth")

    history = {
        "train_loss": [],
        "loss_classifier": [],
        "loss_box_reg": [],
        "loss_mask": [],
        "val_iou": [],
    }

    best_val_iou = -1.0
    t_start = time.time()

    print("\n" + "=" * 70, flush=True)
    print(f"STARTING FAST CPU MASK R-CNN TRAINING ({args.epochs} EPOCHS)", flush=True)
    print("=" * 70, flush=True)

    for epoch in range(1, args.epochs + 1):
        ep_t0 = time.time()
        model.train()
        total_loss = 0.0
        cls_loss = 0.0
        box_loss = 0.0
        mask_loss = 0.0
        num_batches = 0

        for b_idx, (images, targets) in enumerate(train_loader, start=1):
            images = [img.to(device) for img in images]
            targets = [{k: v.to(device) for k, v in t.items()} for t in targets]

            has_boxes = any(len(t["boxes"]) > 0 for t in targets)
            if not has_boxes:
                continue

            loss_dict = model(images, targets)
            losses = sum(loss for loss in loss_dict.values())

            optimizer.zero_grad()
            losses.backward()
            torch.nn.utils.clip_grad_norm_(trainable_params, max_norm=5.0)
            optimizer.step()

            total_loss += float(losses.detach().item())
            cls_loss += float(loss_dict.get("loss_classifier", 0.0).detach().item())
            box_loss += float(loss_dict.get("loss_box_reg", 0.0).detach().item())
            mask_loss += float(loss_dict.get("loss_mask", 0.0).detach().item())
            num_batches += 1

            if b_idx % 4 == 0 or b_idx == len(train_loader):
                print(f"  [Epoch {epoch:02d}/{args.epochs:02d} | Batch {b_idx:02d}/{len(train_loader):02d}] "
                      f"Loss: {losses.item():.4f} (Cls: {loss_dict.get('loss_classifier',0.0):.3f}, "
                      f"Box: {loss_dict.get('loss_box_reg',0.0):.3f}, Mask: {loss_dict.get('loss_mask',0.0):.3f})",
                      flush=True)

        avg_train_loss = total_loss / max(1, num_batches)
        avg_cls_loss = cls_loss / max(1, num_batches)
        avg_box_loss = box_loss / max(1, num_batches)
        avg_mask_loss = mask_loss / max(1, num_batches)

        # Validation IoU evaluation
        print("  Evaluating validation split IoU...", flush=True)
        val_iou = evaluate_val_iou(model, val_loader, device=device, max_samples=8, score_thresh=0.3)

        history["train_loss"].append(avg_train_loss)
        history["loss_classifier"].append(avg_cls_loss)
        history["loss_box_reg"].append(avg_box_loss)
        history["loss_mask"].append(avg_mask_loss)
        history["val_iou"].append(val_iou)

        ep_duration = time.time() - ep_t0
        print(f"\n--> Epoch {epoch:02d} Finished in {ep_duration/60:.2f}m: "
              f"Train Loss={avg_train_loss:.4f} | Val IoU={val_iou:.4f}", flush=True)

        # Save last checkpoint
        torch.save({
            "epoch": epoch,
            "model_state_dict": model.state_dict(),
            "config": config,
            "val_iou": val_iou,
        }, RUNS_DIR / "last.pth")

        # Save best checkpoint
        if val_iou >= best_val_iou:
            best_val_iou = val_iou
            torch.save({
                "epoch": epoch,
                "model_state_dict": model.state_dict(),
                "config": config,
                "val_iou": val_iou,
            }, RUNS_DIR / "best.pth")
            print(f"  *** NEW BEST CHECKPOINT SAVED (Val IoU: {val_iou:.4f}) ***", flush=True)

    total_training_time = time.time() - t_start
    print("=" * 70, flush=True)
    print(f"TRAINING COMPLETE IN {total_training_time/60:.2f} MINUTES", flush=True)
    print("=" * 70, flush=True)

    with (RUNS_DIR / "training_history.json").open("w", encoding="utf-8") as f:
        json.dump(history, f, indent=2)

    # Plot curves
    epochs_range = list(range(1, len(history["train_loss"]) + 1))
    fig, axs = plt.subplots(1, 2, figsize=(14, 5))

    axs[0].plot(epochs_range, history["train_loss"], label="Total Loss", color="navy", lw=2)
    axs[0].plot(epochs_range, history["loss_classifier"], label="Classification", color="orange")
    axs[0].plot(epochs_range, history["loss_box_reg"], label="Box Regression", color="green")
    axs[0].plot(epochs_range, history["loss_mask"], label="Mask Segmentation", color="purple")
    axs[0].set_title("Training Loss Progression")
    axs[0].set_xlabel("Epoch")
    axs[0].set_ylabel("Loss")
    axs[0].legend()
    axs[0].grid(True, alpha=0.3)

    axs[1].plot(epochs_range, history["val_iou"], label="Val Mask IoU", color="darkgreen", lw=2, marker="o")
    axs[1].set_title("Validation Mask IoU")
    axs[1].set_xlabel("Epoch")
    axs[1].set_ylabel("Mean IoU")
    axs[1].legend()
    axs[1].grid(True, alpha=0.3)

    plt.tight_layout()
    fig.savefig(RUNS_DIR / "training_curves.png", dpi=120)
    plt.close(fig)
    print(f"Saved training curves to: {RUNS_DIR / 'training_curves.png'}", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--epochs", type=int, default=2)
    parser.add_argument("--batch-size", type=int, default=2)
    parser.add_argument("--img-size", type=int, default=256)
    parser.add_argument("--lr", type=float, default=1e-4)
    parser.add_argument("--freeze-backbone", action="store_true", default=True)
    parser.add_argument("--device", type=str, default="cpu")
    args = parser.parse_args()

    train(args)

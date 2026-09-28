"""
Optimized U-Net++ Building Segmentation Training
Features:
- Standard U-Net++ architecture with pretrained ResNet-18
- Initialized classification head bias to -1.9 (matching aerial building class distribution ~13%)
- Weighted BCE + Soft Dice Loss for balanced aerial building boundary supervision
- Configurable image size (default 384 for CPU optimization, supports 512)
- Fast execution on CPU with 4 threads
- Model checkpointing to runs/unetpp/building_refinement/best.pt
"""

from __future__ import annotations

import argparse
import json
import math
import random
import sys
import time
from pathlib import Path

import cv2
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import segmentation_models_pytorch as smp
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, Dataset

PROJECT_ROOT = Path(__file__).resolve().parent
UNET_DATASET_DIR = PROJECT_ROOT / "unet_dataset"
RUNS_DIR = PROJECT_ROOT / "runs" / "unetpp" / "building_refinement"


def set_seed(seed: int = 42):
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)
    torch.backends.cudnn.deterministic = True
    torch.backends.cudnn.benchmark = False


class AerialBuildingDataset(Dataset):
    def __init__(self, img_dir: Path, mask_dir: Path, img_size: int = 384, is_train: bool = False):
        self.img_dir = img_dir
        self.mask_dir = mask_dir
        self.img_size = img_size
        self.is_train = is_train

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
        if img_bgr is None:
            raise FileNotFoundError(f"Cannot read image {img_path}")
        img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)

        mask = cv2.imread(str(mask_path), cv2.IMREAD_GRAYSCALE)
        if mask is None:
            raise FileNotFoundError(f"Cannot read mask {mask_path}")

        img_rgb = cv2.resize(img_rgb, (self.img_size, self.img_size), interpolation=cv2.INTER_LINEAR)
        mask = cv2.resize(mask, (self.img_size, self.img_size), interpolation=cv2.INTER_NEAREST)
        mask = (mask > 127).astype(np.float32)

        if self.is_train:
            if random.random() > 0.5:
                img_rgb = np.fliplr(img_rgb).copy()
                mask = np.fliplr(mask).copy()

            if random.random() > 0.5:
                img_rgb = np.flipud(img_rgb).copy()
                mask = np.flipud(mask).copy()

            rot_k = random.choice([0, 1, 2, 3])
            if rot_k > 0:
                img_rgb = np.rot90(img_rgb, k=rot_k).copy()
                mask = np.rot90(mask, k=rot_k).copy()

            if random.random() > 0.5:
                alpha = random.uniform(0.85, 1.15)
                beta = random.uniform(-15, 15)
                img_rgb = np.clip(alpha * img_rgb + beta, 0, 255).astype(np.uint8)

        img_float = (img_rgb / 255.0).astype(np.float32)
        img_norm = (img_float - self.mean) / self.std

        img_tensor = torch.from_numpy(img_norm.transpose(2, 0, 1))
        mask_tensor = torch.from_numpy(mask).unsqueeze(0)

        return img_tensor, mask_tensor, str(img_path.name)


class BCEDiceLoss(nn.Module):
    def __init__(self, bce_weight: float = 0.5, dice_weight: float = 0.5, pos_weight: float = 2.0, smooth: float = 1.0):
        super().__init__()
        self.bce_weight = bce_weight
        self.dice_weight = dice_weight
        self.smooth = smooth
        self.bce = nn.BCEWithLogitsLoss(pos_weight=torch.tensor([pos_weight]))

    def forward(self, logits: torch.Tensor, targets: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        bce_loss = self.bce(logits, targets)

        probs = torch.sigmoid(logits)
        probs_flat = probs.view(-1)
        targets_flat = targets.view(-1)

        intersection = (probs_flat * targets_flat).sum()
        dice_score = (2.0 * intersection + self.smooth) / (probs_flat.sum() + targets_flat.sum() + self.smooth)
        dice_loss = 1.0 - dice_score

        total_loss = self.bce_weight * bce_loss + self.dice_weight * dice_loss
        return total_loss, bce_loss, dice_loss


def calculate_metrics(probs: torch.Tensor, targets: torch.Tensor, threshold: float = 0.5, smooth: float = 1e-6):
    preds = (probs >= threshold).float()
    targets = (targets >= threshold).float()

    preds_flat = preds.view(-1)
    targets_flat = targets.view(-1)

    tp = (preds_flat * targets_flat).sum().item()
    fp = (preds_flat * (1.0 - targets_flat)).sum().item()
    fn = ((1.0 - preds_flat) * targets_flat).sum().item()

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
    }


def validate_epoch(model: nn.Module, val_loader: DataLoader, criterion: nn.Module, device: torch.device, threshold: float = 0.5):
    model.eval()
    val_loss_sum = 0.0
    val_bce_sum = 0.0
    val_dice_sum = 0.0

    all_probs = []
    all_targets = []

    with torch.no_grad():
        for images, masks, _ in val_loader:
            images = images.to(device)
            masks = masks.to(device)

            logits = model(images)
            loss, bce_l, dice_l = criterion(logits, masks)

            val_loss_sum += loss.item() * images.size(0)
            val_bce_sum += bce_l.item() * images.size(0)
            val_dice_sum += dice_l.item() * images.size(0)

            probs = torch.sigmoid(logits)
            all_probs.append(probs.cpu())
            all_targets.append(masks.cpu())

    total_samples = len(val_loader.dataset)
    avg_loss = val_loss_sum / total_samples
    avg_bce = val_bce_sum / total_samples
    avg_dice = val_dice_sum / total_samples

    all_probs = torch.cat(all_probs, dim=0)
    all_targets = torch.cat(all_targets, dim=0)
    metrics = calculate_metrics(all_probs, all_targets, threshold=threshold)
    metrics["loss"] = float(avg_loss)
    metrics["bce_loss"] = float(avg_bce)
    metrics["dice_loss"] = float(avg_dice)

    return metrics


def train():
    parser = argparse.ArgumentParser(description="Train U-Net++ for Building Footprint Segmentation")
    parser.add_argument("--epochs", type=int, default=15, help="Number of training epochs")
    parser.add_argument("--batch-size", type=int, default=4, help="Batch size for training")
    parser.add_argument("--img-size", type=int, default=384, help="Input image dimension")
    parser.add_argument("--lr", type=float, default=5e-4, help="Initial learning rate")
    parser.add_argument("--weight-decay", type=float, default=1e-4, help="Weight decay for AdamW")
    parser.add_argument("--encoder", type=str, default="resnet18", help="Encoder backbone")
    parser.add_argument("--bce-weight", type=float, default=0.5, help="Weight of BCE loss")
    parser.add_argument("--dice-weight", type=float, default=0.5, help="Weight of Dice loss")
    parser.add_argument("--pos-weight", type=float, default=2.0, help="Positive class weight for BCE")
    parser.add_argument("--threshold", type=float, default=0.5, help="Binary classification threshold")
    parser.add_argument("--patience", type=int, default=6, help="Early stopping patience")
    parser.add_argument("--seed", type=int, default=42, help="Random seed")
    parser.add_argument("--save-dir", type=str, default=str(RUNS_DIR), help="Output directory for checkpoints")
    args = parser.parse_args()

    torch.set_num_threads(4)
    set_seed(args.seed)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    print("=" * 60, flush=True)
    print("U-Net++ BUILDING FOOTPRINT SEGMENTATION TRAINING", flush=True)
    print("=" * 60, flush=True)
    print(f"Device: {device} (CPU with 4 threads)", flush=True)
    print(f"Encoder Backbone: {args.encoder} (ImageNet Pretrained, Transfer Learning)", flush=True)
    print(f"Loss Function: {args.bce_weight} * BCE (pos_weight={args.pos_weight}) + {args.dice_weight} * Dice", flush=True)
    print(f"Input Size: {args.img_size}x{args.img_size} | Batch Size: {args.batch_size} | Epochs: {args.epochs}", flush=True)
    print(f"Initial LR: {args.lr} | Early Stopping Patience: {args.patience}", flush=True)
    print("-" * 60, flush=True)

    save_path = Path(args.save_dir)
    save_path.mkdir(parents=True, exist_ok=True)

    train_dataset = AerialBuildingDataset(
        img_dir=UNET_DATASET_DIR / "images" / "train",
        mask_dir=UNET_DATASET_DIR / "masks" / "train",
        img_size=args.img_size,
        is_train=True,
    )
    val_dataset = AerialBuildingDataset(
        img_dir=UNET_DATASET_DIR / "images" / "val",
        mask_dir=UNET_DATASET_DIR / "masks" / "val",
        img_size=args.img_size,
        is_train=False,
    )

    print(f"Training Samples: {len(train_dataset)} | Validation Samples: {len(val_dataset)}", flush=True)

    train_loader = DataLoader(
        train_dataset,
        batch_size=args.batch_size,
        shuffle=True,
        num_workers=0,
    )
    val_loader = DataLoader(
        val_dataset,
        batch_size=args.batch_size,
        shuffle=False,
        num_workers=0,
    )

    # Initialize U-Net++
    model = smp.UnetPlusPlus(
        encoder_name=args.encoder,
        encoder_weights="imagenet",
        in_channels=3,
        classes=1,
        encoder_depth=4,
        decoder_channels=(128, 64, 32, 16),
    )

    # Freeze encoder layers 0-2 for robust transfer learning
    for param in model.encoder.parameters():
        param.requires_grad = False
    # Unfreeze layer 4 of encoder for domain adaptation to aerial imagery
    for param in model.encoder.layer4.parameters():
        param.requires_grad = True

    # Initialize classification head bias to -1.9 (p ≈ 0.13) to suppress initial false positives
    with torch.no_grad():
        if hasattr(model.segmentation_head, "0"):
            model.segmentation_head[0].bias.fill_(-1.9)
        elif hasattr(model.segmentation_head, "weight"):
            model.segmentation_head.bias.fill_(-1.9)

    trainable_params = sum(p.numel() for p in model.parameters() if p.requires_grad)
    print(f"Trainable parameters: {trainable_params:,}", flush=True)

    model.to(device)

    criterion = BCEDiceLoss(bce_weight=args.bce_weight, dice_weight=args.dice_weight, pos_weight=args.pos_weight)
    optimizer = torch.optim.AdamW(
        [p for p in model.parameters() if p.requires_grad],
        lr=args.lr,
        weight_decay=args.weight_decay,
    )
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(
        optimizer, mode="max", factor=0.5, patience=2, min_lr=1e-6
    )

    best_val_iou = 0.0
    best_val_dice = 0.0
    best_epoch = 0
    epochs_no_improve = 0

    history = {
        "train_loss": [],
        "val_loss": [],
        "val_iou": [],
        "val_dice": [],
        "val_precision": [],
        "val_recall": [],
        "lr": [],
    }

    start_time = time.time()
    num_batches = len(train_loader)

    for epoch in range(1, args.epochs + 1):
        epoch_start = time.time()
        model.train()
        train_loss_sum = 0.0

        for batch_idx, (images, masks, _) in enumerate(train_loader, start=1):
            images = images.to(device)
            masks = masks.to(device)

            optimizer.zero_grad()
            logits = model(images)
            loss, _, _ = criterion(logits, masks)
            loss.backward()
            optimizer.step()

            train_loss_sum += loss.item() * images.size(0)
            if batch_idx % 3 == 0 or batch_idx == num_batches:
                print(f"  Epoch [{epoch:02d}/{args.epochs:02d}] Step [{batch_idx:02d}/{num_batches:02d}] - Loss: {loss.item():.4f}", flush=True)

        train_loss_avg = train_loss_sum / len(train_dataset)

        val_metrics = validate_epoch(model, val_loader, criterion, device, threshold=args.threshold)
        scheduler.step(val_metrics["iou"])
        current_lr = optimizer.param_groups[0]["lr"]

        history["train_loss"].append(train_loss_avg)
        history["val_loss"].append(val_metrics["loss"])
        history["val_iou"].append(val_metrics["iou"])
        history["val_dice"].append(val_metrics["dice"])
        history["val_precision"].append(val_metrics["precision"])
        history["val_recall"].append(val_metrics["recall"])
        history["lr"].append(current_lr)

        epoch_time = time.time() - epoch_start
        print(
            f"--> Epoch [{epoch:02d}/{args.epochs:02d}] Done ({epoch_time:.1f}s) | "
            f"Train Loss: {train_loss_avg:.4f} | "
            f"Val Loss: {val_metrics['loss']:.4f} | "
            f"Val IoU: {val_metrics['iou']:.4f} | "
            f"Val Dice: {val_metrics['dice']:.4f} | "
            f"Val Prec: {val_metrics['precision']:.4f} | "
            f"Val Rec: {val_metrics['recall']:.4f} | "
            f"LR: {current_lr:.6f}",
            flush=True
        )

        is_best = val_metrics["iou"] > best_val_iou
        if is_best:
            best_val_iou = val_metrics["iou"]
            best_val_dice = val_metrics["dice"]
            best_epoch = epoch
            epochs_no_improve = 0

            checkpoint = {
                "epoch": epoch,
                "model_state_dict": model.state_dict(),
                "optimizer_state_dict": optimizer.state_dict(),
                "best_val_iou": best_val_iou,
                "best_val_dice": best_val_dice,
                "config": vars(args),
                "metrics": val_metrics,
            }
            torch.save(checkpoint, save_path / "best.pt")
            print(f"    *** New best checkpoint saved: Val IoU={best_val_iou:.4f}, Dice={best_val_dice:.4f} ***", flush=True)
        else:
            epochs_no_improve += 1

        torch.save(
            {
                "epoch": epoch,
                "model_state_dict": model.state_dict(),
                "optimizer_state_dict": optimizer.state_dict(),
                "current_val_iou": val_metrics["iou"],
                "config": vars(args),
            },
            save_path / "last.pt"
        )

        if epochs_no_improve >= args.patience:
            print(f"\n[Early Stopping Triggered] No improvement in validation IoU for {args.patience} epochs.", flush=True)
            print(f"Stopping at epoch {epoch}. Best epoch was {best_epoch} with Val IoU {best_val_iou:.4f}.", flush=True)
            break

    total_duration = time.time() - start_time
    print("-" * 60, flush=True)
    print(f"Training Complete in {total_duration/60:.2f} minutes.", flush=True)
    print(f"Best Validation IoU: {best_val_iou:.4f} | Best Validation Dice: {best_val_dice:.4f} (Epoch {best_epoch})", flush=True)
    print(f"Saved Best Checkpoint: {save_path / 'best.pt'}", flush=True)

    history_record = {
        "best_epoch": best_epoch,
        "best_val_iou": best_val_iou,
        "best_val_dice": best_val_dice,
        "total_epochs_trained": epoch,
        "total_duration_seconds": round(total_duration, 2),
        "config": vars(args),
        "history": history,
    }
    with (save_path / "training_history.json").open("w", encoding="utf-8") as f:
        json.dump(history_record, f, indent=2)

    plt.figure(figsize=(12, 5))
    plt.subplot(1, 2, 1)
    plt.plot(history["train_loss"], label="Train Loss (BCE+Dice)")
    plt.plot(history["val_loss"], label="Val Loss (BCE+Dice)")
    plt.xlabel("Epoch")
    plt.ylabel("Loss")
    plt.title("U-Net++ Training & Validation Loss")
    plt.legend()
    plt.grid(True)

    plt.subplot(1, 2, 2)
    plt.plot(history["val_iou"], label="Val IoU", color="green")
    plt.plot(history["val_dice"], label="Val Dice", color="blue")
    if best_epoch > 0:
        plt.axvline(x=best_epoch - 1, color="red", linestyle="--", label=f"Best Model (Ep {best_epoch})")
    plt.xlabel("Epoch")
    plt.ylabel("Score")
    plt.title("U-Net++ Validation Metrics")
    plt.legend()
    plt.grid(True)

    plt.tight_layout()
    plt.savefig(save_path / "training_curves.png", dpi=120)
    plt.close()
    print(f"Training curves saved to: {save_path / 'training_curves.png'}", flush=True)


if __name__ == "__main__":
    train()

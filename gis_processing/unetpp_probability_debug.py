from __future__ import annotations

import json
from pathlib import Path

import cv2
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
import rasterio
import segmentation_models_pytorch as smp
import torch

ROOT = Path(__file__).resolve().parent.parent
IMAGE_PATH = ROOT / 'gis_processing' / 'input' / 'aerial.tif'
CHECKPOINT_PATH = ROOT / 'building_segmentation' / 'runs' / 'unetpp' / 'building_refinement' / 'best.pt'
OUTPUT_DIR = ROOT / 'gis_processing' / 'outputs' / 'visualizations'
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


def load_model():
    ckpt = torch.load(CHECKPOINT_PATH, map_location='cpu')
    cfg = ckpt.get('config', {})
    model = smp.UnetPlusPlus(
        encoder_name=cfg.get('encoder', 'resnet18'),
        encoder_weights=None,
        in_channels=3,
        classes=1,
        encoder_depth=4,
        decoder_channels=(128, 64, 32, 16),
    )
    model.load_state_dict(ckpt['model_state_dict'])
    model.eval()
    return model


def preprocess_rgb(rgb: np.ndarray, img_size: int = 384) -> torch.Tensor:
    mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
    std = np.array([0.229, 0.224, 0.225], dtype=np.float32)
    resized = cv2.resize(rgb, (img_size, img_size), interpolation=cv2.INTER_LINEAR)
    img_float = (resized / 255.0).astype(np.float32)
    img_norm = (img_float - mean) / std
    return torch.from_numpy(img_norm.transpose(2, 0, 1)).unsqueeze(0)


def diagnostic_counts(prob_map: np.ndarray, thresholds: list[float]) -> dict[str, dict[str, float | int]]:
    result: dict[str, dict[str, float | int]] = {}
    for t in thresholds:
        mask = (prob_map >= t).astype(np.uint8) * 255
        num_labels, _, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        result[str(t)] = {
            'positive_pixels': int(mask.sum() // 255),
            'connected_components': int(num_labels - 1),
            'approx_polygon_count': int(len(contours)),
        }
    return result


def main() -> None:
    model = load_model()
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    model.to(device)

    with rasterio.open(IMAGE_PATH) as ds:
        arr = ds.read()[:3]
        rgb = np.moveaxis(arr, 0, -1)
        if rgb.dtype != np.uint8:
            rgb = np.clip(rgb, 0, 255).astype(np.uint8)
        orig_h, orig_w = rgb.shape[:2]

    x = preprocess_rgb(rgb, img_size=384).to(device)
    with torch.no_grad():
        logits = model(x)
        prob_small = torch.sigmoid(logits).squeeze().cpu().numpy()

    prob_full = cv2.resize(prob_small.astype(np.float32), (orig_w, orig_h), interpolation=cv2.INTER_LINEAR)
    thresholds = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7]
    stats = {
        'raw_model_output_shape': list(prob_small.shape),
        'raw_probability_min': float(prob_small.min()),
        'raw_probability_max': float(prob_small.max()),
        'raw_probability_mean': float(prob_small.mean()),
        'raw_probability_median': float(np.median(prob_small)),
        'percentage_above_threshold': {str(t): float((prob_small >= t).mean() * 100.0) for t in [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]},
        'full_size_threshold_summary': diagnostic_counts(prob_full, thresholds),
    }

    out_json = ROOT / 'gis_processing' / 'outputs' / 'unetpp_probability_debug.json'
    out_json.write_text(json.dumps(stats, indent=2), encoding='utf-8')

    fig, axes = plt.subplots(1, 3, figsize=(18, 6))
    axes[0].imshow(cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR))
    axes[0].set_title('1. Original aerial image')
    axes[0].axis('off')

    heat = axes[1].imshow(prob_full, cmap='plasma', vmin=0.0, vmax=1.0)
    axes[1].set_title('2. U-Net++ probability heatmap')
    axes[1].axis('off')
    fig.colorbar(heat, ax=axes[1], fraction=0.046, pad=0.04)

    binary_05 = (prob_full >= 0.5).astype(np.uint8)
    axes[2].imshow(binary_05, cmap='gray')
    axes[2].set_title('3. Binary mask @ 0.5')
    axes[2].axis('off')
    fig.tight_layout()
    fig.savefig(OUTPUT_DIR / 'unetpp_probability_debug.png', dpi=200)
    plt.close(fig)

    for threshold in [0.2, 0.3, 0.4]:
        mask = (prob_full >= threshold).astype(np.uint8)
        fig, ax = plt.subplots(figsize=(6, 6))
        ax.imshow(mask, cmap='gray')
        ax.set_title(f'Threshold {threshold}')
        ax.axis('off')
        fig.tight_layout()
        fig.savefig(OUTPUT_DIR / f'threshold_{threshold}.png', dpi=200)
        plt.close(fig)

    print(json.dumps(stats, indent=2))


if __name__ == '__main__':
    main()

"""Runner for the GIS spatial consensus and quality decision layer."""
from __future__ import annotations

import argparse
from pathlib import Path

try:
    from .spatial_consensus import build_consensus_from_model, write_spatial_consensus_outputs
except ImportError:  # pragma: no cover - support direct script execution
    from spatial_consensus import build_consensus_from_model, write_spatial_consensus_outputs


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description='Spatial consensus quality layer for GIS building detection.')
    parser.add_argument('--image', required=True, help='Georeferenced GeoTIFF input image.')
    parser.add_argument('--model', required=True, help='Model path to evaluate; U-Net++ is the supported model in this project.')
    parser.add_argument('--parcels', help='Optional GeoJSON, Shapefile, or GeoPackage parcel layer.')
    parser.add_argument('--parcel-id-field', default='ID', help='Unique parcel ID field in the parcel layer.')
    parser.add_argument('--conf', type=float, default=0.5, help='Minimum model confidence for candidate admission.')
    parser.add_argument('--output-dir', default=str(Path(__file__).resolve().parent / 'outputs'), help='Base output directory for final GIS consensus artifacts.')
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    output_root = Path(args.output_dir)
    result = build_consensus_from_model(args.image, args.model, conf=args.conf, parcels=args.parcels, parcel_id_field=args.parcel_id_field)
    outputs = write_spatial_consensus_outputs(result, output_root)
    print(f'Created spatial consensus outputs in: {output_root}')
    print(f'Empty result: {result.empty}')
    print(f'Message: {result.report_message}')
    for key, path in outputs.items():
        print(f'{key}: {path}')


if __name__ == '__main__':
    main()

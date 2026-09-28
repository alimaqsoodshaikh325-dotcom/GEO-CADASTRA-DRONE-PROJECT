"""Phase 2/3 CLI: YOLO masks -> georeferenced footprints -> cadastral features."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from pyproj import CRS
from georeference import GeoreferencingError, pixel_to_raster_coordinates, read_raster_reference, reproject_geometry, select_measurement_crs
from measurements import calculate_measurements, write_measurements
from parcel_analysis import analyse_parcels, read_parcels, write_csv
from polygon_extractor import extract_buildings, save_image_visualization, write_pixel_geojson

ROOT = Path(__file__).resolve().parent
OUTPUTS = ROOT / 'outputs'


def paths(output_root: Path) -> dict[str, Path]:
    result = {'root': output_root, 'geojson': output_root / 'geojson', 'visualizations': output_root / 'visualizations', 'reports': output_root / 'reports'}
    for directory in result.values(): directory.mkdir(parents=True, exist_ok=True)
    return result


def write_geojson(buildings: list[dict], source_crs, output_path: Path) -> None:
    """Write standards-compatible WGS84 GeoJSON while recording the input CRS."""
    wgs84 = CRS.from_epsg(4326)
    features = [{'type': 'Feature', 'properties': {'building_id': item['building_id'], 'confidence': item['confidence'], 'source_crs': source_crs.to_string()}, 'geometry': reproject_geometry(item['geometry_source'], source_crs, wgs84).__geo_interface__} for item in buildings]
    output_path.write_text(json.dumps({'type': 'FeatureCollection', 'features': features}, indent=2), encoding='utf-8')


def write_quality_report(path: Path, *, total: int, geographic: bool, invalid: int = 0, unassigned: int = 0, crossing: int = 0, parcels: int = 0, parcels_with_buildings: int = 0, message: str = '') -> None:
    path.write_text('\n'.join(['GIS Quality Report', '==================', f'Total buildings: {total}', f'Valid buildings: {total - invalid}', f'Invalid buildings: {invalid}', f'Buildings without geographic coordinates: {0 if geographic else total}', f'Buildings without parcel assignment: {unassigned}', f'Buildings crossing parcel boundaries: {crossing}', f'Total parcels: {parcels}', f'Parcels containing buildings: {parcels_with_buildings}', message]).strip() + '\n', encoding='utf-8')


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description='Generate safe georeferenced building footprints and parcel features.')
    parser.add_argument('--image', required=True, help='Georeferenced GeoTIFF input image.')
    parser.add_argument('--model', required=True, help='U-Net++ checkpoint path (.pt).')
    parser.add_argument('--parcels', help='Optional GeoJSON, Shapefile, or GeoPackage parcel layer.')
    parser.add_argument('--parcel-id-field', default='ID', help='Unique parcel ID column when --parcels is supplied; many parcel layers use ID instead of parcel_id.')
    parser.add_argument('--conf', type=float, default=.5)
    parser.add_argument('--imgsz', type=int, default=384)
    parser.add_argument('--output-dir', default=str(OUTPUTS))
    return parser.parse_args()


def main() -> None:
    args = parse_args(); output = paths(Path(args.output_dir)); detections = extract_buildings(args.image, args.model, args.conf, args.imgsz)
    save_image_visualization(args.image, detections, output['visualizations'] / 'building_footprints.png')
    try:
        reference = read_raster_reference(args.image)
    except GeoreferencingError as error:
        write_pixel_geojson(detections, output['geojson'] / 'building_footprints_pixels.geojson')
        write_quality_report(output['reports'] / 'gis_quality_report.txt', total=len(detections), geographic=False, message=f'STOP: {error}')
        raise SystemExit(f'{error}\nPixel-space polygons and a quality report were written; geographic conversion was not performed.')
    source_buildings = [{'building_id': item.building_id, 'confidence': item.confidence, 'geometry_source': pixel_to_raster_coordinates(item.geometry_px, reference)} for item in detections]
    metric_crs = select_measurement_crs(source_buildings[0]['geometry_source'], reference.crs) if source_buildings else reference.crs
    buildings = [{**item, 'geometry_metric': reproject_geometry(item['geometry_source'], reference.crs, metric_crs)} for item in source_buildings]
    write_geojson(buildings, reference.crs, output['geojson'] / 'building_footprints.geojson')
    write_measurements(calculate_measurements(buildings, metric_crs), output['reports'] / 'building_statistics.csv')
    relationships = []; parcel_stats = []; assigned = set(); crossing = set(); parcel_count = 0
    if args.parcels:
        parcels = read_parcels(args.parcels, args.parcel_id_field, metric_crs); parcel_count = len(parcels)
        relationships, parcel_stats, assigned, crossing = analyse_parcels(buildings, parcels, args.parcel_id_field)
        write_csv(relationships, output['reports'] / 'building_parcel_relationship.csv', ['building_id','parcel_id','confidence','building_area_m2','parcel_area_m2','intersection_area_m2','building_coverage_ratio'])
        write_csv(parcel_stats, output['reports'] / 'parcel_statistics.csv', ['parcel_id','parcel_area_m2','building_count','total_building_area_m2','building_coverage_ratio','average_confidence','buildings_crossing_boundaries'])
    write_quality_report(output['reports'] / 'gis_quality_report.txt', total=len(buildings), geographic=True, unassigned=len(buildings)-len(assigned) if args.parcels else 0, crossing=len(crossing), parcels=parcel_count, parcels_with_buildings=sum(1 for row in parcel_stats if row['building_count']), message=f'Source CRS: {reference.crs.to_string()}\nMeasurement CRS: {metric_crs.to_string()}')
    print(f'Created GIS outputs in: {output["root"]}')


if __name__ == '__main__': main()

"""Cadastral parcel overlay. It reports every relevant building/parcel intersection."""
from __future__ import annotations

import csv
from pathlib import Path

import geopandas as gpd
from pyproj import CRS


def read_parcels(parcel_path: str | Path, parcel_id_field: str, metric_crs: CRS) -> gpd.GeoDataFrame:
    parcels = gpd.read_file(parcel_path)
    if parcels.crs is None:
        raise ValueError('Parcel layer CRS is missing. Parcel overlay cannot be safely performed.')
    if parcel_id_field not in parcels.columns:
        raise ValueError(f'Parcel ID field {parcel_id_field!r} is missing from the parcel layer.')
    if parcels[parcel_id_field].isna().any() or parcels[parcel_id_field].duplicated().any():
        raise ValueError('Parcel IDs must be present and unique.')
    parcels = parcels[~parcels.geometry.is_empty & parcels.geometry.notna()].copy().to_crs(metric_crs)
    if parcels.empty:
        raise ValueError('Parcel layer has no valid geometries.')
    return parcels


def analyse_parcels(buildings: list[dict], parcels: gpd.GeoDataFrame, parcel_id_field: str) -> tuple[list[dict], list[dict], set[str], set[str]]:
    relationships, assigned, crossing = [], set(), set()
    parcel_areas = {str(row[parcel_id_field]): row.geometry.area for _, row in parcels.iterrows()}
    for building in buildings:
        matches = []
        for _, parcel in parcels.iterrows():
            intersection = building['geometry_metric'].intersection(parcel.geometry)
            if intersection.is_empty or intersection.area <= 0:
                continue
            parcel_id = str(parcel[parcel_id_field]); matches.append(parcel_id); assigned.add(building['building_id'])
            relationships.append({'building_id': building['building_id'], 'parcel_id': parcel_id, 'confidence': building['confidence'], 'building_area_m2': building['geometry_metric'].area, 'parcel_area_m2': parcel_areas[parcel_id], 'intersection_area_m2': intersection.area, 'building_coverage_ratio': intersection.area / parcel_areas[parcel_id] if parcel_areas[parcel_id] else 0.0})
        if len(matches) > 1:
            crossing.add(building['building_id'])
    stats = []
    for parcel_id, parcel_area in parcel_areas.items():
        rows = [row for row in relationships if row['parcel_id'] == parcel_id]
        stats.append({'parcel_id': parcel_id, 'parcel_area_m2': parcel_area, 'building_count': len({row['building_id'] for row in rows}), 'total_building_area_m2': sum(row['intersection_area_m2'] for row in rows), 'building_coverage_ratio': sum(row['intersection_area_m2'] for row in rows) / parcel_area if parcel_area else 0.0, 'average_confidence': sum(row['confidence'] for row in rows) / len(rows) if rows else 0.0, 'buildings_crossing_boundaries': sum(row['building_id'] in crossing for row in rows)})
    return relationships, stats, assigned, crossing


def write_csv(rows: list[dict], output_path: str | Path, fields: list[str]) -> None:
    with Path(output_path).open('w', newline='', encoding='utf-8') as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader(); writer.writerows(rows)

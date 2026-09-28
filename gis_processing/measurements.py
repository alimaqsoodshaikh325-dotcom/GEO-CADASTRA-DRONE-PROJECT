"""Metric building measurements. Call only with an appropriate metre-based CRS."""
from __future__ import annotations

import csv
from math import pi
from pathlib import Path

from pyproj import CRS
from shapely.geometry.base import BaseGeometry


def measurement_row(building_id: str, confidence: float, geometry: BaseGeometry) -> dict:
    min_x, min_y, max_x, max_y = geometry.bounds
    area, perimeter = geometry.area, geometry.length
    centroid = geometry.centroid
    return {'building_id': building_id, 'confidence': round(confidence, 6), 'area_m2': round(area, 4), 'perimeter_m': round(perimeter, 4), 'centroid_x': round(centroid.x, 6), 'centroid_y': round(centroid.y, 6), 'width_m': round(max_x - min_x, 4), 'height_m': round(max_y - min_y, 4), 'compactness': round((4 * pi * area / (perimeter * perimeter)) if perimeter else 0.0, 6)}


def calculate_measurements(buildings: list[dict], metric_crs: CRS) -> list[dict]:
    if not buildings:
        return []
    if not metric_crs.is_projected:
        raise ValueError('Metric measurements require a projected CRS; degrees are not valid area or perimeter units.')
    return [measurement_row(item['building_id'], item['confidence'], item['geometry_metric']) for item in buildings]


def write_measurements(rows: list[dict], output_path: str | Path) -> None:
    fields = ['building_id', 'confidence', 'area_m2', 'perimeter_m', 'centroid_x', 'centroid_y', 'width_m', 'height_m', 'compactness']
    with Path(output_path).open('w', newline='', encoding='utf-8') as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)

"""Spatial consensus and quality-assessment layer for building candidate evaluation.

This module is intentionally conservative: it never invents building detections,
never forces all models to produce matches, and reports an empty result cleanly when
no model candidate is produced for the supplied raster.
"""
from __future__ import annotations

import csv
import json
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Iterable, Any

import geopandas as gpd
import numpy as np
from pyproj import CRS
from shapely.geometry import Polygon, MultiPolygon
from shapely.ops import unary_union

try:
    from .georeference import GeoreferencingError, pixel_to_raster_coordinates, read_raster_reference, reproject_geometry, select_measurement_crs
    from .parcel_analysis import read_parcels
    from .polygon_extractor import extract_buildings
except ImportError:  # pragma: no cover - support direct script execution
    from georeference import GeoreferencingError, pixel_to_raster_coordinates, read_raster_reference, reproject_geometry, select_measurement_crs
    from parcel_analysis import read_parcels
    from polygon_extractor import extract_buildings


MODEL_CONFIDENCE_THRESHOLDS = {
    'HIGH_CONFIDENCE': 0.75,
    'MEDIUM_CONFIDENCE': 0.45,
    'LOW_CONFIDENCE': 0.25,
    'REVIEW_REQUIRED': 0.0,
}

MIN_POLYGON_AREA = 10.0
MIN_VERTEX_COUNT = 4


@dataclass
class BuildingCandidate:
    building_id: str
    model_name: str
    confidence: float
    geometry: Any
    area: float = 0.0
    perimeter: float = 0.0
    vertex_count: int = 0
    geometry_validity: bool = False
    parcel_id: str | None = None
    intersection_area: float = 0.0
    building_coverage_ratio: float = 0.0
    boundary_status: str = 'NORMAL'
    quality_class: str = 'REVIEW_REQUIRED'
    notes: str = ''


@dataclass
class SpatialConsensusResult:
    candidates: list[BuildingCandidate] = field(default_factory=list)
    source_crs: CRS | None = None
    measurement_crs: CRS | None = None
    empty: bool = False
    report_message: str = ''
    model_names: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


def _model_name_from_path(model_path: str | Path | None) -> str:
    if model_path is None:
        return 'U-Net++'
    text = str(model_path).lower()
    if 'yolo' in text or 'ultralytics' in text:
        return 'YOLO11-Seg'
    if 'maskrcnn' in text or 'mask_rcnn' in text or 'mask-r-cnn' in text:
        return 'Mask R-CNN'
    return 'U-Net++'


def _polygon_vertex_count(geometry: Any) -> int:
    if geometry is None:
        return 0
    if hasattr(geometry, 'geom_type') and geometry.geom_type == 'MultiPolygon':
        return sum(_polygon_vertex_count(part) for part in geometry.geoms)
    if hasattr(geometry, 'exterior'):
        return len(geometry.exterior.coords)
    return 0


def _normalise_geometry(geometry: Any) -> Any | None:
    if geometry is None:
        return None
    if geometry.is_empty:
        return None
    if not geometry.is_valid:
        geometry = geometry.buffer(0)
    if geometry.is_empty:
        return None
    if geometry.geom_type not in {'Polygon', 'MultiPolygon'}:
        return None
    if geometry.geom_type == 'MultiPolygon':
        geometry = MultiPolygon([part for part in geometry.geoms if part.area > 0])
    if geometry.is_empty:
        return None
    return geometry


def _quality_class_for_candidate(candidate: BuildingCandidate) -> str:
    if not candidate.geometry_validity:
        return 'REVIEW_REQUIRED'
    if candidate.confidence >= MODEL_CONFIDENCE_THRESHOLDS['HIGH_CONFIDENCE']:
        if candidate.area >= MIN_POLYGON_AREA and candidate.vertex_count >= MIN_VERTEX_COUNT and candidate.boundary_status == 'NORMAL':
            return 'HIGH_CONFIDENCE'
    if candidate.confidence >= MODEL_CONFIDENCE_THRESHOLDS['MEDIUM_CONFIDENCE']:
        if candidate.area >= MIN_POLYGON_AREA * 0.5 and candidate.vertex_count >= MIN_VERTEX_COUNT - 1 and candidate.boundary_status in {'NORMAL', 'UNASSIGNED'}:
            return 'MEDIUM_CONFIDENCE'
    if candidate.confidence >= MODEL_CONFIDENCE_THRESHOLDS['LOW_CONFIDENCE']:
        if candidate.area >= 0.0 and candidate.vertex_count >= 3:
            return 'LOW_CONFIDENCE'
    return 'REVIEW_REQUIRED'


def _parcel_status_for_candidate(candidate: BuildingCandidate) -> str:
    if not candidate.geometry_validity:
        return 'GEOMETRY_ERROR'
    if candidate.parcel_id is None:
        return 'UNASSIGNED'
    if candidate.boundary_status == 'BOUNDARY_CROSSING':
        return 'BOUNDARY_CROSSING'
    if candidate.boundary_status == 'MULTI_PARCEL':
        return 'MULTI_PARCEL'
    return 'NORMAL'


def _candidate_from_detection(detection: Any, model_name: str, building_index: int) -> BuildingCandidate:
    geometry = _normalise_geometry(getattr(detection, 'geometry_px', None))
    if geometry is None:
        return BuildingCandidate(
            building_id=f'{model_name}-B{building_index:03d}',
            model_name=model_name,
            confidence=float(getattr(detection, 'confidence', 0.0)),
            geometry=None,
            area=0.0,
            perimeter=0.0,
            vertex_count=0,
            geometry_validity=False,
            parcel_id=None,
            intersection_area=0.0,
            building_coverage_ratio=0.0,
            boundary_status='GEOMETRY_ERROR',
            quality_class='REVIEW_REQUIRED',
            notes='Geometry empty or invalid after validation.',
        )
    area = float(geometry.area)
    perimeter = float(geometry.length)
    vertex_count = _polygon_vertex_count(geometry)
    candidate = BuildingCandidate(
        building_id=f'{model_name}-B{building_index:03d}',
        model_name=model_name,
        confidence=float(getattr(detection, 'confidence', 0.0)),
        geometry=geometry,
        area=area,
        perimeter=perimeter,
        vertex_count=vertex_count,
        geometry_validity=bool(geometry.is_valid and not geometry.is_empty and area > 0),
        parcel_id=None,
        intersection_area=0.0,
        building_coverage_ratio=0.0,
        boundary_status='NORMAL',
        quality_class='REVIEW_REQUIRED',
        notes='',
    )
    candidate.quality_class = _quality_class_for_candidate(candidate)
    candidate.boundary_status = _parcel_status_for_candidate(candidate)
    return candidate


def _model_agreement_score(candidate: BuildingCandidate, other_candidates: Iterable[BuildingCandidate]) -> float:
    overlaps = []
    for other in other_candidates:
        if other.building_id == candidate.building_id or other.model_name == candidate.model_name:
            continue
        if candidate.geometry is None or other.geometry is None:
            continue
        try:
            overlap = candidate.geometry.intersection(other.geometry).area
            union = candidate.geometry.union(other.geometry).area
            if union > 0:
                overlaps.append(overlap / union)
        except Exception:
            continue
    if overlaps:
        return float(np.mean(overlaps))
    return 1.0


def _apply_parcel_relationships(candidates: list[BuildingCandidate], parcels: gpd.GeoDataFrame, parcel_id_field: str) -> None:
    if parcels.empty:
        return
    for candidate in candidates:
        if candidate.geometry is None or not candidate.geometry_validity:
            candidate.boundary_status = 'GEOMETRY_ERROR'
            candidate.notes = 'Geometry invalid; parcel relationship not evaluated.'
            candidate.quality_class = 'REVIEW_REQUIRED'
            continue

        matches = []
        for _, parcel in parcels.iterrows():
            parcel_id = str(parcel[parcel_id_field])
            if candidate.geometry.intersects(parcel.geometry):
                inter = candidate.geometry.intersection(parcel.geometry)
                if not inter.is_empty and inter.area > 0:
                    matches.append((parcel_id, inter.area, parcel.geometry.area))

        if not matches:
            candidate.parcel_id = None
            candidate.boundary_status = 'UNASSIGNED'
            candidate.notes = 'No parcel intersection detected.'
            candidate.quality_class = 'REVIEW_REQUIRED'
            continue

        if len(matches) > 1:
            candidate.parcel_id = ';'.join(pid for pid, _, _ in matches)
            candidate.boundary_status = 'MULTI_PARCEL'
            candidate.notes = 'Potential multi-parcel building; cadastral verification recommended.'
            candidate.quality_class = 'LOW_CONFIDENCE'
            continue

        parcel_id, intersection_area, parcel_area = matches[0]
        candidate.parcel_id = parcel_id
        candidate.intersection_area = float(intersection_area)
        candidate.building_coverage_ratio = float(intersection_area / parcel_area) if parcel_area else 0.0
        if candidate.intersection_area < candidate.area * 0.99:
            candidate.boundary_status = 'BOUNDARY_CROSSING'
            candidate.notes = 'Potential boundary crossing requiring cadastral verification.'
            candidate.quality_class = 'LOW_CONFIDENCE'
        else:
            candidate.boundary_status = 'NORMAL'
            candidate.notes = 'Contained within a single parcel.'

        candidate.quality_class = _quality_class_for_candidate(candidate)


def _collect_model_candidates(image_path: str | Path, model_path: str | Path, conf: float, model_name: str | None = None) -> list[BuildingCandidate]:
    model_name = model_name or _model_name_from_path(model_path)
    raw_candidates = extract_buildings(image_path, model_path, confidence=float(conf), imgsz=384)
    if not raw_candidates:
        return []
    candidates = []
    for idx, detection in enumerate(raw_candidates, start=1):
        candidate = _candidate_from_detection(detection, model_name, idx)
        candidates.append(candidate)
    return candidates


def build_consensus_from_model(image_path: str | Path, model_path: str | Path, conf: float = 0.5, parcels: str | Path | None = None, parcel_id_field: str = 'ID') -> SpatialConsensusResult:
    """Create a consensus result from the supplied model without forcing other models."""
    model_name = _model_name_from_path(model_path)
    try:
        reference = read_raster_reference(image_path)
    except GeoreferencingError as exc:
        return SpatialConsensusResult(
            candidates=[],
            source_crs=None,
            measurement_crs=None,
            empty=True,
            report_message=f'No building candidates produced by the supplied model on this raster. GIS georeferencing validation failed: {exc}',
            model_names=[model_name],
            warnings=[str(exc)],
        )

    candidates = _collect_model_candidates(image_path, model_path, conf, model_name=model_name)
    if not candidates:
        return SpatialConsensusResult(
            candidates=[],
            source_crs=reference.crs,
            measurement_crs=reference.crs,
            empty=True,
            report_message='No building candidates produced by the supplied model on this raster.',
            model_names=[model_name],
            warnings=['No detections from the supplied model.'],
        )

    # Reproject each candidate to the raster CRS before parcel evaluation.
    source_candidates: list[BuildingCandidate] = []
    for candidate in candidates:
        if candidate.geometry is None:
            continue
        projected = pixel_to_raster_coordinates(candidate.geometry, reference)
        candidate.geometry = projected
        candidate.area = float(projected.area)
        candidate.perimeter = float(projected.length)
        candidate.vertex_count = _polygon_vertex_count(projected)
        candidate.geometry_validity = bool(projected.is_valid and not projected.is_empty and projected.area > 0)
        candidate.quality_class = _quality_class_for_candidate(candidate)
        source_candidates.append(candidate)

    if parcels:
        parcel_gdf = read_parcels(parcels, parcel_id_field, reference.crs)
        _apply_parcel_relationships(source_candidates, parcel_gdf, parcel_id_field)

    for candidate in source_candidates:
        candidate.quality_class = _quality_class_for_candidate(candidate)
        status = _parcel_status_for_candidate(candidate)
        candidate.boundary_status = status

    return SpatialConsensusResult(
        candidates=source_candidates,
        source_crs=reference.crs,
        measurement_crs=reference.crs,
        empty=False,
        report_message='Building candidates produced and processed for consensus review.',
        model_names=[model_name],
        warnings=[],
    )


def _empty_geojson() -> dict[str, Any]:
    return {'type': 'FeatureCollection', 'features': []}


def _write_empty_geojson(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(_empty_geojson(), indent=2), encoding='utf-8')


def _write_csv_with_headers(path: Path, headers: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('w', newline='', encoding='utf-8') as handle:
        writer = csv.writer(handle)
        writer.writerow(headers)


def _write_records(path: Path, headers: list[str], rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('w', newline='', encoding='utf-8') as handle:
        writer = csv.DictWriter(handle, fieldnames=headers)
        writer.writeheader()
        for row in rows:
            writer.writerow({key: row.get(key, '') for key in headers})


def write_spatial_consensus_outputs(result: SpatialConsensusResult, output_root: str | Path) -> dict[str, Path]:
    root = Path(output_root)
    final_dir = root / 'final'
    final_dir.mkdir(parents=True, exist_ok=True)
    vis_dir = root / 'visualizations' / 'final'
    vis_dir.mkdir(parents=True, exist_ok=True)

    empty_geojson_path = final_dir / 'final_buildings.geojson'
    measurements_path = final_dir / 'building_measurements.csv'
    parcel_assoc_path = final_dir / 'building_parcel_association.csv'
    parcel_stats_path = final_dir / 'parcel_statistics.csv'
    report_csv_path = final_dir / 'spatial_consensus_report.csv'
    report_txt_path = final_dir / 'spatial_consensus_report.txt'

    if result.empty or not result.candidates:
        _write_empty_geojson(empty_geojson_path)
        _write_csv_with_headers(measurements_path, ['building_id', 'model_name', 'confidence', 'area', 'perimeter', 'vertex_count', 'geometry_validity', 'parcel_id', 'intersection_area', 'building_coverage_ratio', 'boundary_status', 'quality_class'])
        _write_csv_with_headers(parcel_assoc_path, ['building_id', 'model_name', 'parcel_id', 'intersection_area', 'building_coverage_ratio', 'boundary_status'])
        _write_csv_with_headers(parcel_stats_path, ['parcel_id', 'parcel_area_m2', 'building_count', 'total_building_area_m2', 'building_coverage_ratio', 'average_confidence', 'buildings_crossing_boundaries'])
        _write_csv_with_headers(report_csv_path, ['status', 'model_name', 'candidate_count', 'message'])
        report_txt_path.write_text(
            'Spatial Consensus Report\n======================\n'
            'Status: EMPTY_RESULT\n'
            'Message: No building candidates produced by the supplied model on this raster.\n'
            f'Models evaluated: {", ".join(result.model_names) if result.model_names else "none"}\n'
            f'Warnings: {"; ".join(result.warnings) if result.warnings else "none"}\n',
            encoding='utf-8',
        )
        # create blank visual outputs
        for name in ['final_buildings_overlay.png', 'confidence_overlay.png', 'parcel_relationship_overlay.png']:
            canvas = np.zeros((512, 512, 3), dtype=np.uint8)
            canvas[:, :] = 30
            from PIL import Image, ImageDraw, ImageFont
            img = Image.fromarray(canvas)
            draw = ImageDraw.Draw(img)
            try:
                font = ImageFont.truetype('arial.ttf', 20)
            except Exception:
                font = ImageFont.load_default()
            draw.text((20, 20), 'No building candidates', fill=(255, 255, 255), font=font)
            draw.text((20, 50), 'model result: empty', fill=(255, 255, 255), font=font)
            img.save(vis_dir / name)
        return {
            'final_buildings.geojson': empty_geojson_path,
            'building_measurements.csv': measurements_path,
            'building_parcel_association.csv': parcel_assoc_path,
            'parcel_statistics.csv': parcel_stats_path,
            'spatial_consensus_report.csv': report_csv_path,
            'spatial_consensus_report.txt': report_txt_path,
            'final_buildings_overlay.png': vis_dir / 'final_buildings_overlay.png',
            'confidence_overlay.png': vis_dir / 'confidence_overlay.png',
            'parcel_relationship_overlay.png': vis_dir / 'parcel_relationship_overlay.png',
        }

    rows = []
    for candidate in result.candidates:
        rows.append({
            'building_id': candidate.building_id,
            'model_name': candidate.model_name,
            'confidence': candidate.confidence,
            'area': candidate.area,
            'perimeter': candidate.perimeter,
            'vertex_count': candidate.vertex_count,
            'geometry_validity': candidate.geometry_validity,
            'parcel_id': candidate.parcel_id,
            'intersection_area': candidate.intersection_area,
            'building_coverage_ratio': candidate.building_coverage_ratio,
            'boundary_status': candidate.boundary_status,
            'quality_class': candidate.quality_class,
        })
    _write_records(measurements_path, ['building_id', 'model_name', 'confidence', 'area', 'perimeter', 'vertex_count', 'geometry_validity', 'parcel_id', 'intersection_area', 'building_coverage_ratio', 'boundary_status', 'quality_class'], rows)

    parcel_rows = []
    for candidate in result.candidates:
        parcel_rows.append({
            'building_id': candidate.building_id,
            'model_name': candidate.model_name,
            'parcel_id': candidate.parcel_id,
            'intersection_area': candidate.intersection_area,
            'building_coverage_ratio': candidate.building_coverage_ratio,
            'boundary_status': candidate.boundary_status,
        })
    _write_records(parcel_assoc_path, ['building_id', 'model_name', 'parcel_id', 'intersection_area', 'building_coverage_ratio', 'boundary_status'], parcel_rows)

    # Empty parcel summary for now; future-ready aggregation can be replaced.
    _write_csv_with_headers(parcel_stats_path, ['parcel_id', 'parcel_area_m2', 'building_count', 'total_building_area_m2', 'building_coverage_ratio', 'average_confidence', 'buildings_crossing_boundaries'])

    report_rows = [{
        'status': 'SUCCESS',
        'model_name': ', '.join(result.model_names),
        'candidate_count': len(result.candidates),
        'message': result.report_message,
    }]
    _write_records(report_csv_path, ['status', 'model_name', 'candidate_count', 'message'], report_rows)

    features = []
    for candidate in result.candidates:
        if candidate.geometry is None:
            continue
        features.append({
            'type': 'Feature',
            'properties': {
                'building_id': candidate.building_id,
                'model_name': candidate.model_name,
                'confidence': float(candidate.confidence),
                'quality_class': candidate.quality_class,
                'boundary_status': candidate.boundary_status,
                'parcel_id': candidate.parcel_id,
                'area': float(candidate.area),
                'perimeter': float(candidate.perimeter),
                'vertex_count': int(candidate.vertex_count),
                'geometry_validity': bool(candidate.geometry_validity),
            },
            'geometry': candidate.geometry.__geo_interface__,
        })
    empty_geojson = {'type': 'FeatureCollection', 'features': features}
    empty_geojson_path.write_text(json.dumps(empty_geojson, indent=2), encoding='utf-8')

    report_txt_path.write_text(
        'Spatial Consensus Report\n======================\n'
        f'Status: {"SUCCESS" if result.candidates else "EMPTY_RESULT"}\n'
        f'Message: {result.report_message}\n'
        f'Candidate count: {len(result.candidates)}\n'
        f'Models evaluated: {", ".join(result.model_names) if result.model_names else "none"}\n'
        f'CRS: {result.source_crs.to_string() if result.source_crs is not None else "unknown"}\n',
        encoding='utf-8',
    )

    for name in ['final_buildings_overlay.png', 'confidence_overlay.png', 'parcel_relationship_overlay.png']:
        canvas = np.zeros((512, 512, 3), dtype=np.uint8)
        canvas[:, :] = 30
        from PIL import Image, ImageDraw, ImageFont
        img = Image.fromarray(canvas)
        draw = ImageDraw.Draw(img)
        try:
            font = ImageFont.truetype('arial.ttf', 20)
        except Exception:
            font = ImageFont.load_default()
        line = f'Candidates: {len(result.candidates)}'
        draw.text((20, 20), line, fill=(255, 255, 255), font=font)
        draw.text((20, 50), result.report_message[:80], fill=(255, 255, 255), font=font)
        img.save(vis_dir / name)

    return {
        'final_buildings.geojson': empty_geojson_path,
        'building_measurements.csv': measurements_path,
        'building_parcel_association.csv': parcel_assoc_path,
        'parcel_statistics.csv': parcel_stats_path,
        'spatial_consensus_report.csv': report_csv_path,
        'spatial_consensus_report.txt': report_txt_path,
        'final_buildings_overlay.png': vis_dir / 'final_buildings_overlay.png',
        'confidence_overlay.png': vis_dir / 'confidence_overlay.png',
        'parcel_relationship_overlay.png': vis_dir / 'parcel_relationship_overlay.png',
    }


def _write_empty_outputs(output_root: str | Path):
    root = Path(output_root)
    final_dir = root / 'final'
    vis_dir = root / 'visualizations' / 'final'
    final_dir.mkdir(parents=True, exist_ok=True)
    vis_dir.mkdir(parents=True, exist_ok=True)
    _write_empty_geojson(final_dir / 'final_buildings.geojson')
    _write_csv_with_headers(final_dir / 'building_measurements.csv', ['building_id', 'model_name', 'confidence', 'area', 'perimeter', 'vertex_count', 'geometry_validity', 'parcel_id', 'intersection_area', 'building_coverage_ratio', 'boundary_status', 'quality_class'])
    _write_csv_with_headers(final_dir / 'building_parcel_association.csv', ['building_id', 'model_name', 'parcel_id', 'intersection_area', 'building_coverage_ratio', 'boundary_status'])
    _write_csv_with_headers(final_dir / 'parcel_statistics.csv', ['parcel_id', 'parcel_area_m2', 'building_count', 'total_building_area_m2', 'building_coverage_ratio', 'average_confidence', 'buildings_crossing_boundaries'])
    _write_csv_with_headers(final_dir / 'spatial_consensus_report.csv', ['status', 'model_name', 'candidate_count', 'message'])
    (final_dir / 'spatial_consensus_report.txt').write_text(
        'Spatial Consensus Report\n======================\nStatus: EMPTY_RESULT\nMessage: No building candidates produced by the supplied model on this raster.\n',
        encoding='utf-8',
    )


if __name__ == '__main__':
    raise SystemExit('This module is a library; use gis_processing/run_spatial_consensus.py to execute the spatial consensus workflow.')

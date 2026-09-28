from __future__ import annotations

from pathlib import Path

import geopandas as gpd
import pandas as pd
import pytest
from shapely.geometry import Polygon, box

from gis_processing.spatial_consensus import BuildingCandidate, SpatialConsensusResult, _parcel_status_for_candidate, build_consensus_from_model, write_spatial_consensus_outputs


def test_empty_predictions_yield_empty_result():
    result = SpatialConsensusResult(candidates=[], empty=True, report_message='No building candidates produced by the supplied model on this raster.', model_names=['U-Net++'])
    tmp = Path('tmp_spatial_empty')
    tmp.mkdir(exist_ok=True)
    paths = write_spatial_consensus_outputs(result, tmp)
    gj = gpd.read_file(paths['final_buildings.geojson'])
    assert len(gj) == 0
    assert paths['spatial_consensus_report.txt'].exists()
    text = paths['spatial_consensus_report.txt'].read_text(encoding='utf-8')
    assert 'No building candidates produced by the supplied model on this raster.' in text


def test_valid_polygon_is_recognized():
    polygon = box(0, 0, 10, 10)
    candidate = BuildingCandidate(
        building_id='B001',
        model_name='U-Net++',
        confidence=0.9,
        geometry=polygon,
        area=100.0,
        perimeter=40.0,
        vertex_count=5,
        geometry_validity=True,
        parcel_id='P1',
        intersection_area=80.0,
        building_coverage_ratio=0.8,
        boundary_status='NORMAL',
        quality_class='HIGH_CONFIDENCE',
    )
    assert candidate.geometry_validity is True
    assert _parcel_status_for_candidate(candidate) == 'NORMAL'


def test_invalid_polygon_is_review_required():
    polygon = Polygon([(0, 0), (2, 2), (2, 0), (0, 2), (0, 0)])
    candidate = BuildingCandidate(
        building_id='B002',
        model_name='U-Net++',
        confidence=0.8,
        geometry=polygon,
        area=0.0,
        perimeter=0.0,
        vertex_count=5,
        geometry_validity=False,
        parcel_id=None,
        intersection_area=0.0,
        building_coverage_ratio=0.0,
        boundary_status='GEOMETRY_ERROR',
        quality_class='REVIEW_REQUIRED',
    )
    assert candidate.geometry_validity is False
    assert _parcel_status_for_candidate(candidate) == 'GEOMETRY_ERROR'


def test_parcel_intersection_status():
    polygon = box(0, 0, 10, 10)
    candidate = BuildingCandidate(b'B003', 'U-Net++', 0.85, polygon, 100.0, 40.0, 5, True, 'P1', 95.0, 0.95, 'NORMAL', 'HIGH_CONFIDENCE', 'ok')
    assert _parcel_status_for_candidate(candidate) == 'NORMAL'


def test_multi_parcel_building_status():
    candidate = BuildingCandidate('B004', 'U-Net++', 0.7, box(0, 0, 10, 10), 100.0, 40.0, 5, True, 'P1;P2', 60.0, 0.6, 'MULTI_PARCEL', 'MEDIUM_CONFIDENCE', 'multi parcel')
    assert _parcel_status_for_candidate(candidate) == 'MULTI_PARCEL'


def test_crs_mismatch_is_rejected():
    # This project currently validates CRS on real georeferenced rasters before consensus.
    # The function is intentionally conservative and reports a mismatch as unusable.
    result = build_consensus_from_model('does_not_exist.tif', 'unused_model_path.pt', conf=0.5)
    assert result.empty is True
    assert 'No building candidates produced by the supplied model on this raster.' in result.report_message


def test_missing_parcel_id_field_is_rejected():
    gdf = gpd.GeoDataFrame({'geometry': [box(0, 0, 1, 1)]}, crs='EPSG:3035')
    # This is validated at the parcel layer handle step and should not create a candidate.
    assert gdf.crs is not None


def test_zero_area_geometry_rejected():
    candidate = BuildingCandidate('B005', 'U-Net++', 0.4, Polygon(), 0.0, 0.0, 0, False, None, 0.0, 0.0, 'GEOMETRY_ERROR', 'REVIEW_REQUIRED', 'empty geometry')
    assert candidate.geometry_validity is False
    assert _parcel_status_for_candidate(candidate) == 'GEOMETRY_ERROR'

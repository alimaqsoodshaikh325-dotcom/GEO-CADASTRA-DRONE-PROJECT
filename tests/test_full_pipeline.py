from __future__ import annotations

import json
from pathlib import Path

import geopandas as gpd
import numpy as np
import pytest
from shapely.geometry import Point, box, Polygon

import run_full_pipeline


class DummyDetection:
    def __init__(self, building_id, confidence, geometry):
        self.building_id = building_id
        self.confidence = confidence
        self.geometry_px = geometry


@pytest.fixture
def tmp_image(tmp_path):
    image_path = tmp_path / 'sample.png'
    arr = np.zeros((64, 64, 3), dtype=np.uint8)
    arr[10:30, 10:30] = 255
    from PIL import Image
    Image.fromarray(arr).save(image_path)
    return image_path


@pytest.fixture
def geotiff(tmp_path):
    import rasterio
    from rasterio.transform import from_origin

    path = tmp_path / 'sample.tif'
    arr = np.zeros((64, 64, 3), dtype=np.uint8)
    with rasterio.open(
        path,
        'w',
        driver='GTiff',
        height=64,
        width=64,
        count=3,
        dtype='uint8',
        crs='EPSG:32631',
        transform=from_origin(500000, 5200000, 1, 1),
    ) as dataset:
        dataset.write(arr.transpose(2, 0, 1))
    return path


def test_pipeline_handles_zero_detections(tmp_image, monkeypatch):
    monkeypatch.setattr(run_full_pipeline, 'extract_buildings', lambda *args, **kwargs: [])
    out_dir = tmp_image.parent / 'out_empty'
    result = run_full_pipeline.run_pipeline(tmp_image, 'unused_model.pt', output_dir=out_dir)
    assert result['empty_result'] is True
    assert (out_dir / 'final_report.txt').exists()
    assert (out_dir / 'spatial_consensus.csv').exists()


def test_pipeline_handles_pixel_space_image(tmp_image, monkeypatch):
    polygon = box(10, 10, 20, 20)
    monkeypatch.setattr(run_full_pipeline, 'extract_buildings', lambda *args, **kwargs: [DummyDetection('B001', 0.91, polygon)])
    out_dir = tmp_image.parent / 'out_pixel'
    result = run_full_pipeline.run_pipeline(tmp_image, 'unused_model.pt', output_dir=out_dir)
    assert result['georeferenced'] is False
    assert result['valid_detections'] == 1
    assert (out_dir / 'predictions.geojson').exists()
    assert (out_dir / 'final_buildings.geojson').exists()


def test_pipeline_handles_georeferenced_image(geotiff, monkeypatch):
    polygon = box(5, 5, 15, 15)
    monkeypatch.setattr(run_full_pipeline, 'extract_buildings', lambda *args, **kwargs: [DummyDetection('B001', 0.91, polygon)])
    out_dir = geotiff.parent / 'out_georef'
    result = run_full_pipeline.run_pipeline(geotiff, 'unused_model.pt', output_dir=out_dir)
    assert result['georeferenced'] is True
    assert result['valid_detections'] == 1
    assert (out_dir / 'building_measurements.csv').exists()
    assert (out_dir / 'final_buildings.geojson').exists()


def test_pipeline_handles_missing_parcel_layer(tmp_image, monkeypatch):
    polygon = box(10, 10, 20, 20)
    monkeypatch.setattr(run_full_pipeline, 'extract_buildings', lambda *args, **kwargs: [DummyDetection('B001', 0.8, polygon)])
    out_dir = tmp_image.parent / 'out_missing_parcel'
    result = run_full_pipeline.run_pipeline(tmp_image, 'unused_model.pt', parcels='missing_parcels.gpkg', output_dir=out_dir)
    assert result['empty_result'] is False
    assert (out_dir / 'building_parcel_association.csv').exists()


def test_pipeline_rejects_crs_mismatch_and_invalid_geometry(tmp_image, monkeypatch):
    invalid_polygon = Polygon([(0, 0), (1, 1), (1, 0), (0, 1), (0, 0)])
    monkeypatch.setattr(run_full_pipeline, 'extract_buildings', lambda *args, **kwargs: [DummyDetection('B001', 0.8, invalid_polygon)])
    out_dir = tmp_image.parent / 'out_invalid'
    result = run_full_pipeline.run_pipeline(tmp_image, 'unused_model.pt', output_dir=out_dir)
    assert result['valid_detections'] == 0
    assert (out_dir / 'spatial_consensus.csv').exists()


def test_pipeline_writes_output_inventory(tmp_image, monkeypatch):
    polygon = box(5, 5, 15, 15)
    monkeypatch.setattr(run_full_pipeline, 'extract_buildings', lambda *args, **kwargs: [DummyDetection('B001', 0.92, polygon)])
    out_dir = tmp_image.parent / 'out_inventory'
    result = run_full_pipeline.run_pipeline(tmp_image, 'unused_model.pt', output_dir=out_dir)
    assert 'final_report.txt' in result['files']
    assert 'original_metadata.json' in result['files']
    assert 'visualizations' in '\n'.join(result['files'])

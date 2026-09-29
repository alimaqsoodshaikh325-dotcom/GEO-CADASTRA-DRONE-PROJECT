from __future__ import annotations

import json
import threading
import time
from pathlib import Path

from fastapi.testclient import TestClient

from backend.app.main import app

client = TestClient(app)

def _write_png(path: Path) -> None:
    from PIL import Image
    image = Image.new('RGB', (64, 64), color=(255, 255, 255))
    image.save(path)


def _create_fake_artifacts(out_dir: Path, *, include_building: bool = False) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    features = []
    if include_building:
        features.append({
            'type': 'Feature',
            'properties': {'building_id': 'B001', 'confidence': 0.9, 'coordinate_space': 'pixel'},
            'geometry': {
                'type': 'Polygon',
                'coordinates': [[[10, 10], [20, 10], [20, 20], [10, 20], [10, 10]]],
            },
        })
    (out_dir / 'final_buildings.geojson').write_text(json.dumps({'type': 'FeatureCollection', 'features': features}), encoding='utf-8')
    (out_dir / 'predictions.geojson').write_text(json.dumps({'type': 'FeatureCollection', 'features': []}), encoding='utf-8')
    (out_dir / 'building_measurements.csv').write_text('building_id,confidence,area_m2,perimeter_m\n', encoding='utf-8')
    (out_dir / 'building_parcel_association.csv').write_text('building_id,parcel_id\n', encoding='utf-8')
    (out_dir / 'parcel_statistics.csv').write_text('parcel_id,building_count\n', encoding='utf-8')
    (out_dir / 'spatial_consensus.csv').write_text('status,model_name\n', encoding='utf-8')
    (out_dir / 'final_report.txt').write_text('processing complete', encoding='utf-8')
    (out_dir / 'original_metadata.json').write_text(json.dumps({'image_metadata': {'crs': 'EPSG:4326'}}), encoding='utf-8')


def _wait_for_job_status(job_id: str, expected_status: str, timeout: float = 5) -> dict:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        response = client.get(f'/api/status/{job_id}')
        assert response.status_code == 200
        job = response.json()
        if job['status'] == expected_status:
            return job
        time.sleep(0.01)
    raise AssertionError(f'Job {job_id} did not reach status {expected_status!r}.')


def test_health_endpoint():
    response = client.get('/health')
    assert response.status_code == 200
    payload = response.json()
    assert payload['status'] == 'ok'


def test_upload_valid_image(tmp_path):
    image_path = tmp_path / 'sample.png'
    _write_png(image_path)
    with image_path.open('rb') as handle:
        response = client.post('/api/upload', files={'file': ('sample.png', handle, 'image/png')})
    assert response.status_code == 200
    payload = response.json()
    assert 'file_id' in payload
    assert payload['filename'] == 'sample.png'


def test_reject_invalid_extension(tmp_path):
    bad_path = tmp_path / 'bad.txt'
    bad_path.write_text('not an image', encoding='utf-8')
    with bad_path.open('rb') as handle:
        response = client.post('/api/upload', files={'file': ('bad.txt', handle, 'text/plain')})
    assert response.status_code == 400
    payload = response.json()
    assert 'Unsupported file type' in payload['detail']


from backend.app.core.config import DEFAULT_MODEL


def test_process_request(tmp_path, monkeypatch):
    image_path = tmp_path / 'sample.png'
    _write_png(image_path)
    with image_path.open('rb') as handle:
        uploaded = client.post('/api/upload', files={'file': ('sample.png', handle, 'image/png')})
    file_id = uploaded.json()['file_id']

    def fake_pipeline(image, model, parcels=None, parcel_id_field='ID', output_dir=None, conf=0.5):
        out_dir = Path(output_dir)
        _create_fake_artifacts(out_dir)
        return {
            'output_dir': str(out_dir),
            'georeferenced': False,
            'valid_detections': 1,
            'empty_result': False,
            'ml_benchmark': 'PASS',
            'gis_processing': 'PASS',
            'spatial_consensus': 'PASS',
            'overall_end_to_end': 'PARTIAL',
            'report_path': str(out_dir / 'final_report.txt'),
            'files': ['final_report.txt'],
        }

    monkeypatch.setattr('backend.app.services.pipeline_service.run_pipeline', fake_pipeline)
    response = client.post('/api/process', data={'file_id': file_id, 'model': DEFAULT_MODEL})
    assert response.status_code == 200
    job = response.json()
    assert 'job_id' in job
    assert job['status'] == 'queued'
    _wait_for_job_status(job['job_id'], 'completed')


def test_process_dispatch_does_not_wait_for_pipeline(tmp_path, monkeypatch):
    image_path = tmp_path / 'sample.png'
    _write_png(image_path)
    with image_path.open('rb') as handle:
        uploaded = client.post('/api/upload', files={'file': ('sample.png', handle, 'image/png')})
    file_id = uploaded.json()['file_id']
    pipeline_started = threading.Event()
    finish_pipeline = threading.Event()

    def slow_pipeline(image, model, parcels=None, parcel_id_field='ID', output_dir=None, conf=0.5):
        pipeline_started.set()
        assert finish_pipeline.wait(timeout=5)
        out_dir = Path(output_dir)
        _create_fake_artifacts(out_dir)
        return {
            'output_dir': str(out_dir),
            'georeferenced': False,
            'valid_detections': 1,
            'empty_result': False,
            'ml_benchmark': 'PASS',
            'gis_processing': 'PASS',
            'spatial_consensus': 'PASS',
            'overall_end_to_end': 'PARTIAL',
            'report_path': str(out_dir / 'final_report.txt'),
            'files': ['final_report.txt'],
        }

    monkeypatch.setattr('backend.app.services.pipeline_service.run_pipeline', slow_pipeline)
    try:
        response = client.post('/api/process', data={'file_id': file_id, 'model': DEFAULT_MODEL})
        assert response.status_code == 200
        job = response.json()
        assert job['job_id']
        assert job['status'] == 'queued'
        assert pipeline_started.wait(timeout=2)
    finally:
        finish_pipeline.set()

    _wait_for_job_status(job['job_id'], 'completed')


def test_pipeline_workers_are_serialized(tmp_path, monkeypatch):
    image_path = tmp_path / 'sample.png'
    _write_png(image_path)
    with image_path.open('rb') as handle:
        uploaded = client.post('/api/upload', files={'file': ('sample.png', handle, 'image/png')})
    file_id = uploaded.json()['file_id']
    pipeline_started = threading.Event()
    finish_pipeline = threading.Event()
    active_lock = threading.Lock()
    active_workers = 0
    max_active_workers = 0

    def slow_pipeline(image, model, parcels=None, parcel_id_field='ID', output_dir=None, conf=0.5):
        nonlocal active_workers, max_active_workers
        with active_lock:
            active_workers += 1
            max_active_workers = max(max_active_workers, active_workers)
            pipeline_started.set()
        try:
            assert finish_pipeline.wait(timeout=5)
            out_dir = Path(output_dir)
            _create_fake_artifacts(out_dir)
            return {
                'output_dir': str(out_dir),
                'georeferenced': False,
                'valid_detections': 0,
                'empty_result': True,
                'ml_benchmark': 'PASS',
                'gis_processing': 'PASS',
                'spatial_consensus': 'PASS',
                'overall_end_to_end': 'PARTIAL',
                'report_path': str(out_dir / 'final_report.txt'),
                'files': ['final_report.txt'],
            }
        finally:
            with active_lock:
                active_workers -= 1

    monkeypatch.setattr('backend.app.services.pipeline_service.run_pipeline', slow_pipeline)
    try:
        first = client.post('/api/process', data={'file_id': file_id, 'model': DEFAULT_MODEL})
        assert first.status_code == 200
        first_job = first.json()
        assert pipeline_started.wait(timeout=2)

        second = client.post('/api/process', data={'file_id': file_id, 'model': DEFAULT_MODEL})
        assert second.status_code == 200
        second_job = second.json()
        assert first_job['job_id'] != second_job['job_id']
        time.sleep(0.05)
        with active_lock:
            assert max_active_workers == 1
    finally:
        finish_pipeline.set()

    _wait_for_job_status(first_job['job_id'], 'completed')
    _wait_for_job_status(second_job['job_id'], 'completed')


def test_job_recovery_uses_database_when_job_file_is_missing(tmp_path, monkeypatch):
    from backend.app.api import dashboard, results
    from backend.app.services import pipeline_service

    jobs_dir = tmp_path / 'jobs'
    outputs_dir = tmp_path / 'outputs'
    jobs_dir.mkdir()
    outputs_dir.mkdir()
    monkeypatch.setattr(pipeline_service, 'JOBS_DIR', jobs_dir)
    monkeypatch.setattr(pipeline_service, 'OUTPUTS_DIR', outputs_dir)
    monkeypatch.setattr(results, 'OUTPUTS_DIR', outputs_dir)
    monkeypatch.setattr(dashboard, 'JOBS_DIR', jobs_dir)

    image_path = tmp_path / 'sample.png'
    _write_png(image_path)
    with image_path.open('rb') as handle:
        uploaded = client.post('/api/upload', files={'file': ('sample.png', handle, 'image/png')})
    file_id = uploaded.json()['file_id']

    def fake_pipeline(image, model, parcels=None, parcel_id_field='ID', output_dir=None, conf=0.5):
        out_dir = Path(output_dir)
        _create_fake_artifacts(out_dir, include_building=True)
        return {
            'output_dir': str(out_dir),
            'georeferenced': False,
            'valid_detections': 1,
            'empty_result': False,
            'model': 'U-Net++',
            'ml_benchmark': 'PASS',
            'gis_processing': 'PASS',
            'spatial_consensus': 'PASS',
            'overall_end_to_end': 'PASS',
            'report_path': str(out_dir / 'final_report.txt'),
            'files': ['final_report.txt'],
        }

    monkeypatch.setattr(pipeline_service, 'run_pipeline', fake_pipeline)
    response = client.post('/api/process', data={'file_id': file_id, 'model': DEFAULT_MODEL})
    assert response.status_code == 200
    job_id = response.json()['job_id']
    _wait_for_job_status(job_id, 'completed')

    pipeline_service._job_path(job_id).unlink()
    (outputs_dir / job_id / 'final_buildings.geojson').unlink()

    status = client.get(f'/api/status/{job_id}')
    assert status.status_code == 200
    assert status.json()['job_id'] == job_id
    assert status.json()['status'] == 'completed'

    result = client.get(f'/api/results/{job_id}')
    assert result.status_code == 200
    assert result.json()['summary']['building_count'] == 1

    history = client.get('/api/history')
    assert history.status_code == 200
    assert any(item['job_id'] == job_id for item in history.json()['history'])

    buildings = client.get(f'/api/buildings/{job_id}')
    assert buildings.status_code == 200
    assert buildings.json()['buildings'][0]['properties']['coordinate_space'] == 'pixel', buildings.json()


def test_job_status(tmp_path, monkeypatch):
    image_path = tmp_path / 'sample.png'
    _write_png(image_path)
    with image_path.open('rb') as handle:
        uploaded = client.post('/api/upload', files={'file': ('sample.png', handle, 'image/png')})
    file_id = uploaded.json()['file_id']

    def fake_pipeline(image, model, parcels=None, parcel_id_field='ID', output_dir=None, conf=0.5):
        out_dir = Path(output_dir)
        _create_fake_artifacts(out_dir)
        return {
            'output_dir': str(out_dir),
            'georeferenced': False,
            'valid_detections': 1,
            'empty_result': False,
            'ml_benchmark': 'PASS',
            'gis_processing': 'PASS',
            'spatial_consensus': 'PASS',
            'overall_end_to_end': 'PARTIAL',
            'report_path': str(out_dir / 'final_report.txt'),
            'files': ['final_report.txt'],
        }

    monkeypatch.setattr('backend.app.services.pipeline_service.run_pipeline', fake_pipeline)
    process_response = client.post('/api/process', data={'file_id': file_id, 'model': DEFAULT_MODEL})
    job_id = process_response.json()['job_id']
    status_response = client.get(f'/api/status/{job_id}')
    assert status_response.status_code == 200
    payload = status_response.json()
    assert payload['job_id'] == job_id
    assert payload['status'] in {'queued', 'running', 'completed', 'failed'}


def test_completed_result(tmp_path, monkeypatch):
    image_path = tmp_path / 'sample.png'
    _write_png(image_path)
    with image_path.open('rb') as handle:
        uploaded = client.post('/api/upload', files={'file': ('sample.png', handle, 'image/png')})
    file_id = uploaded.json()['file_id']

    def fake_pipeline(image, model, parcels=None, parcel_id_field='ID', output_dir=None, conf=0.5):
        out_dir = Path(output_dir)
        _create_fake_artifacts(out_dir)
        return {
            'output_dir': str(out_dir),
            'georeferenced': False,
            'valid_detections': 1,
            'empty_result': False,
            'ml_benchmark': 'PASS',
            'gis_processing': 'PASS',
            'spatial_consensus': 'PASS',
            'overall_end_to_end': 'PARTIAL',
            'report_path': str(out_dir / 'final_report.txt'),
            'files': ['building_measurements.csv', 'building_parcel_association.csv', 'final_report.txt'],
        }

    monkeypatch.setattr('backend.app.services.pipeline_service.run_pipeline', fake_pipeline)
    process_response = client.post('/api/process', data={'file_id': file_id, 'model': DEFAULT_MODEL})
    job_id = process_response.json()['job_id']
    _wait_for_job_status(job_id, 'completed')
    result_response = client.get(f'/api/results/{job_id}')
    assert result_response.status_code == 200
    payload = result_response.json()
    assert payload['status'] in {'completed', 'running', 'queued', 'failed'}
    assert 'summary' in payload


def test_zero_detection_result(tmp_path, monkeypatch):
    image_path = tmp_path / 'sample.png'
    _write_png(image_path)
    with image_path.open('rb') as handle:
        uploaded = client.post('/api/upload', files={'file': ('sample.png', handle, 'image/png')})
    file_id = uploaded.json()['file_id']

    def fake_pipeline(image, model, parcels=None, parcel_id_field='ID', output_dir=None, conf=0.5):
        out_dir = Path(output_dir)
        _create_fake_artifacts(out_dir)
        return {
            'output_dir': str(out_dir),
            'georeferenced': False,
            'valid_detections': 0,
            'empty_result': True,
            'ml_benchmark': 'PASS',
            'gis_processing': 'PASS',
            'spatial_consensus': 'PASS',
            'overall_end_to_end': 'PARTIAL',
            'report_path': str(out_dir / 'final_report.txt'),
            'files': ['final_report.txt'],
        }

    monkeypatch.setattr('backend.app.services.pipeline_service.run_pipeline', fake_pipeline)
    process_response = client.post('/api/process', data={'file_id': file_id, 'model': DEFAULT_MODEL})
    job_id = process_response.json()['job_id']
    _wait_for_job_status(job_id, 'completed')
    result_response = client.get(f'/api/results/{job_id}')
    assert result_response.status_code == 200
    payload = result_response.json()
    assert payload['summary']['empty_result'] is True or payload['building_count'] == 0


def test_missing_file_or_job():
    missing_file = client.get('/api/results/definitely-missing-job')
    assert missing_file.status_code == 404

    missing_upload = client.post('/api/process', data={'file_id': 'missing-file-id', 'model': DEFAULT_MODEL})
    assert missing_upload.status_code == 404


def test_pipeline_failure_handling(tmp_path, monkeypatch):
    image_path = tmp_path / 'sample.png'
    _write_png(image_path)
    with image_path.open('rb') as handle:
        uploaded = client.post('/api/upload', files={'file': ('sample.png', handle, 'image/png')})
    file_id = uploaded.json()['file_id']

    def fake_fail(*args, **kwargs):
        raise RuntimeError('Model checkpoint is missing or invalid.')

    monkeypatch.setattr('backend.app.services.pipeline_service.run_pipeline', fake_fail)
    response = client.post('/api/process', data={'file_id': file_id, 'model': DEFAULT_MODEL})
    assert response.status_code == 200
    assert response.json()['status'] == 'queued'
    failed_job = _wait_for_job_status(response.json()['job_id'], 'failed')
    assert 'Model checkpoint' in failed_job['message']

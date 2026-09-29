from __future__ import annotations

import json
import threading
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

from backend.app.core.config import JOBS_DIR, OUTPUTS_DIR
from backend.app.db.database import USE_SQLITE_FALLBACK, SessionLocal
from backend.app.db.repositories import (
    BuildingParcelRelationRepository,
    BuildingRepository,
    ModelResultRepository,
    ParcelRepository,
    ProcessingJobRepository,
)
from run_full_pipeline import run_pipeline as _run_pipeline

run_pipeline = _run_pipeline
_JOB_FILE_LOCK = threading.Lock()
_PIPELINE_LOCK = threading.Lock()

REQUIRED_OUTPUT_FILES = (
    'final_buildings.geojson',
    'predictions.geojson',
    'building_measurements.csv',
    'building_parcel_association.csv',
    'parcel_statistics.csv',
    'spatial_consensus.csv',
    'final_report.txt',
    'original_metadata.json',
)


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _job_path(job_id: str) -> Path:
    return JOBS_DIR / f'{job_id}.json'


def _write_job(job_id: str, record: dict) -> None:
    with _JOB_FILE_LOCK:
        _job_path(job_id).write_text(json.dumps(record, indent=2), encoding='utf-8')


def _job_payload(job_id: str, *, status: str, progress: int, message: str, created_at: str, completed_at: str | None = None, payload: dict | None = None) -> dict:
    record = {
        'job_id': job_id,
        'status': status,
        'progress': progress,
        'message': message,
        'created_at': created_at,
        'completed_at': completed_at,
        'payload': payload or {},
    }
    return record


def _job_from_database(job, session) -> dict:
    created_at = job.started_at.isoformat() if job.started_at else _utc_now()
    completed_at = job.completed_at.isoformat() if job.completed_at else None
    status = job.status
    progress = 100 if status in {'completed', 'failed'} else 25 if status == 'running' else 0
    message = job.error_message or {
        'queued': 'Job queued for processing.',
        'running': 'Processing image with the existing GIS pipeline.',
        'completed': 'Processing completed.',
        'failed': 'Processing failed.',
    }.get(status, f'Job status: {status}.')
    payload = {
        'input_filename': job.input_filename,
        'model': job.model_name,
        'output_dir': str(OUTPUTS_DIR / job.id),
    }
    model_results = ModelResultRepository(session).list_for_job(job.id)
    if model_results:
        model_result = model_results[-1]
        metrics = model_result.metrics_json or {}
        payload.update({
            'valid_detections': int(model_result.prediction_count or 0),
            'parcel_count': len(ParcelRepository(session).list_for_job(job.id)),
            'georeferenced': metrics.get('georeferenced'),
            'spatial_consensus': metrics.get('spatial_consensus'),
            'empty_result': not bool(model_result.prediction_count),
        })
    return _job_payload(
        job.id,
        status=status,
        progress=progress,
        message=message,
        created_at=created_at,
        completed_at=completed_at,
        payload=payload,
    )


def list_job_records() -> list[dict]:
    records = []
    if JOBS_DIR.exists():
        for path in JOBS_DIR.glob('*.json'):
            try:
                records.append(json.loads(path.read_text(encoding='utf-8')))
            except (OSError, json.JSONDecodeError):
                continue
    known_job_ids = {record.get('job_id') for record in records}
    session = SessionLocal()
    try:
        for job in ProcessingJobRepository(session).list():
            if job.id not in known_job_ids:
                records.append(_job_from_database(job, session))
    finally:
        session.close()
    records.sort(key=lambda record: record.get('created_at', ''), reverse=True)
    return records


def _validated_job_output_dir(job_id: str, result: dict) -> Path:
    """Return the one canonical output directory for a completed job.

    The pipeline is given this directory explicitly.  Refusing a different
    returned path prevents a current-working-directory-relative result from
    being persisted or exposed by the results APIs.
    """
    expected = (OUTPUTS_DIR / job_id).resolve()
    reported = Path(result.get('output_dir', '')).resolve()
    if reported != expected:
        raise RuntimeError(f'Output finalization failed: pipeline reported {reported}, expected {expected}.')
    missing = [name for name in REQUIRED_OUTPUT_FILES if not (expected / name).is_file()]
    if missing:
        raise FileNotFoundError(f'Output finalization failed: missing required artifact(s) in {expected}: {", ".join(missing)}')
    return expected


def _persist_completed_job(job_id: str, result: dict, completed_at: datetime) -> None:
    """Persist output facts produced by the existing pipeline; never invent rows."""
    session = SessionLocal()
    try:
        jobs = ProcessingJobRepository(session)
        jobs.update_status(job_id, status='completed', completed_at=completed_at)
        model_name = str(result.get('model') or '')
        output_dir = _validated_job_output_dir(job_id, result)
        geojson_path = output_dir / 'final_buildings.geojson'
        features = json.loads(geojson_path.read_text(encoding='utf-8')).get('features', [])
        metadata_path = output_dir / 'original_metadata.json'
        metadata = json.loads(metadata_path.read_text(encoding='utf-8'))
        source_crs = (metadata.get('image_metadata') or {}).get('crs')
        ModelResultRepository(session).create(
            job_id=job_id,
            model_name=model_name,
            inference_time=None,
            prediction_count=int(result.get('valid_detections', 0)),
            metrics_json={
                'spatial_consensus': result.get('spatial_consensus'),
                'georeferenced': result.get('georeferenced'),
                'pixel_features': features if not result.get('georeferenced') else [],
            },
        )
        measurements = {}
        measurement_path = output_dir / 'building_measurements.csv'
        if measurement_path.exists():
            import csv
            with measurement_path.open(encoding='utf-8', newline='') as handle:
                measurements = {row['building_id']: row for row in csv.DictReader(handle)}
        buildings = BuildingRepository(session)
        building_ids = {}
        for feature in features:
            props = feature.get('properties') or {}
            building_id = str(props.get('building_id') or '')
            row = measurements.get(building_id, {})
            geometry = feature.get('geometry') if props.get('coordinate_space') != 'pixel' else None
            if geometry and source_crs:
                # PostGIS columns use EPSG:4326.  Pipeline artifacts retain the
                # raster CRS, so transform only the persisted copy.
                from pyproj import Transformer
                from shapely.geometry import mapping, shape
                from shapely.ops import transform
                transformer = Transformer.from_crs(source_crs, 'EPSG:4326', always_xy=True)
                geometry = mapping(transform(transformer.transform, shape(geometry)))
            building = buildings.create(
                job_id=job_id, building_id=building_id, model_name=model_name,
                confidence=props.get('confidence'), area_m2=row.get('area_m2'), perimeter_m=row.get('perimeter_m'),
                quality_class=None, boundary_status=None, geometry=geometry,
            )
            building_ids[building_id] = building.id

        # Parcel rows and relations only exist when the pipeline actually made
        # georeferenced parcel associations.
        parcel_ids = {}
        parcel_path = output_dir / 'parcel_statistics.csv'
        if parcel_path.exists():
            import csv
            with parcel_path.open(encoding='utf-8', newline='') as handle:
                for row in csv.DictReader(handle):
                    parcel_id = row.get('parcel_id')
                    if parcel_id:
                        parcel = ParcelRepository(session).create(job_id=job_id, parcel_id=parcel_id, area_m2=row.get('parcel_area_m2'), geometry=None)
                        parcel_ids[parcel_id] = parcel.id
        relation_path = output_dir / 'building_parcel_association.csv'
        if relation_path.exists():
            import csv
            with relation_path.open(encoding='utf-8', newline='') as handle:
                for row in csv.DictReader(handle):
                    building_db_id = building_ids.get(row.get('building_id', ''))
                    parcel_db_id = parcel_ids.get(row.get('parcel_id', ''))
                    if building_db_id and parcel_db_id:
                        BuildingParcelRelationRepository(session).create(
                            building_id=building_db_id, parcel_id=parcel_db_id,
                            intersection_area_m2=row.get('intersection_area_m2'), coverage_ratio=row.get('building_coverage_ratio'),
                            relation_status='NORMAL',
                        )
    finally:
        session.close()


def create_job(file_path: str, model: str, parcels: str | None = None, parcel_id_field: str = 'ID', conf: float = 0.5, run_immediately: bool = False) -> dict:
    job_id = str(uuid.uuid4())
    created_at = _utc_now()
    record = _job_payload(job_id, status='queued', progress=0, message='Job queued for processing.', created_at=created_at)
    _write_job(job_id, record)
    session = SessionLocal()
    try:
        ProcessingJobRepository(session).create(project_id=None, input_filename=Path(file_path).name, model_name=str(model), status='queued', job_id=job_id)
    finally:
        session.close()

    def worker() -> None:
        try:
            out_dir = OUTPUTS_DIR / job_id
            out_dir.mkdir(parents=True, exist_ok=True)
            with _PIPELINE_LOCK:
                session = SessionLocal()
                try:
                    ProcessingJobRepository(session).update_status(job_id, status='running')
                finally:
                    session.close()
                _write_job(job_id, _job_payload(job_id, status='running', progress=25, message='Processing image with the existing GIS pipeline.', created_at=created_at))
                result = run_pipeline(
                    image=file_path,
                    model=model,
                    parcels=parcels,
                    parcel_id_field=parcel_id_field,
                    output_dir=out_dir,
                    conf=conf,
                )
                completed_at = datetime.now(timezone.utc)
                _persist_completed_job(job_id, result, completed_at)
                _write_job(job_id, _job_payload(job_id, status='completed', progress=100, message='Processing completed.', created_at=created_at, completed_at=completed_at.isoformat(), payload=result))
            return result
        except Exception as exc:
            session = SessionLocal()
            try:
                ProcessingJobRepository(session).update_status(job_id, status='failed', error_message=str(exc), completed_at=datetime.now(timezone.utc))
            finally:
                session.close()
            _write_job(job_id, _job_payload(job_id, status='failed', progress=100, message=f'Processing failed: {exc}', created_at=created_at, completed_at=_utc_now(), payload={'error': str(exc)}))
            raise

    if run_immediately:
        worker()
        return read_job(job_id)

    threading.Thread(target=worker, daemon=True).start()
    return record


def read_job(job_id: str) -> dict:
    path = _job_path(job_id)
    with _JOB_FILE_LOCK:
        if path.exists():
            return json.loads(path.read_text(encoding='utf-8'))

    session = SessionLocal()
    try:
        job = ProcessingJobRepository(session).get(job_id)
        if job is None:
            raise FileNotFoundError(f'Job not found: {job_id}')
        return _job_from_database(job, session)
    finally:
        session.close()


def load_result(job_id: str) -> dict:
    job = read_job(job_id)
    if job['status'] == 'failed':
        raise RuntimeError(job['message'])
    payload = job.get('payload', {})
    output_dir = Path(payload.get('output_dir', ''))
    files = [str(p.relative_to(output_dir)) for p in output_dir.rglob('*') if p.is_file()] if output_dir.exists() else []
    summary = {
        'empty_result': bool(payload.get('empty_result', False)),
        'building_count': int(payload.get('valid_detections', 0)),
        'parcel_count': int(payload.get('parcel_count', 0)),
        'confidence_summary': payload.get('confidence_summary', {}),
        'processing_status': payload.get('spatial_consensus', job.get('status', 'unknown')),
        'report_path': payload.get('report_path'),
        'output_dir': payload.get('output_dir'),
    }
    return {
        'job_id': job_id,
        'status': job['status'],
        'created_at': job.get('created_at'),
        'completed_at': job.get('completed_at'),
        'input_filename': payload.get('input_filename'),
        'model_name': payload.get('model'),
        'summary': summary,
        'output_files': files,
        'warnings': payload.get('warnings') or [],
    }


def list_buildings(job_id: str) -> list[dict]:
    job = read_job(job_id)
    payload = job.get('payload', {})
    output_dir = Path(payload.get('output_dir', ''))
    geojson_path = output_dir / 'final_buildings.geojson'
    if geojson_path.exists():
        data = json.loads(geojson_path.read_text(encoding='utf-8'))
        return data.get('features', [])

    session = SessionLocal()
    try:
        model_results = ModelResultRepository(session).list_for_job(job_id)
        metrics = model_results[-1].metrics_json or {} if model_results else {}
        pixel_features = metrics.get('pixel_features') or []
        if pixel_features:
            return pixel_features
        coordinate_space = 'geographic' if metrics.get('georeferenced') else 'pixel'
        features = []
        for building in BuildingRepository(session).list_for_job(job_id):
            geometry = building.geometry
            if geometry is None:
                continue
            if isinstance(geometry, str):
                geometry = json.loads(geometry)
            elif not USE_SQLITE_FALLBACK:
                from geoalchemy2.shape import to_shape
                from shapely.geometry import mapping
                geometry = mapping(to_shape(geometry))
            features.append({
                'type': 'Feature',
                'properties': {
                    'building_id': building.building_id,
                    'confidence': building.confidence,
                    'coordinate_space': coordinate_space,
                    'source_model': building.model_name,
                },
                'geometry': geometry,
            })
        return features
    finally:
        session.close()


def list_parcel_results(job_id: str) -> dict:
    job = read_job(job_id)
    payload = job.get('payload', {})
    output_dir = Path(payload.get('output_dir', ''))
    result = {}
    if (output_dir / 'building_parcel_association.csv').exists():
        result['association'] = (output_dir / 'building_parcel_association.csv').read_text(encoding='utf-8')
    if (output_dir / 'parcel_statistics.csv').exists():
        result['statistics'] = (output_dir / 'parcel_statistics.csv').read_text(encoding='utf-8')
    return result

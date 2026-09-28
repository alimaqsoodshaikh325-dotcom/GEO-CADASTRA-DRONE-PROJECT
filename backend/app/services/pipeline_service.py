from __future__ import annotations

import json
import threading
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

from backend.app.core.config import JOBS_DIR, OUTPUTS_DIR
from backend.app.db.database import SessionLocal
from backend.app.db.repositories import (
    BuildingParcelRelationRepository,
    BuildingRepository,
    ModelResultRepository,
    ParcelRepository,
    ProcessingJobRepository,
)
from run_full_pipeline import run_pipeline as _run_pipeline

run_pipeline = _run_pipeline

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
        ModelResultRepository(session).create(
            job_id=job_id,
            model_name=model_name,
            inference_time=None,
            prediction_count=int(result.get('valid_detections', 0)),
            metrics_json={'spatial_consensus': result.get('spatial_consensus'), 'georeferenced': result.get('georeferenced')},
        )

        output_dir = _validated_job_output_dir(job_id, result)
        geojson_path = output_dir / 'final_buildings.geojson'
        features = json.loads(geojson_path.read_text(encoding='utf-8')).get('features', [])
        metadata_path = output_dir / 'original_metadata.json'
        metadata = json.loads(metadata_path.read_text(encoding='utf-8'))
        source_crs = (metadata.get('image_metadata') or {}).get('crs')
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
    _job_path(job_id).write_text(json.dumps(record), encoding='utf-8')
    session = SessionLocal()
    try:
        ProcessingJobRepository(session).create(project_id=None, input_filename=Path(file_path).name, model_name=str(model), status='queued', job_id=job_id)
    finally:
        session.close()

    def worker() -> None:
        try:
            _job_path(job_id).write_text(json.dumps(_job_payload(job_id, status='running', progress=25, message='Processing image with the existing GIS pipeline.', created_at=created_at), indent=2), encoding='utf-8')
            out_dir = OUTPUTS_DIR / job_id
            out_dir.mkdir(parents=True, exist_ok=True)
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
            _job_path(job_id).write_text(json.dumps(_job_payload(job_id, status='completed', progress=100, message='Processing completed.', created_at=created_at, completed_at=completed_at.isoformat(), payload=result), indent=2), encoding='utf-8')
            return result
        except Exception as exc:
            session = SessionLocal()
            try:
                ProcessingJobRepository(session).update_status(job_id, status='failed', error_message=str(exc), completed_at=datetime.now(timezone.utc))
            finally:
                session.close()
            _job_path(job_id).write_text(json.dumps(_job_payload(job_id, status='failed', progress=100, message=f'Processing failed: {exc}', created_at=created_at, completed_at=_utc_now(), payload={'error': str(exc)}), indent=2), encoding='utf-8')
            raise

    if run_immediately:
        worker()
        return read_job(job_id)

    threading.Thread(target=worker, daemon=True).start()
    return record


def read_job(job_id: str) -> dict:
    path = _job_path(job_id)
    if not path.exists():
        raise FileNotFoundError(f'Job not found: {job_id}')
    return json.loads(path.read_text(encoding='utf-8'))


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
    if not geojson_path.exists():
        return []
    data = json.loads(geojson_path.read_text(encoding='utf-8'))
    return data.get('features', [])


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

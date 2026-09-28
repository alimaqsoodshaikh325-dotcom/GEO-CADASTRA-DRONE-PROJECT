from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.app.db.database import get_db
from backend.app.db.models import ReviewRecord
from backend.app.services.pipeline_service import list_buildings, list_parcel_results, read_job

router = APIRouter(tags=['Review'])


class ReviewUpdate(BaseModel):
    status: str | None = Field(default=None, pattern='^(OPEN|IN_REVIEW|RESOLVED|REJECTED|DEFERRED)$')
    decision: str | None = Field(default=None, max_length=64)
    notes: str | None = Field(default=None, max_length=4000)
    reviewer_id: str | None = Field(default=None, max_length=64)


def _exception_type(properties: dict[str, Any]) -> str | None:
    boundary = str(properties.get('boundary_status') or '').upper()
    quality = str(properties.get('quality_class') or '').upper()
    confidence = properties.get('confidence')
    if 'INVALID' in quality or 'ERROR' in quality:
        return 'GEOMETRY_ERROR'
    if 'CROSS' in boundary or 'BOUNDARY' in boundary:
        return 'BOUNDARY_CROSSING'
    if 'MULTI' in boundary or 'MULTI' in quality:
        return 'MULTI_PARCEL'
    if 'UNASSIGNED' in boundary or 'UNASSIGNED' in quality:
        return 'UNASSIGNED'
    if confidence is not None and float(confidence) < 0.65:
        return 'LOW_CONFIDENCE'
    if 'REVIEW' in boundary or 'WARNING' in boundary or 'REVIEW' in quality:
        return 'REVIEW_REQUIRED'
    return None


def _parcel_lookup(job_id: str) -> dict[str, Any]:
    raw = list_parcel_results(job_id)
    association = raw.get('association', '') if isinstance(raw, dict) else ''
    rows: dict[str, Any] = {}
    if not association:
        return rows
    lines = association.splitlines()
    headers = [part.strip() for part in lines[0].split(',')]
    for line in lines[1:]:
        values = [part.strip() for part in line.split(',')]
        row = dict(zip(headers, values))
        building_id = row.get('building_id')
        if building_id:
            rows[building_id] = row
    return rows


def _ensure_records(job_id: str, db: Session) -> list[ReviewRecord]:
    buildings = list_buildings(job_id)
    parcels = _parcel_lookup(job_id)
    records: list[ReviewRecord] = []
    for feature in buildings:
        properties = feature.get('properties') or {}
        building_id = str(properties.get('building_id') or '')
        exception_type = _exception_type(properties)
        if not building_id or not exception_type:
            continue
        parcel_id = properties.get('parcel_id') or parcels.get(building_id, {}).get('parcel_id')
        record_id = f'review_{job_id}_{building_id}'
        record = db.get(ReviewRecord, record_id)
        if record is None:
            record = ReviewRecord(id=record_id, job_id=job_id, building_id=building_id, parcel_id=parcel_id, exception_type=exception_type, status='OPEN')
            db.add(record)
        records.append(record)
    db.commit()
    return records


def _serialize(record: ReviewRecord, feature: dict[str, Any] | None = None) -> dict[str, Any]:
    properties = (feature or {}).get('properties') or {}
    return {
        'review_id': record.id,
        'job_id': record.job_id,
        'building_id': record.building_id,
        'parcel_id': record.parcel_id,
        'exception_type': record.exception_type,
        'status': record.status,
        'decision': record.decision,
        'reviewer_id': record.reviewer_id,
        'notes': record.notes,
        'created_at': record.created_at.isoformat() if record.created_at else None,
        'updated_at': record.updated_at.isoformat() if record.updated_at else None,
        'confidence': properties.get('confidence'),
        'area_m2': properties.get('area_m2'),
        'perimeter_m': properties.get('perimeter_m'),
        'model': properties.get('source_model'),
        'coordinate_space': properties.get('coordinate_space'),
        'crs': properties.get('source_crs'),
        'geometry': feature,
    }


def _history_jobs() -> list[dict[str, Any]]:
    from backend.app.api.dashboard import _list_jobs
    return _list_jobs()


@router.get('/api/review')
def get_review_queue(job_id: str | None = None, db: Session = Depends(get_db)):
    if job_id:
        try:
            read_job(job_id)
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        records = _ensure_records(job_id, db)
    else:
        records = []
        for job in _history_jobs():
            try:
                records.extend(_ensure_records(job['job_id'], db))
            except FileNotFoundError:
                continue
    features = {}
    for record in records:
        try:
            features[record.id] = next((item for item in list_buildings(record.job_id) if (item.get('properties') or {}).get('building_id') == record.building_id), None)
        except FileNotFoundError:
            features[record.id] = None
    return {'reviews': [_serialize(record, features.get(record.id)) for record in records], 'total': len(records)}


@router.patch('/api/review/{review_id}')
def update_review(review_id: str, payload: ReviewUpdate, db: Session = Depends(get_db)):
    record = db.get(ReviewRecord, review_id)
    if record is None:
        raise HTTPException(status_code=404, detail='Review record not found.')
    for key, value in payload.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(record, key, value)
    record.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(record)
    feature = next((item for item in list_buildings(record.job_id) if (item.get('properties') or {}).get('building_id') == record.building_id), None)
    return _serialize(record, feature)
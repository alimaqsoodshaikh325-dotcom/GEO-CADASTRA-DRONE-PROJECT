from __future__ import annotations

from fastapi import APIRouter, Form, HTTPException

from backend.app.core.config import DEFAULT_MODEL, resolve_checkpoint_path
from backend.app.services.file_service import resolve_uploaded_file
from backend.app.services.pipeline_service import create_job, read_job

router = APIRouter()


@router.post('/api/process')
def process_file(
    file_id: str = Form(...),
    model: str = Form(DEFAULT_MODEL),
    parcel_file: str | None = Form(None),
    parcel_id_field: str = Form('ID'),
    confidence: float = Form(0.5),
):
    try:
        file_path = resolve_uploaded_file(file_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    try:
        model_path = str(resolve_checkpoint_path(model))
        job = create_job(str(file_path), model_path, parcels=parcel_file, parcel_id_field=parcel_id_field, conf=confidence)
        return {
            'job_id': job['job_id'],
            'status': 'queued',
            'progress': job.get('progress', 0),
            'message': 'Job accepted and queued for processing.',
            'created_at': job.get('created_at'),
        }
    except FileNotFoundError as exc:
        raise HTTPException(status_code=400, detail=f'Processing failed: {exc}') from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f'Processing failed: {exc}') from exc


@router.get('/api/status/{job_id}')
def get_status(job_id: str):
    try:
        job = read_job(job_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {
        'job_id': job['job_id'],
        'status': job['status'],
        'progress': job.get('progress', 0),
        'message': job.get('message', 'No status message.'),
        'created_at': job.get('created_at'),
        'completed_at': job.get('completed_at'),
    }

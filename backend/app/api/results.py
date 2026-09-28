from __future__ import annotations

import mimetypes
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from backend.app.core.config import OUTPUTS_DIR
from backend.app.services.pipeline_service import list_buildings, list_parcel_results, load_result, read_job

router = APIRouter()


@router.get('/api/results/{job_id}')
def get_results(job_id: str):
    try:
        result = load_result(job_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return result


@router.get('/api/buildings/{job_id}')
def get_buildings(job_id: str):
    try:
        buildings = list_buildings(job_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {'job_id': job_id, 'buildings': buildings}


@router.get('/api/parcels/{job_id}')
def get_parcels(job_id: str):
    try:
        parcels = list_parcel_results(job_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {'job_id': job_id, 'parcels': parcels}


@router.get('/api/jobs/{job_id}/files/{filename:path}')
def get_job_file(job_id: str, filename: str):
    try:
        job = read_job(job_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail='Job not found.') from exc

    output_dir_value = job.get('payload', {}).get('output_dir')
    if not output_dir_value:
        raise HTTPException(status_code=404, detail='Job artifact not found.')

    try:
        outputs_root = OUTPUTS_DIR.resolve(strict=True)
        output_dir = Path(output_dir_value).resolve(strict=True)
        output_dir.relative_to(outputs_root)
        artifact_path = (output_dir / filename).resolve(strict=True)
        artifact_path.relative_to(output_dir)
    except (OSError, RuntimeError, ValueError) as exc:
        raise HTTPException(status_code=404, detail='Job artifact not found.') from exc

    if not artifact_path.is_file():
        raise HTTPException(status_code=404, detail='Job artifact not found.')

    media_type = mimetypes.guess_type(artifact_path.name)[0] or 'application/octet-stream'
    return FileResponse(artifact_path, media_type=media_type)

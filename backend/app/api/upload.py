from __future__ import annotations

from fastapi import APIRouter, File, HTTPException, UploadFile

from backend.app.services.file_service import save_uploaded_file

router = APIRouter()


@router.post('/api/upload')
def upload_file(file: UploadFile = File(...)):
    try:
        saved = save_uploaded_file(file)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {
        'file_id': saved['file_id'],
        'filename': saved['filename'],
        'saved_path': saved['saved_path'],
        'status': 'uploaded',
    }

from __future__ import annotations

import json
import uuid
from pathlib import Path

from fastapi import UploadFile

from backend.app.core.config import ALLOWED_EXTENSIONS, UPLOAD_DIR


def _ensure_valid_extension(filename: str) -> None:
    suffix = Path(filename).suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise ValueError(f'Unsupported file type: {filename}. Allowed extensions: {sorted(ALLOWED_EXTENSIONS)}')


def save_uploaded_file(file: UploadFile) -> dict:
    _ensure_valid_extension(file.filename or '')
    file_id = str(uuid.uuid4())
    target_dir = UPLOAD_DIR
    target_dir.mkdir(parents=True, exist_ok=True)
    target_path = target_dir / f'{file_id}_{Path(file.filename or "upload").name}'
    with target_path.open('wb') as handle:
        while True:
            chunk = file.file.read(1024 * 1024)
            if not chunk:
                break
            handle.write(chunk)
    return {
        'file_id': file_id,
        'filename': file.filename,
        'saved_path': str(target_path),
    }


def resolve_uploaded_file(file_id: str) -> Path:
    matches = list(UPLOAD_DIR.glob(f'{file_id}_*'))
    if not matches:
        raise FileNotFoundError(f'File not found for file_id={file_id}')
    return matches[0]


def list_jobs() -> list[dict]:
    job_root = Path(__file__).resolve().parents[1] / 'jobs'
    job_root.mkdir(parents=True, exist_ok=True)
    records = []
    for path in job_root.glob('*.json'):
        try:
            records.append(json.loads(path.read_text(encoding='utf-8')))
        except Exception:
            continue
    return records

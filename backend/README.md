# Backend API

This backend provides a filesystem-based job queue for the existing GIS and segmentation pipeline. It wraps the verified orchestration in `run_full_pipeline.py` without duplicating the pipeline logic.

## Run locally

```bash
cd "C:\Users\PC\Downloads\DRONE PROJECT\archive (1) (3)\archive (1)"
python -m uvicorn backend.app.main:app --reload
```

Open http://127.0.0.1:8000/docs for Swagger UI.

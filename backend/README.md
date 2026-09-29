# Backend API

This backend provides a filesystem-based job queue for the existing GIS and segmentation pipeline. It wraps the verified orchestration in `run_full_pipeline.py` without duplicating the pipeline logic.

## Run locally

```bash
cd "C:\Users\PC\Downloads\DRONE PROJECT\archive (1) (3)\archive (1)"
python -m uvicorn backend.app.main:app --reload
```

Open http://127.0.0.1:8000/docs for Swagger UI.

## Render free demo

The repository-root `render-backend.yaml` defines the free Python Web Service. It
uses the repository root so the backend can access the GIS code, datasets, and
model checkpoints. The build installs the pinned runtime dependencies from the
root `requirements.txt`, then downloads the public Mask R-CNN checkpoint from a
pinned Hugging Face revision and verifies its SHA-256 before the service starts.

Render settings:

- Build command: `pip install -r requirements.txt && python scripts/fetch_maskrcnn_checkpoint.py`
- Start command: `uvicorn backend.app.main:app --host 0.0.0.0 --port $PORT`
- Health check path: `/health`
- Plan: Free
- Persistent disk: none

Configure `FRONTEND_ORIGIN` in the backend service to the exact deployed frontend
origin (scheme and host only). Comma-separated origins are supported. If it is
unset, CORS allows only the local Vite origins `http://127.0.0.1:5173` and
`http://localhost:5173`.

`GEMINI_API_KEY` is optional and must be set only on the backend if assistant
chat is needed. `GEMINI_MODEL` is optional and defaults to `gemini-2.5-flash`.
Leave `DATABASE_URL` unset for the SQLite demo; SQLite, uploads, job records,
and generated outputs are ephemeral without a persistent disk. Render provides
`PORT`. Set `VITE_API_BASE_URL` on the separate Render Static Site to the actual
backend HTTPS URL after Render assigns it; never put backend secrets in Vite
environment variables.

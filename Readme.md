# GeoCadastra — GeoAI Mapping and Cadastral Analysis

GeoCadastra is a geospatial AI application for exploring aerial imagery, running building-footprint extraction, relating building results to cadastral parcels, reviewing generated artifacts, and viewing project and model information.

The repository contains a React/Vite web application, a FastAPI service, ML and GIS processing code, demo and evaluation assets, and automated tests. The API orchestrates the existing processing pipeline; the browser does not run the ML models.

> **Data integrity:** Results depend on the supplied imagery, model checkpoint, parcel layer, coordinate reference system (CRS), and pipeline output. The application should not be treated as a survey or legal cadastral authority without independent validation.

## Smart India Hackathon (SIH) Project

**GeoCadastra** is an AI-powered geospatial platform designed to transform drone and aerial imagery into GIS-ready building and cadastral insights.

### Problem

Conventional aerial-image and cadastral workflows often require separate tools for image analysis, building-footprint extraction, GIS processing, parcel association, and result review. This can make urban mapping workflows time-consuming and difficult to manage in one place.

### Solution

GeoCadastra combines **Computer Vision, GeoAI, and GIS processing** in a unified web platform. Users can upload aerial imagery, select a building-segmentation model, generate building footprints, associate detected buildings with available cadastral parcels, calculate spatial measurements and statistics, and review the generated outputs.

### AI + GIS Approach

- **U-Net++** for semantic building segmentation
- **YOLO11-Seg** for building segmentation
- **Mask R-CNN** for building instance segmentation
- **GIS processing** for footprints, measurements, CRS-aware geographic outputs, and parcel/building relationships
- **GeoAI Assistant** using Google Gemini when configured
- **PostgreSQL/PostGIS** for supported spatial and job metadata

### Key Innovation

GeoCadastra brings the **ML inference → GIS processing → cadastral association → visualization and review** workflow into a single application, while preserving model-specific outputs and supporting multiple building-segmentation approaches.

### SIH Relevance

The platform is intended to support **AI-assisted urban mapping, building-footprint extraction, cadastral analysis, and geospatial decision-support workflows** using drone and aerial imagery.

## Contents

- [Capabilities](#capabilities)
- [System architecture](#system-architecture)
- [Processing flow](#processing-flow)
- [Project layout](#project-layout)
- [Runtime files and model checkpoints](#runtime-files-and-model-checkpoints)
- [Requirements](#requirements)
- [Run locally](#run-locally)
- [Configuration and secrets](#configuration-and-secrets)
- [API overview](#api-overview)
- [Database behavior](#database-behavior)
- [Testing and production build](#testing-and-production-build)
- [Render deployment planning](#render-deployment-planning)
- [Limitations and operational notes](#limitations-and-operational-notes)

## Mask R-CNN production checkpoint

The public Mask R-CNN checkpoint is provisioned during the Render backend build
from a pinned Hugging Face revision. The build script verifies the expected
SHA-256 before writing it to the runtime path:

`building_segmentation/runs/maskrcnn/building_instances_fixed/best.pth`

The source revision, expected checksum, and download logic are maintained in
`scripts/fetch_maskrcnn_checkpoint.py`. No Hugging Face token is required.

## Capabilities

- Authenticated workspace pages for dashboard, analysis, model and dataset browsing, map exploration, results, reports, review, history, settings, and account/profile.
- React-based image upload and processing workflow backed by FastAPI.
- Building inference using the available U-Net++, YOLO11 segmentation, and Mask R-CNN production model options.
- GIS processing for building footprints and, when valid parcel input is supplied, parcel/building relationships and statistics.
- Job status, history, results, artifact inspection, validation, and download flows.
- Dataset registry and model-comparison/demo views using project-provided assets.
- GeoAI Assistant backed by the Google GenAI Python SDK when a server-side Gemini API key is configured.
- SQLAlchemy database integration for job and spatial metadata, with SQLite as the free-demo fallback when `DATABASE_URL` is unset.

## System architecture

```mermaid
flowchart LR
    User[User]
    Browser[React + Vite web client]
    Router[React Router]
    API[FastAPI application]
    Auth[Authentication API]
    Assistant[GeoAI Assistant API]
    Dashboard[Dashboard, history, dataset and model APIs]
    Processing[Upload and processing APIs]
    Pipeline[Existing ML and GIS pipeline]
    Models[Production model checkpoints]
    Files[Uploaded inputs, job records and generated artifacts]
    DB[(Configured SQLAlchemy database)]
    Gemini[Google Gemini API]

    User --> Browser
    Browser --> Router
    Router --> API
    API --> Auth
    API --> Assistant
    API --> Dashboard
    API --> Processing
    Assistant --> Gemini
    Processing --> Pipeline
    Pipeline --> Models
    Pipeline --> Files
    API --> Files
    API --> DB
    Pipeline --> DB
```

The application has two primary runtime components:

1. **Web client** — React pages and shared components are built with Vite. API requests are made by the frontend API service.
2. **API and processing service** — FastAPI exposes the application's REST endpoints and invokes the existing Python processing orchestration. The processing code writes job state and artifacts to the filesystem and persists supported metadata to the configured database.

The Gemini API key belongs only in the backend runtime environment. It must not be placed in Vite variables, frontend source, or a committed environment file.

## Processing flow

```mermaid
sequenceDiagram
    actor User
    participant UI as React client
    participant API as FastAPI
    participant Upload as Upload storage
    participant Model as Selected checkpoint
    participant Pipeline as ML/GIS pipeline
    participant Store as Job/artifact storage
    participant DB as Configured database

    User->>UI: Select image, model and optional parcel data
    UI->>API: POST /api/upload
    API->>Upload: Save uploaded image
    API-->>UI: Return file_id
    UI->>API: POST /api/process (file_id, model, options)
    API->>Model: Resolve and validate checkpoint path
    API->>Pipeline: Run existing processing pipeline
    Pipeline->>Store: Write job record and output artifacts
    Pipeline->>DB: Persist supported job/spatial metadata
    API-->>UI: Return job_id and initial status
    UI->>API: GET /api/status/{job_id}
    API-->>UI: Return job status
    UI->>API: GET /api/results/{job_id}
    API->>Store: Read job manifest and output files
    API-->>UI: Return result summary and artifact names
    UI->>API: GET /api/jobs/{job_id}/files/{filename}
    API-->>UI: Stream requested artifact
```

### Geographic data handling

Geographic output depends on the actual source imagery metadata. A GeoTIFF with usable CRS and affine-transform metadata can support geographic footprints. Image-only inputs without geographic referencing can produce pixel-space diagnostic output, but must not be interpreted as georeferenced cadastral geometry.

Parcel operations require an actual parcel dataset and an applicable parcel identifier field. If parcel data is not supplied or cannot be read, parcel-level results are unavailable rather than inferred.

## Project layout

```text
.
├── src/                              # React pages, components, hooks and API client
│   ├── api/                          # Feature-specific frontend API modules
│   ├── assets/                       # Frontend images and other bundled assets
│   ├── components/                   # Shared and page-level UI components
│   ├── hooks/                        # Authentication, job and demo state
│   ├── layouts/                      # Application shell and navigation
│   ├── pages/                        # Landing, analysis, maps, results and other pages
│   └── services/                     # Shared API client
├── backend/
│   ├── app/
│   │   ├── api/                      # FastAPI route modules
│   │   ├── core/                     # Runtime paths and configuration
│   │   ├── db/                       # SQLAlchemy models and database setup
│   │   ├── schemas/                  # API data schemas
│   │   └── services/                 # Gemini, file and pipeline services
│   ├── .env.example                  # Environment variable template
│   ├── README.md
│   ├── README_DATABASE.md
│   └── requirements.txt
├── building_segmentation/            # Training, inference, datasets and model utilities
│   ├── runs/                         # Production checkpoints and selected previews
│   ├── unet_dataset/                 # Dataset registry and sample browsing data
│   └── requirements.txt
├── gis_processing/                   # Footprint, measurement, parcel and CRS processing
│   ├── input/                        # Project-provided GIS demo inputs
│   └── requirements.txt
├── final_validation/                 # Runtime benchmark and comparison assets
├── tests/                            # Backend and pipeline tests
├── package.json                      # Frontend scripts and dependencies
├── package-lock.json                 # Locked frontend dependency tree
├── requirements.txt                  # Pinned backend/GIS/model runtime dependencies
├── render.yaml                       # Render frontend Static Site configuration
├── render-backend.yaml               # Render backend Web Service configuration
├── scripts/fetch_maskrcnn_checkpoint.py
├── run_full_pipeline.py              # Project processing orchestration
└── vite.config.js                    # Vite frontend configuration
```

Some project data directories contain local generated content. Consult `.gitignore` before adding files. Do not commit environment files, credentials, virtual environments, Node dependencies, local databases, user uploads, job history, or generated processing output.

## Runtime files and model checkpoints

The backend model catalog uses these production checkpoint locations:

| Model ID | Checkpoint path | Approximate size | Notes |
|---|---|---:|---|
| `unetpp` | `building_segmentation/runs/unetpp/building_refinement/best.pt` | 57.32 MB | Default processing checkpoint |
| `yolo11` | `building_segmentation/runs/segment/building_yolo11/weights/best.pt` | 5.72 MB | Production segmentation checkpoint |
| `maskrcnn` | `building_segmentation/runs/maskrcnn/building_instances_fixed/best.pth` | 175.37 MB | Production checkpoint; stored separately from ordinary Git source |

The application resolves model paths relative to the project root and rejects missing, empty, unreadable, or out-of-root checkpoint paths. The U-Net++ and YOLO11 checkpoints remain at their existing repository paths. The Render backend build runs `scripts/fetch_maskrcnn_checkpoint.py` to download the public Mask R-CNN checkpoint at a pinned revision, verify its SHA-256, and place it at the expected path before startup.

Additional runtime/demo data currently referenced by backend routes includes:

- `building_segmentation/unet_dataset/` and `Semantic segmentation dataset/` for dataset and demo browsing.
- `building_segmentation/runs/predictions/`, `building_segmentation/unet_evaluation_results/`, and `building_segmentation/maskrcnn_evaluation_results/` for dataset/model preview information.
- `final_validation/final_model_benchmark.json` and visual comparison assets for dashboard comparisons.
- `gis_processing/input/aerial.tif`, `gis_processing/input/ai4boundaries_sampling.gpkg`, and `gis_processing/input/parcels.gpkg` for the included project GIS demo.

Training/resume checkpoints such as `last.pt` and `last.pth`, historical model runs, local uploads, outputs, and job records are not required as source files for a clean deployment unless you specifically choose to preserve that local state.

## Requirements

- Node.js and npm for the React/Vite frontend.
- Python for FastAPI, ML, and GIS processing.
- The backend runtime packages pinned in the repository-root `requirements.txt`. Training-only scripts may use the separate manifests under `backend/`, `building_segmentation/`, and `gis_processing/`.
- No PostgreSQL/PostGIS service is required for the free demo; SQLite is used when `DATABASE_URL` is unset.
- The production model checkpoints at the exact paths listed above.
- A Gemini API key only if the GeoAI Assistant is to call Gemini.

The Python dependency sets overlap. Install them in a dedicated virtual environment for the project; do not use the project's checked-in/local `.venv` as a deployment artifact.

## Run locally

Run the frontend and API from the repository root in separate terminals.

### 1. Install frontend dependencies

```bash
npm ci
```

### 2. Install Python dependencies

Create and activate a virtual environment using your platform's standard Python tooling, then install the three manifests:

```bash
python -m pip install -r backend/requirements.txt
python -m pip install -r building_segmentation/requirements.txt
python -m pip install -r gis_processing/requirements.txt
```

Geospatial Python packages may require platform-compatible binary wheels or system libraries. Follow the installation guidance for the operating system and packages used by your environment.

### 3. Configure the backend

Copy `backend/.env.example` to `backend/.env` for local use, then set the values appropriate for your local database and optional Gemini access. Never commit `backend/.env`.

At minimum, configure:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Optional SQLAlchemy database connection; leave unset for the SQLite free-demo fallback |
| `GEMINI_API_KEY` | Server-side Gemini credential; leave unset if the assistant is not configured |
| `GEMINI_MODEL` | Gemini model identifier; backend default is `gemini-2.5-flash` |

The example file is a template, not a production credential source. Use secret environment variables in hosted deployments.

### 4. Start FastAPI

```bash
python -m uvicorn backend.app.main:app --reload --host 127.0.0.1 --port 8000
```

FastAPI's interactive API documentation is available at `http://127.0.0.1:8000/docs`.

### 5. Start the frontend

```bash
npm run dev
```

Open the local URL printed by Vite. During local development, Vite proxies API requests to the backend on `127.0.0.1:8000`. For a production build, set `VITE_API_BASE_URL` to the actual backend URL. Vite variables are public build-time configuration and must never contain secrets.

## Configuration and secrets

| Setting | Where it is used | Secret? |
|---|---|---|
| `DATABASE_URL` | Backend database connection | Yes; commonly includes database credentials |
| `GEMINI_API_KEY` | Backend Gemini client | Yes |
| `GEMINI_MODEL` | Backend model selection | No |
| `VITE_API_BASE_URL` | Frontend API base URL | No; do not place keys or passwords in Vite variables |

Keep actual values in local ignored environment files or the hosting provider's secret/environment settings. Rotate any credential that was accidentally committed or exposed. Never paste credentials into issues, logs, documentation, screenshots, or chat.

## API overview

FastAPI is defined in `backend/app/main.py`. The principal routes are:

| Area | Routes |
|---|---|
| Health | `GET /health` |
| Authentication | `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me` |
| Assistant | `GET /api/assistant/status`, `POST /api/assistant/conversations`, `POST /api/assistant/chat` |
| Upload and processing | `POST /api/upload`, `POST /api/process`, `GET /api/status/{job_id}` |
| Results and files | `GET /api/results/{job_id}`, `GET /api/buildings/{job_id}`, `GET /api/parcels/{job_id}`, `GET /api/jobs/{job_id}/files/{filename}` |
| Dashboard and history | `GET /api/dashboard/summary`, `GET /api/history`, `GET /api/postgis/status` |
| Dataset and models | `GET /api/datasets/registry`, `POST /api/datasets/validate`, `GET /api/models/checkpoints` |
| Review | `GET /api/review`, `PATCH /api/review/{review_id}` |
| Demo assets | `/api/demo/...` and `/api/datasets/outputs/...` routes in `backend/app/api/dashboard.py` |

The interactive OpenAPI schema is served by FastAPI at `/docs` when the API is running.

## Database behavior

The backend uses SQLAlchemy models in `backend/app/db/`. It attempts to create the model tables during application startup. The current project does not include an Alembic migration directory; database schema changes should therefore be handled deliberately before production use.

When `DATABASE_URL` is unset, the backend uses its SQLite fallback. This is appropriate for the free/demo deployment, where database contents are ephemeral and may be lost when the Render instance is replaced. No PostgreSQL/PostGIS service is configured or required for this deployment.

Job metadata and generated files also use filesystem storage. A database connection alone does not preserve uploaded images, job JSON records, or output artifacts.

## Testing and production build

Run backend tests from the repository root using the configured Python environment:

```bash
python -m pytest tests
```

Build the frontend:

```bash
npm run build
```

Vite writes production frontend assets to `dist/`. The generated `dist/` directory is build output and should not be treated as the authoritative frontend source.

## Render deployment planning

The repository provides a Render Static Site configuration in `render.yaml` and
a separate free Python Web Service configuration in `render-backend.yaml`. The
backend configuration is separate so the existing frontend Static Site remains
unchanged.

**Frontend Static Site**

- Build command: `npm install && npm run build`
- Publish directory: `dist`
- Build-time variable: `VITE_API_BASE_URL` set to the actual backend HTTPS URL assigned by Render.
- The frontend bundle must not contain a hardcoded localhost backend URL.

**Backend Web Service**

- Root directory: repository root (leave blank).
- Build command: `pip install -r requirements.txt && python scripts/fetch_maskrcnn_checkpoint.py`
- Start command: `uvicorn backend.app.main:app --host 0.0.0.0 --port $PORT`
- Health check path: `/health`
- Plan: Free; no persistent disk, paid database, or Redis.
- Set `FRONTEND_ORIGIN` to the actual frontend origin after Render assigns its URL. Comma-separated origins are supported.
- Leave `DATABASE_URL` unset to use the SQLite demo fallback. Database contents, uploads, job records, and generated outputs are ephemeral.
- `GEMINI_API_KEY` is optional and belongs only in the backend environment; `GEMINI_MODEL` is optional.

The backend build obtains only the Mask R-CNN checkpoint from the public,
revision-pinned Hugging Face source and verifies its SHA-256. The U-Net++ and
YOLO11 checkpoints and the existing read-only dataset, GIS, and comparison
assets stay at their current project paths.

Enter the backend and frontend values in the Render Dashboard after the source
changes have been pushed. Do not substitute a guessed service URL. Validate
the Linux dependency build, `/health`, CORS, and a model inference smoke test
in Render; a free instance may have insufficient memory for ML/GIS inference.

## Limitations and operational notes

- The application uses the actual checkpoint and input data available to it; it does not make absent model files, CRS metadata, parcels, or activity records appear.
- Inference quality and resource usage depend on the selected model, input size, hardware, and runtime limits. Benchmark results in the project are measurements for their recorded evaluation setup, not a guarantee for every deployment.
- The Mask R-CNN checkpoint is public and fetched at build time; the inference code continues to use its existing local project-relative path.
- Generated uploads, job records, SQLite data, and result artifacts are filesystem-backed and ephemeral on the free Render service.
- Keep user-uploaded imagery, parcel data, generated outputs, and credentials protected according to their sensitivity and retention requirements.
- CORS, authentication/session behavior, deployment origins, resource limits, and database access should be reviewed before exposing a public production deployment.

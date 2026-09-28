# Database integration for the parcel mapping backend

This backend keeps the existing filesystem outputs for GeoJSON/PNG/CSV artifacts while adding a structured database layer for job metadata and spatial records.

## Requirements

- PostgreSQL 14+ recommended
- PostGIS extension enabled
- Python packages in `backend/requirements.txt`

## Database creation

```bash
createdb urban_parcel_ai
psql -d urban_parcel_ai -c "CREATE EXTENSION IF NOT EXISTS postgis;"
```

## Environment variables

Copy the example file and adjust it for your local PostgreSQL/PostGIS instance:

```bash
cp backend/.env.example backend/.env
```

Then update the connection string to match your local server:

```env
DATABASE_URL=postgresql+psycopg://postgres:password@localhost:5432/urban_parcel_ai
```

## Initialization

```bash
cd "C:\Users\PC\Downloads\DRONE PROJECT\archive (1) (3)\archive (1)"
python -m backend.app.db.init_db
```

## SQLAlchemy / PostGIS approach

- SQLAlchemy 2.x is used for ORM models.
- GeoAlchemy2 is used for geometry columns.
- The application will use the configured `DATABASE_URL` if available.
- If no PostgreSQL/PostGIS server is reachable, the app falls back to SQLite for local unit tests only.
- The API contract remains the same; the database layer stores job and spatial metadata in addition to the filesystem artifacts.

## API / database flow

1. Upload file via `/api/upload`.
2. Request processing via `/api/process`.
3. The backend creates a processing job record.
4. The orchestration pipeline runs and writes output files to `backend/outputs/<job_id>/`.
5. Structured model and geometry records are stored in PostgreSQL/PostGIS when available.
6. `/api/status/{job_id}` and `/api/results/{job_id}` read the stored metadata and output files.

## Safety notes

- Georeferenced results keep the real CRS only when it exists.
- Pixel-space results stay pixel-space metadata and are never claimed to be geospatially referenced.
- No coordinates, CRS, or parcel IDs are invented.

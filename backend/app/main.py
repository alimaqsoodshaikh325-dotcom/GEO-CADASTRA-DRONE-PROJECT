from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.app.api.assistant import router as assistant_router
from backend.app.api.auth import router as auth_router
from backend.app.api.dashboard import router as dashboard_router
from backend.app.api.processing import router as processing_router
from backend.app.api.results import router as results_router
from backend.app.api.review import router as review_router
from backend.app.db.database import Base, engine
from backend.app.api.upload import router as upload_router
from backend.app.db.database import database_status

app = FastAPI(title='GeoCadastra GeoAI API', version='2.0.0')

app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)

app.include_router(assistant_router)
app.include_router(auth_router)
app.include_router(dashboard_router)
app.include_router(upload_router)
app.include_router(processing_router)
app.include_router(results_router)
app.include_router(review_router)

try:
    Base.metadata.create_all(bind=engine)
except Exception:
    pass


@app.get('/health')
def health():
    db = database_status()
    return {
        'status': 'ok',
        'service': 'geocadastra-geoai-api',
        'version': '2.0.0',
        'database': db,
    }

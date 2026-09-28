from __future__ import annotations

import json
from datetime import datetime
from typing import Any, Iterable

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.db.database import USE_SQLITE_FALLBACK
from backend.app.db.models import (
    Building,
    BuildingParcelRelation,
    ModelResult,
    Parcel,
    ProcessingJob,
    Project,
)


class BaseRepository:
    def __init__(self, session: Session):
        self.session = session


class ProjectRepository(BaseRepository):
    def create(self, *, name: str, project_id: str | None = None) -> Project:
        project = Project(id=project_id or f'proj_{datetime.utcnow().strftime("%Y%m%d%H%M%S%f")}', name=name)
        self.session.add(project)
        self.session.commit()
        self.session.refresh(project)
        return project

    def get(self, project_id: str) -> Project | None:
        return self.session.get(Project, project_id)


class ProcessingJobRepository(BaseRepository):
    def create(self, *, project_id: str | None, input_filename: str | None, model_name: str | None, status: str = 'queued', job_id: str | None = None) -> ProcessingJob:
        job = ProcessingJob(
            id=job_id or f'job_{datetime.utcnow().strftime("%Y%m%d%H%M%S%f")}',
            project_id=project_id,
            input_filename=input_filename,
            model_name=model_name,
            status=status,
            started_at=datetime.utcnow(),
        )
        self.session.add(job)
        self.session.commit()
        self.session.refresh(job)
        return job

    def get(self, job_id: str) -> ProcessingJob | None:
        return self.session.get(ProcessingJob, job_id)

    def update_status(self, job_id: str, *, status: str, error_message: str | None = None, completed_at: datetime | None = None) -> ProcessingJob | None:
        job = self.get(job_id)
        if job is None:
            return None
        job.status = status
        if error_message is not None:
            job.error_message = error_message
        if completed_at is not None:
            job.completed_at = completed_at
        self.session.commit()
        self.session.refresh(job)
        return job

    def list(self) -> list[ProcessingJob]:
        return self.session.execute(select(ProcessingJob)).scalars().all()


class BuildingRepository(BaseRepository):
    def create(self, *, job_id: str, building_id: str, model_name: str, confidence: float | None, area_m2: float | None, perimeter_m: float | None, quality_class: str | None, boundary_status: str | None, geometry: Any | None) -> Building:
        if isinstance(geometry, (dict, list)):
            if USE_SQLITE_FALLBACK:
                geometry = json.dumps(geometry)
            else:
                from geoalchemy2.shape import from_shape
                from shapely.geometry import shape
                geometry = from_shape(shape(geometry), srid=4326)
        building = Building(
            id=f'building_{datetime.utcnow().strftime("%Y%m%d%H%M%S%f")}',
            job_id=job_id,
            building_id=building_id,
            model_name=model_name,
            confidence=confidence,
            area_m2=area_m2,
            perimeter_m=perimeter_m,
            quality_class=quality_class,
            boundary_status=boundary_status,
            geometry=geometry,
        )
        self.session.add(building)
        self.session.commit()
        self.session.refresh(building)
        return building

    def list_for_job(self, job_id: str) -> list[Building]:
        return self.session.execute(select(Building).where(Building.job_id == job_id)).scalars().all()


class ParcelRepository(BaseRepository):
    def create(self, *, job_id: str, parcel_id: str, area_m2: float | None, geometry: Any | None) -> Parcel:
        if isinstance(geometry, (dict, list)):
            if USE_SQLITE_FALLBACK:
                geometry = json.dumps(geometry)
            else:
                from geoalchemy2.shape import from_shape
                from shapely.geometry import shape
                geometry = from_shape(shape(geometry), srid=4326)
        parcel = Parcel(
            id=f'parcel_{datetime.utcnow().strftime("%Y%m%d%H%M%S%f")}',
            job_id=job_id,
            parcel_id=parcel_id,
            area_m2=area_m2,
            geometry=geometry,
        )
        self.session.add(parcel)
        self.session.commit()
        self.session.refresh(parcel)
        return parcel

    def list_for_job(self, job_id: str) -> list[Parcel]:
        return self.session.execute(select(Parcel).where(Parcel.job_id == job_id)).scalars().all()


class BuildingParcelRelationRepository(BaseRepository):
    def create(self, *, building_id: str, parcel_id: str, intersection_area_m2: float | None, coverage_ratio: float | None, relation_status: str | None) -> BuildingParcelRelation:
        relation = BuildingParcelRelation(
            id=f'relation_{datetime.utcnow().strftime("%Y%m%d%H%M%S%f")}',
            building_id=building_id,
            parcel_id=parcel_id,
            intersection_area_m2=intersection_area_m2,
            coverage_ratio=coverage_ratio,
            relation_status=relation_status,
        )
        self.session.add(relation)
        self.session.commit()
        self.session.refresh(relation)
        return relation

    def list_for_building(self, building_id: str) -> list[BuildingParcelRelation]:
        return self.session.execute(select(BuildingParcelRelation).where(BuildingParcelRelation.building_id == building_id)).scalars().all()


class ModelResultRepository(BaseRepository):
    def create(self, *, job_id: str, model_name: str, inference_time: float | None, prediction_count: int | None, metrics_json: dict | None) -> ModelResult:
        result = ModelResult(
            id=f'model_{datetime.utcnow().strftime("%Y%m%d%H%M%S%f")}',
            job_id=job_id,
            model_name=model_name,
            inference_time=inference_time,
            prediction_count=float(prediction_count) if prediction_count is not None else None,
            metrics_json=metrics_json or {},
        )
        self.session.add(result)
        self.session.commit()
        self.session.refresh(result)
        return result

    def list_for_job(self, job_id: str) -> list[ModelResult]:
        return self.session.execute(select(ModelResult).where(ModelResult.job_id == job_id)).scalars().all()

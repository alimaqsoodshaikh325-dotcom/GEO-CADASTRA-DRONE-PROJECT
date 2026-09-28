from __future__ import annotations

from datetime import datetime
from typing import Any

from geoalchemy2 import Geometry
from sqlalchemy import JSON, Column, DateTime, Float, ForeignKey, String, Text
from sqlalchemy.orm import relationship

from backend.app.db.database import Base, USE_SQLITE_FALLBACK


class Project(Base):
    __tablename__ = 'projects'

    id = Column(String(64), primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class ProcessingJob(Base):
    __tablename__ = 'processing_jobs'

    id = Column(String(64), primary_key=True, index=True)
    project_id = Column(String(64), ForeignKey('projects.id'), nullable=True)
    status = Column(String(32), default='queued', nullable=False)
    input_filename = Column(String(255), nullable=True)
    model_name = Column(String(255), nullable=True)
    started_at = Column(DateTime, default=datetime.utcnow, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    error_message = Column(Text, nullable=True)

    project = relationship('Project')


class Building(Base):
    __tablename__ = 'buildings'

    id = Column(String(64), primary_key=True, index=True)
    job_id = Column(String(64), ForeignKey('processing_jobs.id'), nullable=False)
    building_id = Column(String(64), nullable=False)
    model_name = Column(String(255), nullable=True)
    confidence = Column(Float, nullable=True)
    area_m2 = Column(Float, nullable=True)
    perimeter_m = Column(Float, nullable=True)
    quality_class = Column(String(64), nullable=True)
    boundary_status = Column(String(64), nullable=True)
    geometry = Column(Geometry(geometry_type='GEOMETRY', srid=4326, spatial_index=False) if not USE_SQLITE_FALLBACK else Text, nullable=True)


class Parcel(Base):
    __tablename__ = 'parcels'

    id = Column(String(64), primary_key=True, index=True)
    job_id = Column(String(64), ForeignKey('processing_jobs.id'), nullable=False)
    parcel_id = Column(String(64), nullable=False)
    area_m2 = Column(Float, nullable=True)
    geometry = Column(Geometry(geometry_type='GEOMETRY', srid=4326, spatial_index=False) if not USE_SQLITE_FALLBACK else Text, nullable=True)


class BuildingParcelRelation(Base):
    __tablename__ = 'building_parcel_relations'

    id = Column(String(64), primary_key=True, index=True)
    building_id = Column(String(64), nullable=False)
    parcel_id = Column(String(64), nullable=False)
    intersection_area_m2 = Column(Float, nullable=True)
    coverage_ratio = Column(Float, nullable=True)
    relation_status = Column(String(64), nullable=True)


class ModelResult(Base):
    __tablename__ = 'model_results'

    id = Column(String(64), primary_key=True, index=True)
    job_id = Column(String(64), ForeignKey('processing_jobs.id'), nullable=False)
    model_name = Column(String(255), nullable=False)
    inference_time = Column(Float, nullable=True)
    prediction_count = Column(Float, nullable=True)
    metrics_json = Column(JSON, nullable=True)


class User(Base):
    __tablename__ = 'users'

    id = Column(String(64), primary_key=True, index=True)
    full_name = Column(String(255), nullable=False)
    email = Column(String(255), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    organization = Column(String(255), nullable=True)
    role = Column(String(64), default='Analyst', nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class ReviewRecord(Base):
    __tablename__ = 'review_records'

    id = Column(String(128), primary_key=True, index=True)
    job_id = Column(String(64), nullable=False, index=True)
    building_id = Column(String(128), nullable=False)
    parcel_id = Column(String(128), nullable=True)
    exception_type = Column(String(64), nullable=False)
    status = Column(String(32), default='OPEN', nullable=False)
    reviewer_id = Column(String(64), nullable=True)
    decision = Column(String(64), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


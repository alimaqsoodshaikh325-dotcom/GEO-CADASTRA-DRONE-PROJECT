from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.orm import Session

from backend.app.db import database as app_db
from backend.app.db.database import Base
from backend.app.db.models import Building, BuildingParcelRelation, ModelResult, Parcel, ProcessingJob, Project
from backend.app.db.repositories import (
    BuildingParcelRelationRepository,
    BuildingRepository,
    ModelResultRepository,
    ParcelRepository,
    ProcessingJobRepository,
    ProjectRepository,
)


def _test_engine():
    return app_db.engine


def _reset_test_data() -> None:
    with app_db.engine.begin() as connection:
        for table in reversed(Base.metadata.sorted_tables):
            connection.execute(text(f'DELETE FROM "{table.name}"'))


def test_database_configuration():
    from backend.app.db import database
    assert hasattr(database, 'Base')
    assert hasattr(database, 'SessionLocal')
    assert database.DATABASE_URL is not None


def test_model_metadata():
    assert hasattr(Project, '__tablename__')
    assert hasattr(ProcessingJob, '__tablename__')
    assert hasattr(Building, '__tablename__')
    assert hasattr(Parcel, '__tablename__')
    assert hasattr(BuildingParcelRelation, '__tablename__')
    assert hasattr(ModelResult, '__tablename__')


def test_repository_crud_and_job_creation():
    _reset_test_data()
    engine = _test_engine()
    with Session(engine) as session:
        project_repo = ProjectRepository(session)
        project = project_repo.create(name='demo-project')
        assert project.name == 'demo-project'

        job_repo = ProcessingJobRepository(session)
        job = job_repo.create(project_id=project.id, input_filename='sample.png', model_name='U-Net++')
        assert job.status == 'queued'
        assert job.input_filename == 'sample.png'

        job_repo.update_status(job.id, status='completed')
        updated = job_repo.get(job.id)
        assert updated is not None and updated.status == 'completed'


def test_building_insertion_and_parcel_insertion():
    _reset_test_data()
    engine = _test_engine()
    with Session(engine) as session:
        project = ProjectRepository(session).create(name='geom-project')
        job = ProcessingJobRepository(session).create(project_id=project.id, input_filename='sample.tif', model_name='U-Net++')

        building = BuildingRepository(session).create(
            job_id=job.id,
            building_id='B001',
            model_name='U-Net++',
            confidence=0.91,
            area_m2=120.0,
            perimeter_m=44.0,
            quality_class='HIGH_CONFIDENCE',
            boundary_status='NORMAL',
            geometry={'type': 'Polygon', 'coordinates': [[(0, 0), (1, 0), (1, 1), (0, 1), (0, 0)]]},
        )
        parcel = ParcelRepository(session).create(
            job_id=job.id,
            parcel_id='P1',
            area_m2=500.0,
            geometry={'type': 'Polygon', 'coordinates': [[(0, 0), (10, 0), (10, 10), (0, 10), (0, 0)]]},
        )

        assert building.building_id == 'B001'
        assert parcel.parcel_id == 'P1'
        assert len(BuildingRepository(session).list_for_job(job.id)) == 1
        assert len(ParcelRepository(session).list_for_job(job.id)) == 1


def test_building_parcel_relation_and_model_result():
    _reset_test_data()
    engine = _test_engine()
    with Session(engine) as session:
        project = ProjectRepository(session).create(name='relation-project')
        job = ProcessingJobRepository(session).create(project_id=project.id, input_filename='sample.png', model_name='U-Net++')
        building = BuildingRepository(session).create(
            job_id=job.id,
            building_id='B001',
            model_name='U-Net++',
            confidence=0.9,
            area_m2=100.0,
            perimeter_m=40.0,
            quality_class='HIGH_CONFIDENCE',
            boundary_status='NORMAL',
            geometry={'type': 'Polygon', 'coordinates': [[(0, 0), (5, 0), (5, 5), (0, 5), (0, 0)]]},
        )
        relation = BuildingParcelRelationRepository(session).create(
            building_id=building.building_id,
            parcel_id='P1',
            intersection_area_m2=90.0,
            coverage_ratio=0.9,
            relation_status='NORMAL',
        )
        model_result = ModelResultRepository(session).create(
            job_id=job.id,
            model_name='U-Net++',
            inference_time=1.2,
            prediction_count=1,
            metrics_json={'precision': 0.9},
        )

        assert relation.relation_status == 'NORMAL'
        assert model_result.model_name == 'U-Net++'
        assert len(ModelResultRepository(session).list_for_job(job.id)) == 1


def test_empty_result_handling():
    _reset_test_data()
    engine = _test_engine()
    with Session(engine) as session:
        project = ProjectRepository(session).create(name='empty-project')
        job = ProcessingJobRepository(session).create(project_id=project.id, input_filename='empty.png', model_name='U-Net++')
        assert len(BuildingRepository(session).list_for_job(job.id)) == 0
        assert len(ParcelRepository(session).list_for_job(job.id)) == 0
        job_repo = ProcessingJobRepository(session)
        job_repo.update_status(job.id, status='completed')
        persisted = job_repo.get(job.id)
        assert persisted is not None
        assert persisted.status == 'completed'

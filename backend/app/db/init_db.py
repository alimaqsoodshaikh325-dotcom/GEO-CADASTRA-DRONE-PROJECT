from __future__ import annotations

from backend.app.db.database import Base, engine
from backend.app.db.models import Building, BuildingParcelRelation, ModelResult, Parcel, ProcessingJob, Project


def init_db() -> None:
    Base.metadata.create_all(bind=engine)


if __name__ == '__main__':
    init_db()
    print('Database tables created.')

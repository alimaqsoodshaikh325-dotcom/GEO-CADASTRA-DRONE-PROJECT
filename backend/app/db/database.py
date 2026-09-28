from __future__ import annotations

import os
from pathlib import Path
from typing import Generator

from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker


def _load_backend_env() -> None:
    env_path = Path(__file__).resolve().parents[2] / '.env'
    if not env_path.exists():
        return

    for line in env_path.read_text(encoding='utf-8').splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith('#') or '=' not in stripped:
            continue
        key, value = stripped.split('=', 1)
        key = key.strip()
        value = value.strip().strip('"\'')
        os.environ.setdefault(key, value)


_load_backend_env()


class Base(DeclarativeBase):
    pass


DATABASE_URL = os.getenv('DATABASE_URL', 'sqlite:///./backend/app.db')
USE_SQLITE_FALLBACK = DATABASE_URL.startswith('sqlite')

engine = create_engine(DATABASE_URL, future=True, echo=False)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def database_status() -> dict[str, str]:
    try:
        with engine.connect() as connection:
            connection.execute(text('SELECT 1'))
        if USE_SQLITE_FALLBACK:
            return {'database': 'sqlite-fallback', 'status': 'ok'}
        return {'database': 'postgresql', 'status': 'connected'}
    except Exception as exc:
        if USE_SQLITE_FALLBACK:
            return {'database': 'sqlite-fallback', 'status': 'unavailable', 'error': str(exc)}
        return {'database': 'postgresql', 'status': 'unavailable', 'error': str(exc)}

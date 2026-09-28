from __future__ import annotations

import hashlib
import hmac
import os
import re
import secrets
import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.app.db.database import Base, engine, get_db
from backend.app.db.models import User

# Ensure tables exist
try:
    Base.metadata.create_all(bind=engine)
except Exception:
    pass

router = APIRouter(tags=['Authentication'])

SECRET_KEY = os.getenv('JWT_SECRET', 'geocadastra-secure-spatial-secret-2026')
EMAIL_REGEX = re.compile(r'^[^\s@]+@[^\s@]+\.[^\s@]+$')


def hash_password(password: str) -> str:
    salt = 'geocadastra-salt'
    return hashlib.sha256((salt + password).encode('utf-8')).hexdigest()


def verify_password(password: str, hashed: str) -> bool:
    return hmac.compare_digest(hash_password(password), hashed)


class RegisterRequest(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=255, description='Full name of the user')
    email: str = Field(..., description='Work email address')
    password: str = Field(..., min_length=8, description='Account password (minimum 8 characters)')
    organization: str | None = Field(default=None, description='Organization or Cadastral Agency name')


class LoginRequest(BaseModel):
    email: str = Field(..., description='Registered work email address')
    password: str = Field(..., description='Account password')


class UserResponse(BaseModel):
    id: str
    email: str
    full_name: str
    organization: str | None = None
    role: str = 'Analyst'
    created_at: str | None = None


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = 'bearer'
    user: UserResponse


def _process_registration(payload: RegisterRequest, db: Session) -> AuthResponse:
    clean_email = payload.email.strip().lower()
    clean_name = payload.full_name.strip()
    clean_org = payload.organization.strip() if payload.organization else None

    # Validation
    if not EMAIL_REGEX.match(clean_email):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail='Please enter a valid work email address.'
        )

    if len(payload.password) < 8:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail='Password must contain at least 8 characters.'
        )

    # Check duplicate email
    try:
        existing = db.query(User).filter(func.lower(User.email) == clean_email).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail='An institutional account with this email address already exists.'
            )
    except HTTPException:
        raise
    except Exception as exc:
        db.rollback()
        # Retry once after rollback
        existing = db.query(User).filter(func.lower(User.email) == clean_email).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail='An institutional account with this email address already exists.'
            )

    user_id = f'user_{uuid.uuid4().hex[:12]}'
    password_hash = hash_password(payload.password)

    new_user = User(
        id=user_id,
        full_name=clean_name,
        email=clean_email,
        password_hash=password_hash,
        organization=clean_org,
        role='Analyst',
        created_at=datetime.utcnow()
    )

    try:
        db.add(new_user)
        db.commit()
        db.refresh(new_user)
    except Exception as exc:
        db.rollback()
        # If DB integrity error occurs (e.g. duplicate key)
        if 'unique' in str(exc).lower() or 'duplicate' in str(exc).lower():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail='An institutional account with this email address already exists.'
            )
        # Otherwise raise server error
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f'Failed to create user record: {exc}'
        )

    token = secrets.token_urlsafe(32)

    return AuthResponse(
        access_token=token,
        token_type='bearer',
        user=UserResponse(
            id=new_user.id,
            email=new_user.email,
            full_name=new_user.full_name,
            organization=new_user.organization,
            role=new_user.role,
            created_at=new_user.created_at.isoformat() if new_user.created_at else None
        )
    )


def _process_login(payload: LoginRequest, db: Session) -> AuthResponse:
    clean_email = payload.email.strip().lower()

    if not clean_email or not payload.password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail='Email and password are required.'
        )

    try:
        user = db.query(User).filter(func.lower(User.email) == clean_email).first()
    except Exception:
        db.rollback()
        user = db.query(User).filter(func.lower(User.email) == clean_email).first()

    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail='Invalid work email or password credentials.'
        )

    token = secrets.token_urlsafe(32)

    return AuthResponse(
        access_token=token,
        token_type='bearer',
        user=UserResponse(
            id=user.id,
            email=user.email,
            full_name=user.full_name,
            organization=user.organization,
            role=user.role,
            created_at=user.created_at.isoformat() if user.created_at else None
        )
    )


# Register endpoints
@router.post('/api/auth/register', response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def api_register(payload: RegisterRequest, db: Session = Depends(get_db)):
    return _process_registration(payload, db)


@router.post('/auth/register', response_model=AuthResponse, status_code=status.HTTP_201_CREATED, include_in_schema=False)
def auth_register(payload: RegisterRequest, db: Session = Depends(get_db)):
    return _process_registration(payload, db)


# Login endpoints
@router.post('/api/auth/login', response_model=AuthResponse)
def api_login(payload: LoginRequest, db: Session = Depends(get_db)):
    return _process_login(payload, db)


@router.post('/auth/login', response_model=AuthResponse, include_in_schema=False)
def auth_login(payload: LoginRequest, db: Session = Depends(get_db)):
    return _process_login(payload, db)


# Current user endpoint
@router.get('/api/auth/me', response_model=UserResponse)
def api_me(db: Session = Depends(get_db)):
    user = db.query(User).first()
    if not user:
        return UserResponse(
            id='demo_user',
            email='operator@geocadastra.ai',
            full_name='Geospatial Analyst',
            organization='Cadastral Operations',
            role='Analyst'
        )
    return UserResponse(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        organization=user.organization,
        role=user.role,
        created_at=user.created_at.isoformat() if user.created_at else None
    )

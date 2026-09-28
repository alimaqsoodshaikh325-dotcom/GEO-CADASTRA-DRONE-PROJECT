from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class UploadResponse(BaseModel):
    file_id: str
    filename: str
    saved_path: str
    status: str = 'uploaded'


class JobRequest(BaseModel):
    file_id: str
    model: str = 'building_segmentation/runs/unetpp/building_refinement/best.pt'
    parcel_file: str | None = None
    parcel_id_field: str = 'ID'
    confidence: float = 0.5


class JobStatus(BaseModel):
    job_id: str
    status: str
    progress: int = 0
    message: str
    created_at: str
    completed_at: str | None = None


class ResultSummary(BaseModel):
    empty_result: bool = False
    building_count: int = 0
    parcel_count: int = 0
    confidence_summary: dict[str, Any] = Field(default_factory=dict)
    processing_status: str = 'unknown'
    report_path: str | None = None
    output_dir: str | None = None


class JobResult(BaseModel):
    job_id: str
    status: str
    summary: ResultSummary
    output_files: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)

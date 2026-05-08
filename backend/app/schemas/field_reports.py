# =============================================================================
# AEROFINDER Backend — Schemas: Field Reports
# =============================================================================

import uuid
from datetime import datetime

from pydantic import BaseModel


class FieldReportCreate(BaseModel):
    notes: str | None = None
    location_lat: float | None = None
    location_lon: float | None = None


class FieldReportReject(BaseModel):
    reason: str


class FieldReportPhotoResponse(BaseModel):
    id: uuid.UUID
    minio_object: str
    uploaded_at: datetime

    model_config = {"from_attributes": True}


class FieldReportMatchResponse(BaseModel):
    person_id: uuid.UUID
    person_name: str
    similarity_score: float
    rank: int
    photo_url: str | None = None

    model_config = {"from_attributes": True}


class FieldReportResponse(BaseModel):
    id: uuid.UUID
    mission_id: uuid.UUID
    rescuer_id: uuid.UUID
    rescuer_name: str
    status: str
    notes: str | None
    location_lat: float | None
    location_lon: float | None
    approved_by: uuid.UUID | None
    approved_at: datetime | None
    completed_at: datetime | None
    created_at: datetime
    photos: list[FieldReportPhotoResponse] = []
    matches: list[FieldReportMatchResponse] = []

    model_config = {"from_attributes": True}


class UploadUrlResponse(BaseModel):
    presigned_url: str
    object_name: str
    photo_index: int


class ConfirmPhotoRequest(BaseModel):
    object_name: str

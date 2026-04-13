# =============================================================================
# AEROFINDER Backend — Schemas Pydantic: Personas Desaparecidas
# =============================================================================

import uuid
from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel

from app.models.enums import MissingPersonStatus, PhotoFaceAngle, RelativeRelation


class PersonCreate(BaseModel):
    full_name: str
    disappeared_at: date
    date_of_birth: Optional[date] = None
    age_at_disappearance: Optional[int] = None
    gender: Optional[str] = None
    physical_description: Optional[str] = None
    height_cm: Optional[int] = None
    last_known_clothing: Optional[str] = None
    last_known_location: Optional[str] = None
    last_seen_at: Optional[datetime] = None
    reporter_name: Optional[str] = None
    reporter_contact: Optional[str] = None


class PersonUpdate(BaseModel):
    full_name: Optional[str] = None
    date_of_birth: Optional[date] = None
    age_at_disappearance: Optional[int] = None
    gender: Optional[str] = None
    physical_description: Optional[str] = None
    height_cm: Optional[int] = None
    last_known_clothing: Optional[str] = None
    last_known_location: Optional[str] = None
    last_seen_at: Optional[datetime] = None
    disappeared_at: Optional[date] = None
    status: Optional[MissingPersonStatus] = None
    reporter_name: Optional[str] = None
    reporter_contact: Optional[str] = None
    # Campos de cierre de caso
    found_at: Optional[datetime] = None
    found_by_user_id: Optional[uuid.UUID] = None
    found_in_mission_id: Optional[uuid.UUID] = None
    closure_notes: Optional[str] = None


class PersonResponse(BaseModel):
    id: uuid.UUID
    full_name: str
    disappeared_at: date
    date_of_birth: Optional[date]
    age_at_disappearance: Optional[int]
    gender: Optional[str]
    physical_description: Optional[str]
    height_cm: Optional[int]
    last_known_clothing: Optional[str]
    last_known_location: Optional[str]
    last_seen_at: Optional[datetime]
    status: MissingPersonStatus
    source: str
    reported_by_user_id: Optional[uuid.UUID]
    reporter_name: Optional[str]
    reporter_contact: Optional[str]
    found_at: Optional[datetime]
    found_by_user_id: Optional[uuid.UUID]
    found_in_mission_id: Optional[uuid.UUID]
    closure_notes: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PhotoResponse(BaseModel):
    id: uuid.UUID
    missing_person_id: uuid.UUID
    file_id: uuid.UUID
    face_angle: PhotoFaceAngle
    quality_score: Optional[float]
    has_embedding: bool
    is_active: bool
    uploaded_by: Optional[uuid.UUID]
    created_at: datetime

    model_config = {"from_attributes": True}


class RelativeCreate(BaseModel):
    user_id: uuid.UUID
    relation: RelativeRelation = RelativeRelation.other


class RelativeResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    missing_person_id: uuid.UUID
    relation: RelativeRelation
    verified: bool
    created_at: datetime

    model_config = {"from_attributes": True}

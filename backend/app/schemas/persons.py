# =============================================================================
# AEROFINDER Backend — Schemas Pydantic: Personas Desaparecidas
# =============================================================================

import uuid
from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel

from app.models.enums import MissingPersonStatus, PhotoFaceAngle, RelativeRelation


class PhysicalAttributes(BaseModel):
    """Atributos físicos estructurados de la persona desaparecida."""
    weight_kg: Optional[int] = None
    build: Optional[str] = None                  # delgado/normal/robusto/corpulento
    skin_tone: Optional[str] = None              # muy_claro/claro/medio/moreno/oscuro
    hair_color: Optional[str] = None             # negro/castaño/rubio/pelirrojo/canoso/blanco/calvo
    hair_length: Optional[str] = None            # calvo/muy_corto/corto/mediano/largo
    eye_color: Optional[str] = None              # negros/marrones/verdes/azules/grises/miel
    wears_glasses: Optional[bool] = None
    facial_hair: Optional[str] = None            # ninguno/barba/bigote/barba_y_bigote/incipiente
    distinguishing_marks: Optional[str] = None   # cicatrices, lunares, tatuajes
    clothing_upper: Optional[str] = None
    clothing_lower: Optional[str] = None
    clothing_footwear: Optional[str] = None
    clothing_accessories: Optional[str] = None
    ai_analyzed: bool = False
    ai_confidence: Optional[float] = None


class PersonCreate(BaseModel):
    full_name: str
    disappeared_at: date
    date_of_birth: Optional[date] = None
    age_at_disappearance: Optional[int] = None
    gender: Optional[str] = None
    physical_description: Optional[str] = None
    height_cm: Optional[int] = None
    last_known_clothing: Optional[str] = None
    physical_attributes: Optional[PhysicalAttributes] = None
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
    physical_attributes: Optional[PhysicalAttributes] = None
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
    physical_attributes: Optional[dict] = None
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
    photos_requested_at: Optional[datetime] = None
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


class PersonFamiliarUpdate(BaseModel):
    """Campos que el familiar puede actualizar de su propio reporte."""
    full_name: Optional[str] = None
    age_at_disappearance: Optional[int] = None
    gender: Optional[str] = None
    physical_description: Optional[str] = None
    height_cm: Optional[int] = None
    last_known_clothing: Optional[str] = None
    physical_attributes: Optional[PhysicalAttributes] = None
    last_known_location: Optional[str] = None
    last_seen_at: Optional[datetime] = None
    disappeared_at: Optional[date] = None
    reporter_name: Optional[str] = None
    reporter_contact: Optional[str] = None


class PersonStatusUpdate(BaseModel):
    status: MissingPersonStatus


class PersonReportCreate(BaseModel):
    """Schema para que un familiar reporte un caso (crea person en pending_review)"""
    full_name: str
    disappeared_at: date
    date_of_birth: Optional[date] = None
    age_at_disappearance: Optional[int] = None
    gender: Optional[str] = None
    physical_description: Optional[str] = None
    height_cm: Optional[int] = None
    last_known_location: Optional[str] = None
    last_seen_at: Optional[datetime] = None
    physical_attributes: Optional[PhysicalAttributes] = None

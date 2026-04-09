# =============================================================================
# AEROFINDER Backend — Schemas Pydantic: Misiones y Operaciones de Campo
# =============================================================================

import uuid
from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, field_validator

from app.models.enums import CoverageZoneStatus, MissionEventType, MissionStatus


class MissionCreate(BaseModel):
    name: str
    missing_person_id: uuid.UUID
    lead_user_id: uuid.UUID
    description: Optional[str] = None
    planned_at: Optional[datetime] = None
    notes: Optional[str] = None
    # GeoJSON geometry object: {"type": "Polygon", "coordinates": [...]}
    search_area: Optional[dict] = None


class MissionUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[MissionStatus] = None
    lead_user_id: Optional[uuid.UUID] = None
    planned_at: Optional[datetime] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    notes: Optional[str] = None
    search_area: Optional[dict] = None


class MissionResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: Optional[str]
    missing_person_id: uuid.UUID
    status: MissionStatus
    lead_user_id: uuid.UUID
    planned_at: Optional[datetime]
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    notes: Optional[str]
    # WKT string del polígono; None si no está definida el área
    search_area_wkt: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AssignDroneRequest(BaseModel):
    drone_id: uuid.UUID


class MissionDroneResponse(BaseModel):
    mission_id: uuid.UUID
    drone_id: uuid.UUID
    joined_at: datetime
    left_at: Optional[datetime]

    model_config = {"from_attributes": True}


class WaypointCreate(BaseModel):
    sequence_number: int
    latitude: float
    longitude: float
    altitude_m: Optional[float] = None

    @field_validator("latitude")
    @classmethod
    def validate_lat(cls, v: float) -> float:
        if not -90 <= v <= 90:
            raise ValueError("latitude debe estar entre -90 y 90")
        return v

    @field_validator("longitude")
    @classmethod
    def validate_lon(cls, v: float) -> float:
        if not -180 <= v <= 180:
            raise ValueError("longitude debe estar entre -180 y 180")
        return v


class WaypointResponse(BaseModel):
    id: uuid.UUID
    mission_id: uuid.UUID
    sequence_number: int
    latitude: float
    longitude: float
    altitude_m: Optional[float]
    created_at: datetime

    model_config = {"from_attributes": True}


class MissionEventResponse(BaseModel):
    id: int
    mission_id: uuid.UUID
    event_type: MissionEventType
    drone_id: Optional[uuid.UUID]
    user_id: Optional[uuid.UUID]
    occurred_at: datetime
    payload: dict

    model_config = {"from_attributes": True}


class CoverageZoneResponse(BaseModel):
    id: uuid.UUID
    mission_id: uuid.UUID
    status: CoverageZoneStatus
    drone_id: Optional[uuid.UUID]
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    # WKT del polígono de la zona
    zone_polygon_wkt: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

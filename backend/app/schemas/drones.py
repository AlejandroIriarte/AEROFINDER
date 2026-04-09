# =============================================================================
# AEROFINDER Backend — Schemas Pydantic: Drones y Mantenimiento
# =============================================================================

import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, field_validator

from app.models.enums import DroneStatus, MaintenanceType


class DroneCreate(BaseModel):
    serial_number: str
    model: str
    manufacturer: str = "DJI"
    battery_warning_pct: int = 20
    max_flight_time_minutes: Optional[int] = None
    notes: Optional[str] = None

    @field_validator("battery_warning_pct")
    @classmethod
    def validate_battery_pct(cls, v: int) -> int:
        if not 5 <= v <= 50:
            raise ValueError("battery_warning_pct debe estar entre 5 y 50")
        return v


class DroneUpdate(BaseModel):
    model: Optional[str] = None
    status: Optional[DroneStatus] = None
    battery_warning_pct: Optional[int] = None
    max_flight_time_minutes: Optional[int] = None
    assigned_to_user_id: Optional[uuid.UUID] = None
    notes: Optional[str] = None


class DroneResponse(BaseModel):
    id: uuid.UUID
    serial_number: str
    model: str
    manufacturer: str
    status: DroneStatus
    battery_warning_pct: int
    max_flight_time_minutes: Optional[int]
    assigned_to_user_id: Optional[uuid.UUID]
    notes: Optional[str]
    registered_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class MaintenanceCreate(BaseModel):
    maintenance_type: MaintenanceType
    performed_at: datetime
    flight_hours_at_maintenance: Optional[float] = None
    notes: Optional[str] = None
    next_due_at: Optional[datetime] = None


class MaintenanceResponse(BaseModel):
    id: uuid.UUID
    drone_id: uuid.UUID
    maintenance_type: MaintenanceType
    performed_by: Optional[uuid.UUID]
    performed_at: datetime
    flight_hours_at_maintenance: Optional[float]
    notes: Optional[str]
    next_due_at: Optional[datetime]
    created_at: datetime

    model_config = {"from_attributes": True}

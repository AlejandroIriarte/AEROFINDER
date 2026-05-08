# =============================================================================
# AEROFINDER Backend — Schemas Pydantic: Usuarios
# =============================================================================

import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, field_validator

from app.models.enums import RoleName


class UserCreate(BaseModel):
    email: str
    password: str
    full_name: str
    phone: Optional[str] = None
    role_id: uuid.UUID

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email(cls, v: str) -> str:
        return v.strip().lower()


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    is_active: Optional[bool] = None
    role_id: Optional[uuid.UUID] = None


class UserResponse(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str
    phone: Optional[str]
    role: RoleName
    is_active: bool
    created_at: datetime
    last_login_at: Optional[datetime]

    model_config = {"from_attributes": True}

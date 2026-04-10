# =============================================================================
# AEROFINDER Backend — Schemas Pydantic: Autenticación
# =============================================================================

import uuid
from typing import Optional

from pydantic import BaseModel, field_validator

from app.models.enums import RoleName


class LoginRequest(BaseModel):
    email: str
    password: str

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email(cls, v: str) -> str:
        return v.strip().lower()


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int                      # segundos hasta expiración del access token
    refresh_token: Optional[str] = None  # JWT de refresco (7 días); presente en login


class RefreshTokenRequest(BaseModel):
    refresh_token: str


class UserMeResponse(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str
    role: RoleName
    is_active: bool

    model_config = {"from_attributes": True}

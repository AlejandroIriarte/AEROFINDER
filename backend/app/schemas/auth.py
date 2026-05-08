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


class RegisterRequest(BaseModel):
    email: str
    password: str
    full_name: str
    phone: Optional[str] = None

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email(cls, v: str) -> str:
        return v.strip().lower()

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Contraseña debe tener al menos 8 caracteres")
        if not any(c.isdigit() for c in v):
            raise ValueError("Contraseña debe contener al menos un número")
        if not any(c.isalpha() for c in v):
            raise ValueError("Contraseña debe contener al menos una letra")
        return v

    @field_validator("full_name")
    @classmethod
    def validate_full_name(cls, v: str) -> str:
        if len(v.strip()) < 3:
            raise ValueError("Nombre completo debe tener al menos 3 caracteres")
        return v.strip()


class RegisterResponse(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str
    role: RoleName
    is_active: bool

    model_config = {"from_attributes": True}


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

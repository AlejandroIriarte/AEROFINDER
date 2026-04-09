# =============================================================================
# AEROFINDER Backend — Schemas Pydantic: Endpoints públicos (sin autenticación)
# =============================================================================

from datetime import date, datetime
from typing import Optional
import uuid

from pydantic import BaseModel, EmailStr, field_validator

from app.models.enums import MissingPersonStatus, RelativeRelation


class RescueRequestCreate(BaseModel):
    """
    Formulario público para solicitar la búsqueda de una persona desaparecida.
    No requiere cuenta. El campo account_* es opcional: si se provee email +
    password, se crea una cuenta familiar para hacer seguimiento.
    """
    # ── Datos de la persona desaparecida ──────────────────────────────────────
    full_name: str
    disappeared_at: date
    date_of_birth: Optional[date] = None
    age_at_disappearance: Optional[int] = None
    gender: Optional[str] = None
    physical_description: Optional[str] = None
    last_known_location: Optional[str] = None
    last_seen_at: Optional[datetime] = None

    # ── Datos del familiar que reporta (requeridos para contacto) ─────────────
    reporter_name: str
    reporter_contact: str               # teléfono o correo de contacto
    relation: RelativeRelation = RelativeRelation.other

    # ── Creación opcional de cuenta para seguimiento ──────────────────────────
    account_email: Optional[EmailStr] = None
    account_password: Optional[str] = None
    account_full_name: Optional[str] = None

    @field_validator("account_password")
    @classmethod
    def password_min_length(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and len(v) < 8:
            raise ValueError("La contraseña debe tener al menos 8 caracteres")
        return v


class RescueRequestResponse(BaseModel):
    """Respuesta tras enviar el formulario público."""
    person_id: uuid.UUID
    status: MissingPersonStatus     # siempre pending_review
    account_created: bool           # True si se creó cuenta de familiar
    message: str

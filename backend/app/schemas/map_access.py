# =============================================================================
# AEROFINDER Backend — Schemas: Acceso al mapa de misión
# =============================================================================

import uuid
from datetime import datetime

from pydantic import BaseModel


class MapAccessGrant(BaseModel):
    """Respuesta al consultar o conceder acceso."""
    id: uuid.UUID
    mission_id: uuid.UUID
    user_id: uuid.UUID
    granted_by: uuid.UUID | None
    granted_at: datetime
    # Campos expandidos del usuario autorizado
    user_full_name: str
    user_role: str

    model_config = {"from_attributes": True}


class MapAccessGrantRequest(BaseModel):
    """Body para conceder acceso: solo se necesita el user_id."""
    user_id: uuid.UUID

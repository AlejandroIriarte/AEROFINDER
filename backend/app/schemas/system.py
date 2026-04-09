# =============================================================================
# AEROFINDER Backend — Schemas Pydantic: Configuración Dinámica del Sistema
# =============================================================================

import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel

from app.models.enums import ConfigValueType


class ConfigResponse(BaseModel):
    id: uuid.UUID
    config_key: str
    value_text: str
    value_type: ConfigValueType
    description: Optional[str]
    min_value: Optional[str]
    max_value: Optional[str]
    updated_by: Optional[uuid.UUID]
    updated_at: datetime

    model_config = {"from_attributes": True}


class ConfigUpdate(BaseModel):
    """
    Solo value_text es mutable desde la API.
    La validación de rango (min_value/max_value) se hace aquí si los límites
    se conocen en tiempo de actualización; de lo contrario se delega a la DB.
    """
    value_text: str

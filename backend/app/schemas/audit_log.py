# =============================================================================
# AEROFINDER Backend — Schemas Pydantic: Auditoría
# =============================================================================

import uuid
from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field

from app.models.enums import AuditOperation


class AuditLogResponse(BaseModel):
    id: int
    table_name: str
    record_id: str
    operation: AuditOperation
    changed_by: Optional[uuid.UUID] = None
    session_id: Optional[uuid.UUID] = None
    changed_at: datetime
    # El modelo ORM usa old_values/new_values; el frontend espera old_data/new_data
    old_data: Optional[dict[str, Any]] = Field(None, alias="old_values")
    new_data: Optional[dict[str, Any]] = Field(None, alias="new_values")

    model_config = {"from_attributes": True, "populate_by_name": True}

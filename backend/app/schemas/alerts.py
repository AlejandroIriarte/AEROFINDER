# =============================================================================
# AEROFINDER Backend — Schemas Pydantic: Alertas y Cola de Notificaciones
# =============================================================================

import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel

from app.models.enums import AlertContentLevel, AlertStatus, NotificationChannel, NotificationDeliveryStatus


class AlertResponse(BaseModel):
    id: uuid.UUID
    detection_id: uuid.UUID
    recipient_user_id: Optional[uuid.UUID]
    content_level: AlertContentLevel
    status: AlertStatus
    message_text: Optional[str]
    generated_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AlertStatusUpdate(BaseModel):
    """Para que el destinatario confirme o descarte una alerta."""
    status: AlertStatus


class NotificationQueueResponse(BaseModel):
    id: uuid.UUID
    alert_id: uuid.UUID
    channel: NotificationChannel
    status: NotificationDeliveryStatus
    attempts: int
    next_retry_at: Optional[datetime]
    last_error: Optional[str]
    sent_at: Optional[datetime]
    delivered_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

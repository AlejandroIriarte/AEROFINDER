# =============================================================================
# AEROFINDER Backend — Modelos ORM: Dominio 10 — Configuración Dinámica
# Tabla: system_config
# =============================================================================

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, UUIDPrimaryKeyMixin
from app.models.enums import ConfigValueType, SAConfigValueType


class SystemConfig(Base, UUIDPrimaryKeyMixin):
    """
    Parámetros del sistema editables en caliente sin redesplegar workers de IA.
    El backend cachea en Redis con TTL de 30s; los cambios se propagan en ≤ 30s.

    REGLA: todos los umbrales de IA se leen de aquí, nunca de os.getenv().
    Ejemplos de claves:
      yolo.confidence_threshold    (float, 0.0–1.0)
      facenet.similarity_threshold (float, 0.0–1.0)
      yolo.frame_skip              (integer, 1–30)
      drone.telemetry_timeout_sec  (integer)
      notification.max_retries     (integer)
    """
    __tablename__ = "system_config"

    config_key: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    value_text: Mapped[str] = mapped_column(Text, nullable=False)
    value_type: Mapped[ConfigValueType] = mapped_column(
        SAConfigValueType, nullable=False, server_default="string"
    )
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Límites como string; el cast se hace según value_type en la capa de aplicación
    min_value: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    max_value: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    updated_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("NOW()")
    )

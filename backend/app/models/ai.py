# =============================================================================
# AEROFINDER Backend — Modelos ORM: Dominio 3 — Modelos de IA y Embeddings
# Tablas: ai_models, face_embeddings
# =============================================================================

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, SmallInteger, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from pgvector.sqlalchemy import Vector

from app.db.base import Base, CreatedAtMixin, UUIDPrimaryKeyMixin
from app.models.enums import AIModelType, SAAIModelType


class AIModel(Base, UUIDPrimaryKeyMixin, CreatedAtMixin):
    """
    Catálogo de modelos de IA desplegados en el sistema.
    embedding_dim NULL para modelos de detección (YOLO no produce embeddings).
    Permite múltiples modelos activos simultáneamente durante una migración de modelo.
    """
    __tablename__ = "ai_models"

    name: Mapped[str] = mapped_column(Text, nullable=False)
    model_type: Mapped[AIModelType] = mapped_column(SAAIModelType, nullable=False)
    version: Mapped[str] = mapped_column(Text, nullable=False)
    # NULL para modelos de detección de objetos; positivo para modelos de reconocimiento facial
    embedding_dim: Mapped[Optional[int]] = mapped_column(SmallInteger, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("FALSE"))
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    deployed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    deprecated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


class FaceEmbedding(Base, UUIDPrimaryKeyMixin, CreatedAtMixin):
    """
    Embedding facial de una foto de referencia generado por InsightFace buffalo_l.
    Vinculado al modelo que lo generó para poder recalcular al migrar de modelo.
    vector(512) corresponde a la dimensión de InsightFace buffalo_l.
    """
    __tablename__ = "face_embeddings"

    photo_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("person_photos.id", ondelete="CASCADE"),
        nullable=False,
    )
    model_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("ai_models.id", ondelete="RESTRICT"),
        nullable=False,
    )
    # Vector de 512 dimensiones (InsightFace buffalo_l)
    embedding: Mapped[list] = mapped_column(Vector(512), nullable=False)

# =============================================================================
# AEROFINDER Backend — Modelos ORM: Dominio 7 — Archivos (MinIO)
# Tabla: files
# Definida antes de person_photos, detections y video_recordings que la referencian
# =============================================================================

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, UUIDPrimaryKeyMixin
from app.models.enums import (
    FileRetentionPolicy,
    FileUploadStatus,
    SAFileRetentionPolicy,
    SAFileUploadStatus,
)


class File(Base, UUIDPrimaryKeyMixin):
    """
    Catálogo centralizado de todos los archivos almacenados en MinIO.
    sha256_hash permite deduplicación. La fila se conserva tras eliminar el objeto
    (deleted_at != NULL) para mantener el historial de auditoría.
    """
    __tablename__ = "files"

    bucket: Mapped[str] = mapped_column(Text, nullable=False)
    object_key: Mapped[str] = mapped_column(Text, nullable=False)
    sha256_hash: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    mime_type: Mapped[str] = mapped_column(Text, nullable=False)
    # Solo para videos; NULL en imágenes
    duration_seconds: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    retention_policy: Mapped[FileRetentionPolicy] = mapped_column(
        SAFileRetentionPolicy,
        nullable=False,
        server_default="permanent",
    )
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    upload_status: Mapped[FileUploadStatus] = mapped_column(
        SAFileUploadStatus,
        nullable=False,
        server_default="pending",
    )
    uploaded_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("NOW()")
    )
    # Fecha de eliminación en MinIO (fila se conserva para auditoría)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

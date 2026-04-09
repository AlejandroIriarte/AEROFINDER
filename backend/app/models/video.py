# =============================================================================
# AEROFINDER Backend — Modelos ORM: Dominio 8 — Grabaciones de Video
# Tabla: video_recordings
# =============================================================================

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, SmallInteger, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, CreatedAtMixin, UUIDPrimaryKeyMixin


class VideoRecording(Base, UUIDPrimaryKeyMixin, CreatedAtMixin):
    """
    Segmento de video continuo generado por MediaMTX (servidor RTMP/HLS).
    Un stream que se corta y reconecta genera múltiples segmentos en la misma misión.
    segment_index ordena cronológicamente y permite detectar huecos temporales.
    file_id es NULL mientras el segmento está siendo grabado (aún no subido a MinIO).
    """
    __tablename__ = "video_recordings"

    mission_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("missions.id", ondelete="RESTRICT"),
        nullable=False,
    )
    drone_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("drones.id", ondelete="RESTRICT"),
        nullable=False,
    )
    # NULL mientras el segmento está en grabación; se setea al completar la subida a MinIO
    file_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("files.id", ondelete="RESTRICT"),
        nullable=True,
    )
    segment_index: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    rtmp_session_id: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    stream_started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    stream_ended_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_seconds: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

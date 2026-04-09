# =============================================================================
# AEROFINDER Backend — Modelos ORM: Dominio 6 — Pipeline IA (Detecciones y Alertas)
# Tablas: detections, detection_reviews, alerts, notification_queue
# =============================================================================

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import BigInteger, Boolean, DateTime, Double, Float, ForeignKey, SmallInteger, Text, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column
from geoalchemy2 import Geometry
from pgvector.sqlalchemy import Vector

from app.db.base import Base, CreatedAtMixin, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import (
    AlertContentLevel,
    AlertStatus,
    DetectionVerdict,
    NotificationChannel,
    NotificationDeliveryStatus,
    SAAlertContentLevel,
    SAAlertStatus,
    SADetectionVerdict,
    SANotificationChannel,
    SANotificationDeliveryStatus,
)


class Detection(Base, UUIDPrimaryKeyMixin, CreatedAtMixin):
    """
    Hecho técnico inmutable generado por el worker de IA.
    gps_location: columna PostGIS derivada de gps_lat/lon por trigger en DB-3.
    detection_embedding: vector del rostro detectado para análisis forense.
    Vincula dos modelos de IA: YOLO (detección) e InsightFace (reconocimiento facial).
    """
    __tablename__ = "detections"

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
    video_recording_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("video_recordings.id", ondelete="SET NULL"),
        nullable=True,
    )
    missing_person_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("missing_persons.id", ondelete="RESTRICT"),
        nullable=False,
    )
    # Modelo YOLO que realizó la detección de persona
    detection_model_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("ai_models.id", ondelete="RESTRICT"),
        nullable=False,
    )
    # Modelo InsightFace que realizó el reconocimiento facial
    recognition_model_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("ai_models.id", ondelete="RESTRICT"),
        nullable=False,
    )
    frame_timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    frame_number: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    yolo_confidence: Mapped[float] = mapped_column(Float, nullable=False)
    facenet_similarity: Mapped[float] = mapped_column(Float, nullable=False)
    # Bounding box del rostro: {x, y, width, height} en píxeles
    bounding_box: Mapped[dict] = mapped_column(JSONB, nullable=False)
    gps_latitude: Mapped[Optional[float]] = mapped_column(Double(precision=53), nullable=True)
    gps_longitude: Mapped[Optional[float]] = mapped_column(Double(precision=53), nullable=True)
    # Punto PostGIS generado por trigger en DB-3 a partir de gps_lat/lon
    gps_location: Mapped[Optional[object]] = mapped_column(
        Geometry("POINT", srid=4326), nullable=True
    )
    snapshot_file_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("files.id", ondelete="SET NULL"),
        nullable=True,
    )
    # Vector del rostro detectado para análisis forense y reentrenamiento
    detection_embedding: Mapped[Optional[list]] = mapped_column(Vector(512), nullable=True)
    is_reviewed: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("FALSE"))


class DetectionReview(Base, UUIDPrimaryKeyMixin, CreatedAtMixin):
    """
    Revisión humana de una detección por un operador.
    Inmutable: una revisión no se modifica; si cambia el juicio, se agrega una nueva fila.
    """
    __tablename__ = "detection_reviews"

    detection_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("detections.id", ondelete="CASCADE"),
        nullable=False,
    )
    reviewed_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )
    verdict: Mapped[DetectionVerdict] = mapped_column(SADetectionVerdict, nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    reviewed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("NOW()")
    )


class Alert(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """
    Decisión de negocio de notificar a un usuario específico sobre una detección.
    content_level determina qué información sensible se incluye según el rol:
      buscador  → full (con GPS)
      ayudante  → partial (sin GPS)
      familiar  → confirmation_only (foto recortada, sin ubicación)
    """
    __tablename__ = "alerts"

    detection_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("detections.id", ondelete="RESTRICT"),
        nullable=False,
    )
    recipient_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    content_level: Mapped[AlertContentLevel] = mapped_column(SAAlertContentLevel, nullable=False)
    status: Mapped[AlertStatus] = mapped_column(
        SAAlertStatus, nullable=False, server_default="generated"
    )
    message_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("NOW()")
    )


class NotificationQueue(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """
    Cola de entrega de alertas por canal con soporte de reintentos con backoff exponencial.
    El worker consulta: WHERE status = 'pending' AND next_retry_at <= NOW()
    Una alerta puede tener múltiples filas si el usuario tiene push + email + sms activos.
    """
    __tablename__ = "notification_queue"

    alert_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("alerts.id", ondelete="CASCADE"),
        nullable=False,
    )
    channel: Mapped[NotificationChannel] = mapped_column(SANotificationChannel, nullable=False)
    status: Mapped[NotificationDeliveryStatus] = mapped_column(
        SANotificationDeliveryStatus, nullable=False, server_default="pending"
    )
    attempts: Mapped[int] = mapped_column(SmallInteger, nullable=False, server_default=text("0"))
    next_retry_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    last_error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    delivered_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

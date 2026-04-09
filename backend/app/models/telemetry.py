# =============================================================================
# AEROFINDER Backend — Modelos ORM: Dominio 9 — Telemetría GPS
# Tablas: drone_telemetry_raw (particionada), drone_telemetry_summary
# =============================================================================

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import BigInteger, Boolean, DateTime, Double, Float, ForeignKey, SmallInteger, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, CreatedAtMixin, UUIDPrimaryKeyMixin


class DroneTelemetryRaw(Base):
    """
    Telemetría raw a 10 Hz — tabla particionada por rango de fecha (recorded_at).
    PK compuesta (id, recorded_at) requerida por particionado de PostgreSQL.
    Volumen estimado: 72.000 filas/dron por misión de 2 horas.
    FK a drones y missions omitidas intencionalmente para maximizar throughput de INSERT;
    la integridad referencial se garantiza en la capa de aplicación.
    """
    __tablename__ = "drone_telemetry_raw"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    drone_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    mission_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    # PK compuesta para soporte de particionado por RANGE(recorded_at)
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), primary_key=True, nullable=False
    )
    latitude: Mapped[float] = mapped_column(Double(precision=53), nullable=False)
    longitude: Mapped[float] = mapped_column(Double(precision=53), nullable=False)
    altitude_m: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    battery_pct: Mapped[Optional[int]] = mapped_column(SmallInteger, nullable=True)
    heading_deg: Mapped[Optional[int]] = mapped_column(SmallInteger, nullable=True)
    speed_mps: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    gps_accuracy_m: Mapped[Optional[float]] = mapped_column(Float, nullable=True)


class DroneTelemetrySummary(Base, UUIDPrimaryKeyMixin, CreatedAtMixin):
    """
    Puntos de inflexión de la ruta volada — retención permanente.
    Generados post-misión por el algoritmo Ramer-Douglas-Peucker.
    Permiten visualizar la ruta histórica en el mapa sin cargar los 72.000 puntos raw.
    """
    __tablename__ = "drone_telemetry_summary"

    drone_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("drones.id", ondelete="RESTRICT"),
        nullable=False,
    )
    mission_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("missions.id", ondelete="RESTRICT"),
        nullable=False,
    )
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    latitude: Mapped[float] = mapped_column(Double(precision=53), nullable=False)
    longitude: Mapped[float] = mapped_column(Double(precision=53), nullable=False)
    altitude_m: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    battery_pct: Mapped[Optional[int]] = mapped_column(SmallInteger, nullable=True)
    is_inflection_point: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("FALSE")
    )

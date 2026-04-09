# =============================================================================
# AEROFINDER Backend — Modelos ORM: Dominio 4 — Drones y Mantenimiento
# Tablas: drones, drone_maintenance_logs
# =============================================================================

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Float, ForeignKey, SmallInteger, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, CreatedAtMixin, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import DroneStatus, MaintenanceType, SADroneStatus, SAMaintenanceType


class Drone(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """
    Catálogo de drones con estado operacional en tiempo real.
    battery_warning_pct: umbral que dispara la alerta de batería baja durante el vuelo.
    El campo se consulta desde system_config; este columna es el valor por-dron.
    """
    __tablename__ = "drones"

    serial_number: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    model: Mapped[str] = mapped_column(Text, nullable=False)
    manufacturer: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'DJI'"))
    status: Mapped[DroneStatus] = mapped_column(
        SADroneStatus, nullable=False, server_default="available"
    )
    # Porcentaje de batería que dispara la alerta; CHECK (5..50) en la DB
    battery_warning_pct: Mapped[int] = mapped_column(
        SmallInteger, nullable=False, server_default=text("20")
    )
    max_flight_time_minutes: Mapped[Optional[int]] = mapped_column(SmallInteger, nullable=True)
    assigned_to_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    registered_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("NOW()")
    )


class DroneMaintenanceLog(Base, UUIDPrimaryKeyMixin, CreatedAtMixin):
    """
    Historial de mantenimiento técnico del dron.
    Requerido por regulaciones de aviación no tripulada (DGAC, ANAC, FAA, etc.).
    flight_hours_at_maintenance permite calcular cuándo corresponde el próximo servicio.
    """
    __tablename__ = "drone_maintenance_logs"

    drone_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("drones.id", ondelete="RESTRICT"),
        nullable=False,
    )
    maintenance_type: Mapped[MaintenanceType] = mapped_column(SAMaintenanceType, nullable=False)
    performed_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    performed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    flight_hours_at_maintenance: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    next_due_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

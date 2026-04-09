# =============================================================================
# AEROFINDER Backend — Modelos ORM: Dominio 5 — Misiones y Operaciones de Campo
# Tablas: missions, mission_drones, mission_events, mission_coverage_zones, mission_waypoints
# =============================================================================

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import BigInteger, DateTime, Double, Float, ForeignKey, SmallInteger, Text, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column
from geoalchemy2 import Geometry

from app.db.base import Base, CreatedAtMixin, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import (
    CoverageZoneStatus,
    MissionEventType,
    MissionStatus,
    SACoverageZoneStatus,
    SAMissionEventType,
    SAMissionStatus,
)


class Mission(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """
    Objeto central de la operación: conecta persona buscada, drones, GPS, video y alertas.
    search_area: polígono PostGIS en SRID 4326 (WGS84) del área de búsqueda asignada.
    Tiene dependencia circular con missing_persons (found_in_mission_id); resuelta con
    use_alter=True en el modelo MissingPerson.
    """
    __tablename__ = "missions"

    name: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    missing_person_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("missing_persons.id", ondelete="RESTRICT"),
        nullable=False,
    )
    status: Mapped[MissionStatus] = mapped_column(
        SAMissionStatus, nullable=False, server_default="planned"
    )
    # Polígono del área de búsqueda (PostGIS, SRID 4326)
    search_area: Mapped[Optional[object]] = mapped_column(
        Geometry("POLYGON", srid=4326), nullable=True
    )
    lead_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )
    planned_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


class MissionDrone(Base):
    """
    Tabla de asociación M:N entre misiones y drones.
    Un dron puede participar en varias misiones; una misión puede tener múltiples drones.
    left_at NULL indica que el dron aún está activo en la misión.
    """
    __tablename__ = "mission_drones"

    mission_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("missions.id", ondelete="CASCADE"),
        primary_key=True,
        nullable=False,
    )
    drone_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("drones.id", ondelete="RESTRICT"),
        primary_key=True,
        nullable=False,
    )
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("NOW()")
    )
    left_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


class MissionEvent(Base):
    """
    Log estructurado e inmutable de todos los eventos durante la misión.
    PK BIGSERIAL: alta tasa de inserción, sin updates.
    payload JSONB varía según event_type; ver comentarios en 03_tables.sql.
    """
    __tablename__ = "mission_events"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    mission_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("missions.id", ondelete="CASCADE"),
        nullable=False,
    )
    event_type: Mapped[MissionEventType] = mapped_column(SAMissionEventType, nullable=False)
    drone_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("drones.id", ondelete="SET NULL"),
        nullable=True,
    )
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("NOW()")
    )
    # Payload flexible por tipo de evento: {altitude_m, battery_pct}, {detection_id, ...}, etc.
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))


class MissionCoverageZone(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """
    Sub-zona del área de búsqueda con estado de cobertura.
    Permite al operador visualizar en el mapa qué áreas ya fueron escaneadas.
    """
    __tablename__ = "mission_coverage_zones"

    mission_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("missions.id", ondelete="CASCADE"),
        nullable=False,
    )
    # Polígono de la sub-zona (PostGIS, SRID 4326)
    zone_polygon: Mapped[object] = mapped_column(
        Geometry("POLYGON", srid=4326), nullable=False
    )
    status: Mapped[CoverageZoneStatus] = mapped_column(
        SACoverageZoneStatus, nullable=False, server_default="pending"
    )
    drone_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("drones.id", ondelete="SET NULL"),
        nullable=True,
    )
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


class MissionWaypoint(Base, UUIDPrimaryKeyMixin, CreatedAtMixin):
    """
    Plan de vuelo previo al despegue: waypoints ordenados con altitud planeada.
    La ruta intención; la ruta real se reconstruye desde drone_telemetry_raw.
    UNIQUE (mission_id, sequence_number) garantiza el orden sin huecos.
    """
    __tablename__ = "mission_waypoints"

    mission_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("missions.id", ondelete="CASCADE"),
        nullable=False,
    )
    sequence_number: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    latitude: Mapped[float] = mapped_column(Double(precision=53), nullable=False)
    longitude: Mapped[float] = mapped_column(Double(precision=53), nullable=False)
    altitude_m: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

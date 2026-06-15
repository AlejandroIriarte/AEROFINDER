# =============================================================================
# AEROFINDER Backend — Modelo ORM: Acceso de usuarios al mapa de misión
# Tabla: mission_map_access
# admin concede acceso permanente (por misión) a ayudantes y familiares
# =============================================================================

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class MissionMapAccess(Base):
    """
    Concede a un usuario (ayudante o familiar) acceso al mapa de una misión.
    UNIQUE (mission_id, user_id) previene duplicados.
    """
    __tablename__ = "mission_map_access"
    __table_args__ = (
        UniqueConstraint("mission_id", "user_id", name="uq_map_access_mission_user"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
    )
    mission_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("missions.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    granted_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    granted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("NOW()"),
    )

# =============================================================================
# AEROFINDER Backend — Modelos ORM: Dominio 2 — Personas Desaparecidas
# Tablas: missing_persons, person_photos, person_relatives
# =============================================================================

import uuid
from datetime import date, datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Date, Float, ForeignKey, SmallInteger, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, CreatedAtMixin, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import (
    MissingPersonStatus,
    PhotoFaceAngle,
    RelativeRelation,
    SAMissingPersonStatus,
    SAPhotoFaceAngle,
    SARelativeRelation,
)


class MissingPerson(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """
    Caso de persona desaparecida con ciclo de vida completo.
    found_in_mission_id tiene FK diferida (use_alter=True) porque crea una
    dependencia circular con missions: missions.missing_person_id → missing_persons
    y missing_persons.found_in_mission_id → missions.
    """
    __tablename__ = "missing_persons"

    full_name: Mapped[str] = mapped_column(Text, nullable=False)
    date_of_birth: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    age_at_disappearance: Mapped[Optional[int]] = mapped_column(SmallInteger, nullable=True)
    gender: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    physical_description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    last_known_location: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    last_seen_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    disappeared_at: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[MissingPersonStatus] = mapped_column(
        SAMissingPersonStatus,
        nullable=False,
        server_default="active",
    )

    # Reportante: usuario del sistema o persona externa sin cuenta
    reported_by_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    reporter_name: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    reporter_contact: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Datos de cierre (NULL mientras el caso está activo)
    found_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    found_by_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    # FK diferida: use_alter=True para resolver la dependencia circular con missions
    found_in_mission_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(
            "missions.id",
            ondelete="SET NULL",
            use_alter=True,
            name="fk_missing_persons_found_in_mission",
        ),
        nullable=True,
    )
    closure_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


class PersonPhoto(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """
    Foto de referencia de la persona desaparecida.
    has_embedding se pone TRUE por trigger al insertar en face_embeddings.
    """
    __tablename__ = "person_photos"

    missing_person_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("missing_persons.id", ondelete="RESTRICT"),
        nullable=False,
    )
    file_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("files.id", ondelete="RESTRICT"),
        nullable=False,
    )
    face_angle: Mapped[PhotoFaceAngle] = mapped_column(
        SAPhotoFaceAngle,
        nullable=False,
        server_default="unknown",
    )
    quality_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    has_embedding: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("FALSE"))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("TRUE"))
    uploaded_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )


class PersonRelative(Base, UUIDPrimaryKeyMixin, CreatedAtMixin):
    """
    Vínculo entre usuario (rol familiar) y la persona que busca.
    Determina qué alertas recibe el familiar y con qué nivel de contenido.
    """
    __tablename__ = "person_relatives"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    missing_person_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("missing_persons.id", ondelete="CASCADE"),
        nullable=False,
    )
    relation: Mapped[RelativeRelation] = mapped_column(
        SARelativeRelation,
        nullable=False,
        server_default="other",
    )
    verified: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("FALSE"))

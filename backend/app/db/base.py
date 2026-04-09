# =============================================================================
# AEROFINDER Backend — Base declarativa y mixins de SQLAlchemy 2.0
# =============================================================================

import uuid
from datetime import datetime

from sqlalchemy import DateTime, text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy import Uuid


class Base(DeclarativeBase):
    """Clase base de todos los modelos ORM del proyecto."""
    pass


class UUIDPrimaryKeyMixin:
    """
    Columna `id` UUID generada por PostgreSQL vía gen_random_uuid().
    Reutilizable en todas las tablas con PK de tipo UUID.
    """
    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )


class TimestampMixin:
    """
    Columnas `created_at` y `updated_at`.
    `updated_at` se mantiene con el trigger fn_set_updated_at() en la DB.
    """
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("NOW()"),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("NOW()"),
    )


class CreatedAtMixin:
    """
    Solo columna `created_at`.
    Para tablas inmutables (log entries, embeddings, etc.)
    """
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("NOW()"),
    )

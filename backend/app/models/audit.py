# =============================================================================
# AEROFINDER Backend — Modelos ORM: Dominio 11 — Auditoría Legal
# Tablas: audit_log, data_access_log
# =============================================================================

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import BigInteger, DateTime, ForeignKey, Text, text
from sqlalchemy.dialects.postgresql import INET, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import (
    AuditOperation,
    SAAuditOperation,
    SASensitiveAccessAction,
    SASensitiveResourceType,
    SensitiveAccessAction,
    SensitiveResourceType,
)


class AuditLog(Base):
    """
    Log inmutable de mutaciones de estado del sistema.
    Poblado exclusivamente por triggers en DB-3 para que no pueda saltarse
    desde la capa de aplicación.
    old_values NULL en INSERT; new_values NULL en DELETE.
    session_id permite correlacionar cambios con la sesión específica del usuario.
    """
    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    table_name: Mapped[str] = mapped_column(Text, nullable=False)
    record_id: Mapped[str] = mapped_column(Text, nullable=False)
    operation: Mapped[AuditOperation] = mapped_column(SAAuditOperation, nullable=False)
    changed_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    session_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("user_sessions.id", ondelete="SET NULL"),
        nullable=True,
    )
    changed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("NOW()")
    )
    # NULL en INSERT (no hay old_values); NULL en DELETE (no hay new_values)
    old_values: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    new_values: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)


class DataAccessLog(Base):
    """
    Log de accesos a datos sensibles (lecturas, no mutaciones).
    Responde en un proceso judicial: ¿quién vio las coordenadas GPS y cuándo?
    Datos auditados: coords GPS, fotos de personas, embeddings, trazados de misión.
    """
    __tablename__ = "data_access_log"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    session_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("user_sessions.id", ondelete="SET NULL"),
        nullable=True,
    )
    resource_type: Mapped[SensitiveResourceType] = mapped_column(
        SASensitiveResourceType, nullable=False
    )
    # ID del recurso accedido como string (UUID, int, etc.)
    resource_id: Mapped[str] = mapped_column(Text, nullable=False)
    action: Mapped[SensitiveAccessAction] = mapped_column(SASensitiveAccessAction, nullable=False)
    ip_address: Mapped[Optional[str]] = mapped_column(INET, nullable=True)
    accessed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("NOW()")
    )

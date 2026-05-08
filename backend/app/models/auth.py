# =============================================================================
# AEROFINDER Backend — Modelos ORM: Dominio 1 — Autenticación y Sesiones
# Tablas: roles, users, user_sessions, login_attempts, notification_preferences
# =============================================================================

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    String,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import INET, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, CreatedAtMixin, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import (
    NotificationChannel,
    RoleName,
    SANotificationChannel,
    SARoleName,
)


class Role(Base, UUIDPrimaryKeyMixin, CreatedAtMixin):
    """
    Catálogo inmutable de roles del sistema.
    Los valores se insertan en 08_seeds.sql; no se crean desde la API.
    """
    __tablename__ = "roles"

    name: Mapped[RoleName] = mapped_column(SARoleName, nullable=False, unique=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


class User(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Usuario del sistema con exactamente un rol."""
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    full_name: Mapped[str] = mapped_column(Text, nullable=False)
    phone: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    role_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("roles.id", ondelete="RESTRICT"),
        nullable=False,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("TRUE"))
    last_login_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


class UserSession(Base, UUIDPrimaryKeyMixin):
    """
    Token JWT emitido. Permite revocar sesiones individuales sin afectar otras.
    El backend verifica is_revoked en cada request protegido usando el jti del JWT.
    """
    __tablename__ = "user_sessions"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    jti: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        nullable=False,
        unique=True,
        server_default=text("gen_random_uuid()"),
    )
    device_name: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ip_address: Mapped[str] = mapped_column(INET, nullable=False)
    user_agent: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    issued_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("NOW()")
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    is_revoked: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("FALSE"))


class LoginAttempt(Base):
    """
    Registro de intentos de login para rate-limiting y detección de fuerza bruta.
    PK BIGSERIAL: alta inserción, sin updates.
    """
    __tablename__ = "login_attempts"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    email_attempted: Mapped[str] = mapped_column(Text, nullable=False)
    ip_address: Mapped[str] = mapped_column(INET, nullable=False)
    user_agent: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    success: Mapped[bool] = mapped_column(Boolean, nullable=False)
    failure_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    attempted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("NOW()")
    )


class NotificationPreference(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Canal de notificación preferido por usuario con dirección de entrega."""
    __tablename__ = "notification_preferences"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    channel: Mapped[NotificationChannel] = mapped_column(SANotificationChannel, nullable=False)
    is_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("TRUE"))
    endpoint_address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

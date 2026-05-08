# =============================================================================
# AEROFINDER Backend — Modelos ORM: Dominio 12 — Consentimiento y Cumplimiento
# Tabla: legal_consents
# =============================================================================

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Text, text
from sqlalchemy.dialects.postgresql import INET, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, UUIDPrimaryKeyMixin
from app.models.enums import ConsentType, SAConsentType


class LegalConsent(Base, UUIDPrimaryKeyMixin):
    """
    Registro inmutable de consentimientos legales por usuario.
    document_hash: SHA256 del texto exacto aceptado; garantiza que el documento
    no fue modificado retroactivamente después de la aceptación.
    revoked_at: derecho al olvido; su presencia dispara el proceso de borrado
    de datos biométricos (embeddings faciales) del usuario.
    """
    __tablename__ = "legal_consents"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )
    consent_type: Mapped[ConsentType] = mapped_column(SAConsentType, nullable=False)
    document_version: Mapped[str] = mapped_column(Text, nullable=False)
    # SHA256 del texto exacto del documento aceptado
    document_hash: Mapped[str] = mapped_column(Text, nullable=False)
    accepted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("NOW()")
    )
    ip_address: Mapped[str] = mapped_column(INET, nullable=False)
    user_agent: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Ejercicio del derecho al olvido; dispara borrado de datos biométricos
    revoked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

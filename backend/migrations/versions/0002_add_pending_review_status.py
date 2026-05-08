"""Añadir pending_review al enum missing_person_status

Revision ID: 0002
Revises: 0001
Create Date: 2026-04-08

Agrega el valor pending_review al tipo ENUM de PostgreSQL.
Los casos creados por un familiar arrancan en este estado hasta que
un admin o ayudante los apruebe (lo activa como caso real).

Nota: PostgreSQL no permite eliminar valores de un ENUM, por lo que
downgrade() no puede revertir este cambio.
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # IF NOT EXISTS disponible desde PostgreSQL 9.6 — seguro en re-ejecuciones
    op.execute("ALTER TYPE missing_person_status ADD VALUE IF NOT EXISTS 'pending_review'")


def downgrade() -> None:
    # PostgreSQL no soporta DROP VALUE en ENUMs; se documenta el motivo
    raise NotImplementedError(
        "PostgreSQL no permite eliminar valores de un ENUM. "
        "Para revertir, recrear el tipo manualmente sin 'pending_review'."
    )

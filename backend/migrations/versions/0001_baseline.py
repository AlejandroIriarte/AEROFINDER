"""Baseline — esquema inicial creado por scripts SQL raw

Revision ID: 0001
Revises:
Create Date: 2026-04-08

Esta migración representa el estado inicial de la BD creado por los scripts
SQL de la sesión DB-1..DB-4. No emite DDL propio; sirve solo como punto de
partida para el historial de Alembic.

Para bases de datos existentes ejecutar:
    alembic stamp 0001
Luego aplicar las migraciones siguientes:
    alembic upgrade head
"""
from typing import Sequence, Union

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass

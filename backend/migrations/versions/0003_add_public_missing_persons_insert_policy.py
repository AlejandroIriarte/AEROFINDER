"""Agregar política RLS para permitir inserción pública en missing_persons

Revision ID: 0003
Revises: 0002
Create Date: 2026-04-12

El endpoint POST /public/rescue-requests inserta personas desaparecidas sin
autenticación. La política missing_persons_write_staff (FOR ALL) exige
fn_current_app_user_role() IN ('admin', 'buscador'), bloqueando el INSERT.

Se agrega una política permisiva que permite insertar filas con
status='pending_review' sin importar el rol, lo que cubre exactamente
el caso de uso del formulario público.
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        CREATE POLICY missing_persons_insert_public_request
            ON missing_persons
            FOR INSERT
            TO aerofinder_app
            WITH CHECK (status = 'pending_review')
        """
    )


def downgrade() -> None:
    op.execute(
        "DROP POLICY IF EXISTS missing_persons_insert_public_request ON missing_persons"
    )

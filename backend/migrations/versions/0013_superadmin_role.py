"""add super_admin role

Revision ID: 0013
Revises: 0012
Create Date: 2026-05-24
"""
from alembic import op

revision = '0013'
down_revision = '0012'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ALTER TYPE ADD VALUE no puede usarse con el nuevo valor en la misma transacción.
    # Se ejecuta en bloque autocommit para que el COMMIT suceda antes del INSERT.
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE role_name ADD VALUE IF NOT EXISTS 'super_admin'")

    op.execute("""
        INSERT INTO roles (id, name, description, created_at)
        VALUES (gen_random_uuid(), 'super_admin',
                'Super administrador — control total del sistema e infraestructura',
                NOW())
        ON CONFLICT (name) DO NOTHING
    """)


def downgrade() -> None:
    # PostgreSQL no soporta DROP VALUE de un enum.
    # Solo eliminar la fila de roles; el valor del enum queda (inofensivo si no hay usuarios con ese rol).
    op.execute("DELETE FROM roles WHERE name = 'super_admin'")

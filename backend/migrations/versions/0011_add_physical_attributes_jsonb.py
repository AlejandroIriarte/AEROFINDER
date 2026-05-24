"""Add physical_attributes JSONB to missing_persons

Almacena atributos físicos estructurados (complexión, tono de piel, color de cabello,
ropa, etc.) en un campo JSONB flexible. Evita múltiples columnas escalares y permite
agregar nuevos campos sin migraciones futuras.

Revision ID: 0011
Revises: 0010
Create Date: 2026-05-24
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "missing_persons",
        sa.Column("physical_attributes", JSONB, nullable=True),
    )


def downgrade() -> None:
    op.drop_column("missing_persons", "physical_attributes")

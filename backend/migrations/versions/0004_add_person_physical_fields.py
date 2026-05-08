"""Agregar campos físicos y source a missing_persons

Revision ID: 0004
Revises: 0003
Create Date: 2026-04-12

Añade:
  height_cm            SMALLINT  — estatura en cm (opcional)
  last_known_clothing  TEXT      — descripción de ropa al momento de desaparecer
  source               TEXT      — origen del registro: manual | public_form | gov_import
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "missing_persons",
        sa.Column("height_cm", sa.SmallInteger(), nullable=True),
    )
    op.add_column(
        "missing_persons",
        sa.Column("last_known_clothing", sa.Text(), nullable=True),
    )
    op.add_column(
        "missing_persons",
        sa.Column(
            "source",
            sa.Text(),
            nullable=False,
            server_default="manual",
        ),
    )


def downgrade() -> None:
    op.drop_column("missing_persons", "source")
    op.drop_column("missing_persons", "last_known_clothing")
    op.drop_column("missing_persons", "height_cm")

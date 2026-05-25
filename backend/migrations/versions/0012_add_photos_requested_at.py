"""add photos_requested_at to missing_persons

Revision ID: 0012
Revises: 0011
Create Date: 2026-05-24
"""
from alembic import op
import sqlalchemy as sa

revision = '0012'
down_revision = '0011'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'missing_persons',
        sa.Column('photos_requested_at', sa.DateTime(timezone=True), nullable=True)
    )


def downgrade() -> None:
    op.drop_column('missing_persons', 'photos_requested_at')

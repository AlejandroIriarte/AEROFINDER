"""add detection_type column to detections

Revision ID: 0014
Revises: 0013
Create Date: 2026-06-02
"""
import sqlalchemy as sa
from alembic import op

revision = '0014'
down_revision = '0013'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'detections',
        sa.Column('detection_type', sa.String(32), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('detections', 'detection_type')

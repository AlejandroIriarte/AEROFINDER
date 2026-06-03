"""make alerts.detection_id nullable for system alerts

Revision ID: 0015
Revises: 0014
Create Date: 2026-06-02
"""
from alembic import op

revision = '0015'
down_revision = '0014'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column('alerts', 'detection_id', nullable=True)


def downgrade() -> None:
    op.alter_column('alerts', 'detection_id', nullable=False)

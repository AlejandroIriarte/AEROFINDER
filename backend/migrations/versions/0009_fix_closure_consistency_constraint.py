"""Fix constraint missing_persons_closure_consistency para permitir pending_review

El constraint original excluía accidentalmente el estado 'pending_review',
bloqueando el INSERT de reportes de familiares. Se reescribe como implicación:
solo cuando status es found_alive/found_deceased se exige found_at != NULL.

Revision ID: 0009
Revises: 0008
Create Date: 2026-05-15
"""

from alembic import op

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE missing_persons
        DROP CONSTRAINT IF EXISTS missing_persons_closure_consistency
    """)
    op.execute("""
        ALTER TABLE missing_persons
        ADD CONSTRAINT missing_persons_closure_consistency CHECK (
            status NOT IN ('found_alive', 'found_deceased')
            OR found_at IS NOT NULL
        )
    """)


def downgrade() -> None:
    op.execute("""
        ALTER TABLE missing_persons
        DROP CONSTRAINT IF EXISTS missing_persons_closure_consistency
    """)
    op.execute("""
        ALTER TABLE missing_persons
        ADD CONSTRAINT missing_persons_closure_consistency CHECK (
            (status = 'active')
            OR (status = ANY (ARRAY['false_report'::missing_person_status, 'archived'::missing_person_status]))
            OR ((status = ANY (ARRAY['found_alive'::missing_person_status, 'found_deceased'::missing_person_status])) AND found_at IS NOT NULL)
        )
    """)

"""add mission_map_access table

Revision ID: 0016
Revises: 0015
Create Date: 2026-06-15
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0016"
down_revision = "0015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "mission_map_access",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "mission_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("missions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "granted_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "granted_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.UniqueConstraint("mission_id", "user_id", name="uq_map_access_mission_user"),
    )
    op.create_index("ix_map_access_mission_id", "mission_map_access", ["mission_id"])
    op.create_index("ix_map_access_user_id", "mission_map_access", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_map_access_user_id", table_name="mission_map_access")
    op.drop_index("ix_map_access_mission_id", table_name="mission_map_access")
    op.drop_table("mission_map_access")

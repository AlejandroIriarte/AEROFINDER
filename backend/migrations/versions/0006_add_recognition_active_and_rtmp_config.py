"""Add recognition_active to missions and rtmp_base_url to system_config

Revision ID: 0006
Revises: 0005
Create Date: 2026-04-28

- missions.recognition_active: flag que activa el reconocimiento facial en el AI worker
- system_config: seed de rtmp_base_url para que el admin configure la IP del servidor RTMP
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0006"
down_revision: Union[str, Sequence[str], None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "missions",
        sa.Column(
            "recognition_active",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("FALSE"),
        ),
    )

    op.execute(
        """
        INSERT INTO system_config (config_key, value_text, value_type, description)
        VALUES (
            'rtmp.base_url',
            'rtmp://localhost:1935/live',
            'string',
            'URL base del servidor RTMP. Cambiar según la red antes de cada operación (campo, 4G, VPN, etc). La URL completa por dron es: {rtmp.base_url}/{serial_number}'
        )
        ON CONFLICT (config_key) DO NOTHING
        """
    )


def downgrade() -> None:
    op.execute("DELETE FROM system_config WHERE config_key = 'rtmp.base_url'")
    op.drop_column("missions", "recognition_active")

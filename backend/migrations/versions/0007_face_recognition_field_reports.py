"""Add face_recognition_active, auto_created, field_reports, push_subscriptions

Revision ID: 0007
Revises: 0006
Create Date: 2026-05-07
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0007"
down_revision: Union[str, Sequence[str], None] = "0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # missions: reconocimiento facial a nivel misión
    op.add_column("missions", sa.Column(
        "face_recognition_active", sa.Boolean(),
        nullable=False, server_default=sa.text("FALSE")
    ))

    # drones: flag de auto-creación por MediaMTX webhook
    op.add_column("drones", sa.Column(
        "auto_created", sa.Boolean(),
        nullable=False, server_default=sa.text("FALSE")
    ))

    # field_reports: solicitudes de análisis de rescatistas
    op.create_table("field_reports",
        sa.Column("id", sa.UUID(), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("mission_id", sa.UUID(), nullable=False),
        sa.Column("rescuer_id", sa.UUID(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default=sa.text("'pending'")),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("location_lat", sa.Numeric(10, 8), nullable=True),
        sa.Column("location_lon", sa.Numeric(11, 8), nullable=True),
        sa.Column("approved_by", sa.UUID(), nullable=True),
        sa.Column("approved_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("completed_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["mission_id"], ["missions.id"]),
        sa.ForeignKeyConstraint(["rescuer_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["approved_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_field_reports_mission_id", "field_reports", ["mission_id"])
    op.create_index("ix_field_reports_rescuer_id", "field_reports", ["rescuer_id"])

    # field_report_photos: fotos subidas a MinIO
    op.create_table("field_report_photos",
        sa.Column("id", sa.UUID(), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("field_report_id", sa.UUID(), nullable=False),
        sa.Column("minio_object", sa.String(500), nullable=False),
        sa.Column("uploaded_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["field_report_id"], ["field_reports.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    # field_report_matches: top-3 resultados del análisis FaceNet
    op.create_table("field_report_matches",
        sa.Column("id", sa.UUID(), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("field_report_id", sa.UUID(), nullable=False),
        sa.Column("person_id", sa.UUID(), nullable=False),
        sa.Column("similarity_score", sa.Numeric(5, 4), nullable=False),
        sa.Column("rank", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["field_report_id"], ["field_reports.id"]),
        sa.ForeignKeyConstraint(["person_id"], ["missing_persons.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    # push_subscriptions: suscripciones Web Push PWA
    op.create_table("push_subscriptions",
        sa.Column("id", sa.UUID(), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("endpoint", sa.Text(), nullable=False),
        sa.Column("p256dh", sa.Text(), nullable=False),
        sa.Column("auth_key", sa.Text(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "endpoint", name="uq_push_user_endpoint"),
    )


def downgrade() -> None:
    op.drop_table("push_subscriptions")
    op.drop_table("field_report_matches")
    op.drop_table("field_report_photos")
    op.drop_table("field_reports")
    op.drop_column("drones", "auto_created")
    op.drop_column("missions", "face_recognition_active")

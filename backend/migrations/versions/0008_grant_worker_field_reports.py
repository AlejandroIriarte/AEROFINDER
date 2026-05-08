"""Grant aerofinder_worker access to field_report tables

Revision ID: 0008
Revises: 0007
Create Date: 2026-05-07
"""
from typing import Sequence, Union
from alembic import op

revision: str = "0008"
down_revision: Union[str, Sequence[str], None] = "0007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # El AI worker (aerofinder_worker) necesita leer field_reports y sus fotos
    # para ejecutar el análisis, y escribir los matches resultantes.
    op.execute("GRANT SELECT ON field_reports TO aerofinder_worker")
    op.execute("GRANT SELECT ON field_report_photos TO aerofinder_worker")
    op.execute("GRANT SELECT ON push_subscriptions TO aerofinder_worker")
    op.execute("GRANT INSERT ON field_report_matches TO aerofinder_worker")
    op.execute("GRANT UPDATE (status, completed_at) ON field_reports TO aerofinder_worker")
    # Sequences para gen_random_uuid() no se necesitan; PostgreSQL las maneja internamente.
    # Pero sí se necesita SELECT en missing_persons para el JOIN en search_similar_persons.
    op.execute("GRANT SELECT ON missing_persons TO aerofinder_worker")


def downgrade() -> None:
    op.execute("REVOKE SELECT ON field_reports FROM aerofinder_worker")
    op.execute("REVOKE SELECT ON field_report_photos FROM aerofinder_worker")
    op.execute("REVOKE SELECT ON push_subscriptions FROM aerofinder_worker")
    op.execute("REVOKE INSERT ON field_report_matches FROM aerofinder_worker")
    op.execute("REVOKE UPDATE (status, completed_at) ON field_reports FROM aerofinder_worker")
    op.execute("REVOKE SELECT ON missing_persons FROM aerofinder_worker")

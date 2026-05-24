"""Fix política RLS missing_persons_select para permitir INSERT...RETURNING de familiar

La política SELECT se evalúa sobre las filas devueltas por INSERT...RETURNING.
Un familiar que reporta un caso aún no está en person_relatives en ese momento,
por lo que RETURNING falla con InsufficientPrivilegeError.
Se añade OR (reported_by_user_id = fn_current_app_user_id()) para que el
reporter pueda ver su propia fila recién insertada.

Revision ID: 0010
Revises: 0009
Create Date: 2026-05-24
"""

from alembic import op

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("DROP POLICY IF EXISTS missing_persons_select ON missing_persons")
    op.execute("""
        CREATE POLICY missing_persons_select
            ON missing_persons
            FOR SELECT
            TO aerofinder_app
            USING (
                (fn_current_app_user_role() = ANY (ARRAY['admin'::text, 'buscador'::text, 'ayudante'::text]))
                OR (EXISTS (
                    SELECT 1
                    FROM person_relatives pr
                    WHERE pr.missing_person_id = missing_persons.id
                      AND pr.user_id = fn_current_app_user_id()
                ))
                OR (reported_by_user_id = fn_current_app_user_id())
            )
    """)


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS missing_persons_select ON missing_persons")
    op.execute("""
        CREATE POLICY missing_persons_select
            ON missing_persons
            FOR SELECT
            TO aerofinder_app
            USING (
                (fn_current_app_user_role() = ANY (ARRAY['admin'::text, 'buscador'::text, 'ayudante'::text]))
                OR (EXISTS (
                    SELECT 1
                    FROM person_relatives pr
                    WHERE pr.missing_person_id = missing_persons.id
                      AND pr.user_id = fn_current_app_user_id()
                ))
            )
    """)

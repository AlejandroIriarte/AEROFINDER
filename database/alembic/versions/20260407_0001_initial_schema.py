"""initial_schema

Migración inicial: aplica el schema completo de AEROFINDER.
Ejecuta los 8 archivos SQL en orden estricto de dependencias.

Revision ID: 0001
Revises:
Create Date: 2026-04-07
"""

from pathlib import Path
from alembic import op

# Identificadores de revisión
revision: str = "0001"
down_revision: str | None = None
branch_labels: str | None = None
depends_on: str | None = None

# Ruta base de los archivos SQL del schema
SCHEMA_DIR = Path(__file__).parent.parent.parent / "schema"

# Orden de ejecución estricto — no modificar
SQL_FILES = [
    "01_extensions.sql",
    "02_enums.sql",
    "03_tables.sql",
    "04_indexes.sql",
    "05_triggers.sql",
    "06_security.sql",
    "07_views.sql",
    "08_seeds.sql",
]


def _read_sql(filename: str) -> str:
    """Lee el contenido de un archivo SQL del schema."""
    path = SCHEMA_DIR / filename
    return path.read_text(encoding="utf-8")


def upgrade() -> None:
    """Aplica el schema completo desde cero."""
    for filename in SQL_FILES:
        sql = _read_sql(filename)
        op.execute(sql)


def downgrade() -> None:
    """
    Elimina el schema completo.
    ADVERTENCIA: operación destructiva — elimina todos los datos.
    Solo usar en entornos de desarrollo.
    """
    op.execute("""
        -- Eliminar vistas
        DROP VIEW IF EXISTS
            v_notification_retry_queue,
            v_embedding_queue,
            v_case_summary,
            v_drone_fleet,
            v_alert_inbox,
            v_detections_sanitized,
            v_detections_full,
            v_mission_timeline,
            v_active_missions
        CASCADE;

        -- Eliminar tablas (orden inverso de dependencias)
        DROP TABLE IF EXISTS
            legal_consents,
            data_access_log,
            audit_log,
            system_config,
            drone_telemetry_summary,
            drone_telemetry_raw,
            notification_queue,
            alerts,
            detection_reviews,
            detections,
            video_recordings,
            mission_waypoints,
            mission_coverage_zones,
            mission_events,
            mission_drones,
            missions,
            drone_maintenance_logs,
            drones,
            face_embeddings,
            ai_models,
            person_relatives,
            person_photos,
            missing_persons,
            files,
            notification_preferences,
            login_attempts,
            user_sessions,
            users,
            roles
        CASCADE;

        -- Eliminar ENUMs
        DROP TYPE IF EXISTS
            consent_type,
            sensitive_access_action,
            sensitive_resource_type,
            audit_operation,
            config_value_type,
            file_upload_status,
            file_retention_policy,
            notification_delivery_status,
            alert_content_level,
            alert_status,
            coverage_zone_status,
            mission_event_type,
            mission_status,
            maintenance_type,
            drone_status,
            detection_verdict,
            ai_model_type,
            relative_relation,
            photo_face_angle,
            missing_person_status,
            notification_channel,
            role_name
        CASCADE;

        -- Eliminar extensiones (comentar en producción)
        -- DROP EXTENSION IF EXISTS btree_gist, pg_trgm, vector, postgis CASCADE;
    """)

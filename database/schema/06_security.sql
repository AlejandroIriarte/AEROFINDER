-- =============================================================================
-- AEROFINDER — Roles de PostgreSQL, permisos y Row Level Security (RLS)
-- Requiere: 05_triggers.sql ejecutado previamente
-- Orden de ejecución: 01 → 02 → 03 → 04 → 05 → 06
--
-- Arquitectura de seguridad:
--   Roles PG:
--     aerofinder_app     — FastAPI (DML completo en tablas de negocio)
--     aerofinder_worker  — Workers de IA y Redis (INSERT en tablas de alta carga)
--     aerofinder_audit   — Lectura de tablas de auditoría (equipo legal/compliance)
--
--   RLS (Row Level Security):
--     Aísla filas según current_setting('aerofinder.current_user_id')
--     FastAPI establece: SET LOCAL aerofinder.current_user_id = '<uuid>'
--                        SET LOCAL aerofinder.current_user_role = '<role_name>'
--     en cada transacción antes de ejecutar operaciones de negocio.
--
--   Column-level security:
--     Las coords GPS y embeddings se filtran por columna en las vistas (DB-4).
--     RLS aquí controla visibilidad de filas completas.
-- =============================================================================


-- =============================================================================
-- ROLES DE POSTGRESQL
-- =============================================================================

-- Rol de la aplicación FastAPI: acceso DML a todas las tablas de negocio
-- La contraseña se establece vía variable de entorno POSTGRES_APP_PASSWORD
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'aerofinder_app') THEN
        CREATE ROLE aerofinder_app WITH LOGIN;
    END IF;
END;
$$;

-- Rol de los workers de IA y Redis Streams: escritura en tablas de alta carga
-- Sin acceso a tablas de usuarios ni auditoría
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'aerofinder_worker') THEN
        CREATE ROLE aerofinder_worker WITH LOGIN;
    END IF;
END;
$$;

-- Rol de auditoría legal: lectura exclusiva de logs (equipo legal y compliance)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'aerofinder_audit') THEN
        CREATE ROLE aerofinder_audit WITH LOGIN;
    END IF;
END;
$$;


-- =============================================================================
-- PERMISOS: aerofinder_app
-- Acceso completo a tablas de negocio; sin acceso directo a logs de auditoría
-- =============================================================================

GRANT USAGE ON SCHEMA public TO aerofinder_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON
    roles,
    users,
    user_sessions,
    login_attempts,
    notification_preferences,
    missing_persons,
    person_photos,
    person_relatives,
    files,
    ai_models,
    face_embeddings,
    detection_reviews,
    drones,
    drone_maintenance_logs,
    missions,
    mission_drones,
    mission_events,
    mission_coverage_zones,
    mission_waypoints,
    video_recordings,
    detections,
    alerts,
    notification_queue,
    drone_telemetry_summary,
    system_config,
    legal_consents
TO aerofinder_app;

-- Solo INSERT en logs (nunca UPDATE ni DELETE: los logs son inmutables)
GRANT INSERT ON audit_log, data_access_log TO aerofinder_app;
GRANT SELECT ON audit_log, data_access_log TO aerofinder_app;

-- Acceso a secuencias de BIGSERIAL
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO aerofinder_app;


-- =============================================================================
-- PERMISOS: aerofinder_worker
-- Solo lo necesario para el pipeline de IA y el consumer de Redis
-- =============================================================================

GRANT USAGE ON SCHEMA public TO aerofinder_worker;

-- Telemetría GPS: INSERT masivo a 10Hz
-- SELECT también necesario: el worker interpola posición GPS para cada detección
GRANT INSERT, SELECT ON drone_telemetry_raw TO aerofinder_worker;
GRANT INSERT ON drone_telemetry_summary TO aerofinder_worker;

-- El worker lee config de umbrales de IA
GRANT SELECT ON system_config TO aerofinder_worker;

-- El worker lee modelos activos al iniciar
GRANT SELECT ON ai_models TO aerofinder_worker;

-- El worker lee embeddings de referencia para comparar con la detección
GRANT SELECT ON face_embeddings TO aerofinder_worker;
GRANT SELECT ON person_photos TO aerofinder_worker;
GRANT SELECT ON missing_persons TO aerofinder_worker;

-- El worker inserta detecciones, alertas y archivos de snapshot
GRANT INSERT ON detections, alerts, notification_queue, files TO aerofinder_worker;
GRANT SELECT ON detections, alerts TO aerofinder_worker;

-- El worker actualiza el estado del stream en video_recordings
GRANT SELECT, INSERT, UPDATE ON video_recordings TO aerofinder_worker;

-- El worker inserta eventos de misión (stream_lost, person_detected, etc.)
GRANT INSERT ON mission_events TO aerofinder_worker;

-- El worker actualiza zonas de cobertura al completar un segmento
GRANT SELECT, UPDATE ON mission_coverage_zones TO aerofinder_worker;

GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO aerofinder_worker;


-- =============================================================================
-- PERMISOS: aerofinder_audit
-- Solo lectura de tablas de auditoría y datos de soporte
-- =============================================================================

GRANT USAGE ON SCHEMA public TO aerofinder_audit;

GRANT SELECT ON
    audit_log,
    data_access_log,
    legal_consents,
    users,
    user_sessions,
    missing_persons,
    missions,
    detections,
    alerts
TO aerofinder_audit;


-- =============================================================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================================================
-- Estrategia:
--   aerofinder_app conecta con un solo rol PG pero representa a múltiples usuarios.
--   Las políticas leen current_setting('aerofinder.current_user_id') para
--   identificar al usuario de la aplicación y current_setting('aerofinder.current_user_role')
--   para su rol.
--
--   Jerarquía de acceso:
--     admin     → ve y modifica todo
--     buscador  → ve sus misiones y todas las detecciones con GPS
--     ayudante  → ve sus alertas asignadas sin coords GPS (enforcement en vistas DB-4)
--     familiar  → ve solo sus alertas tipo confirmation_only
-- =============================================================================

-- Función helper: retorna el user_id de la sesión actual como UUID
-- SECURITY DEFINER para acceder a la tabla users sin que RLS cause recursión
CREATE OR REPLACE FUNCTION fn_current_app_user_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER AS $$
    SELECT current_setting('aerofinder.current_user_id', true)::UUID;
$$;

-- Función helper: retorna el rol del usuario actual como texto
CREATE OR REPLACE FUNCTION fn_current_app_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER AS $$
    SELECT current_setting('aerofinder.current_user_role', true);
$$;


-- ─── alerts ──────────────────────────────────────────────────────────────────
-- Cada usuario solo ve sus propias alertas; admin ve todas

ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;

-- Los workers insertan alertas sin RLS (BYPASSRLS para aerofinder_worker)
ALTER TABLE alerts FORCE ROW LEVEL SECURITY;

CREATE POLICY alerts_select_own
    ON alerts
    FOR SELECT
    TO aerofinder_app
    USING (
        fn_current_app_user_role() = 'admin'
        OR recipient_user_id = fn_current_app_user_id()
    );

CREATE POLICY alerts_insert_app
    ON alerts
    FOR INSERT
    TO aerofinder_app
    WITH CHECK (TRUE);  -- validación de negocio en la aplicación

CREATE POLICY alerts_update_own
    ON alerts
    FOR UPDATE
    TO aerofinder_app
    USING (
        fn_current_app_user_role() = 'admin'
        OR recipient_user_id = fn_current_app_user_id()
    );


-- ─── notification_queue ───────────────────────────────────────────────────────
-- Solo admin y el worker ven la cola completa; usuarios ven la suya vía alerts

ALTER TABLE notification_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_queue FORCE ROW LEVEL SECURITY;

CREATE POLICY notification_queue_admin_only
    ON notification_queue
    FOR ALL
    TO aerofinder_app
    USING (fn_current_app_user_role() = 'admin');

-- El worker tiene BYPASSRLS (configurado al final de este archivo)


-- ─── user_sessions ───────────────────────────────────────────────────────────
-- Cada usuario ve solo sus propias sesiones activas

ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions FORCE ROW LEVEL SECURITY;

CREATE POLICY sessions_select_own
    ON user_sessions
    FOR SELECT
    TO aerofinder_app
    USING (
        fn_current_app_user_role() = 'admin'
        OR user_id = fn_current_app_user_id()
    );

CREATE POLICY sessions_insert_any
    ON user_sessions
    FOR INSERT
    TO aerofinder_app
    WITH CHECK (TRUE);

CREATE POLICY sessions_update_own
    ON user_sessions
    FOR UPDATE
    TO aerofinder_app
    USING (
        fn_current_app_user_role() = 'admin'
        OR user_id = fn_current_app_user_id()
    );


-- ─── login_attempts ──────────────────────────────────────────────────────────
-- Solo admin; la app inserta pero no puede leer (excepto admin)

ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE login_attempts FORCE ROW LEVEL SECURITY;

CREATE POLICY login_attempts_insert_any
    ON login_attempts
    FOR INSERT
    TO aerofinder_app
    WITH CHECK (TRUE);

CREATE POLICY login_attempts_select_admin
    ON login_attempts
    FOR SELECT
    TO aerofinder_app
    USING (fn_current_app_user_role() = 'admin');


-- ─── missing_persons ─────────────────────────────────────────────────────────
-- Familiares solo ven la persona vinculada a ellos vía person_relatives

ALTER TABLE missing_persons ENABLE ROW LEVEL SECURITY;
ALTER TABLE missing_persons FORCE ROW LEVEL SECURITY;

CREATE POLICY missing_persons_select
    ON missing_persons
    FOR SELECT
    TO aerofinder_app
    USING (
        fn_current_app_user_role() IN ('admin', 'buscador', 'ayudante')
        OR EXISTS (
            SELECT 1 FROM person_relatives pr
            WHERE pr.missing_person_id = missing_persons.id
              AND pr.user_id = fn_current_app_user_id()
        )
    );

CREATE POLICY missing_persons_write_staff
    ON missing_persons
    FOR ALL
    TO aerofinder_app
    USING (fn_current_app_user_role() IN ('admin', 'buscador'))
    WITH CHECK (fn_current_app_user_role() IN ('admin', 'buscador'));


-- ─── legal_consents ──────────────────────────────────────────────────────────
-- Cada usuario ve sus propios consentimientos; admin ve todos

ALTER TABLE legal_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE legal_consents FORCE ROW LEVEL SECURITY;

CREATE POLICY legal_consents_select_own
    ON legal_consents
    FOR SELECT
    TO aerofinder_app
    USING (
        fn_current_app_user_role() = 'admin'
        OR user_id = fn_current_app_user_id()
    );

CREATE POLICY legal_consents_insert_own
    ON legal_consents
    FOR INSERT
    TO aerofinder_app
    WITH CHECK (user_id = fn_current_app_user_id());


-- ─── audit_log y data_access_log ─────────────────────────────────────────────
-- Solo admin puede leer; INSERT permitido sin restricción de fila

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;

CREATE POLICY audit_log_insert_any
    ON audit_log FOR INSERT TO aerofinder_app WITH CHECK (TRUE);

CREATE POLICY audit_log_select_admin
    ON audit_log FOR SELECT TO aerofinder_app
    USING (fn_current_app_user_role() = 'admin');

ALTER TABLE data_access_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_access_log FORCE ROW LEVEL SECURITY;

CREATE POLICY data_access_log_insert_any
    ON data_access_log FOR INSERT TO aerofinder_app WITH CHECK (TRUE);

CREATE POLICY data_access_log_select_admin
    ON data_access_log FOR SELECT TO aerofinder_app
    USING (fn_current_app_user_role() = 'admin');


-- ─── system_config ───────────────────────────────────────────────────────────
-- Solo admin puede modificar; todos los roles autenticados pueden leer

ALTER TABLE system_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_config FORCE ROW LEVEL SECURITY;

CREATE POLICY system_config_select_all
    ON system_config FOR SELECT TO aerofinder_app
    USING (TRUE);

CREATE POLICY system_config_write_admin
    ON system_config FOR ALL TO aerofinder_app
    USING (fn_current_app_user_role() = 'admin')
    WITH CHECK (fn_current_app_user_role() = 'admin');


-- =============================================================================
-- BYPASSRLS para el worker
-- El worker inserta en telemetría, detecciones y alertas sin filtrado por usuario
-- =============================================================================

ALTER ROLE aerofinder_worker BYPASSRLS;


-- =============================================================================
-- CONFIGURACIÓN DE PARÁMETROS DE SESIÓN PERSONALIZADOS
-- Permite SET LOCAL aerofinder.current_user_id = '...' sin error de configuración
-- =============================================================================

-- Registrar los parámetros personalizados para que PostgreSQL los acepte
-- sin necesitar reinicio (funciona desde PostgreSQL 14+)
ALTER DATABASE aerofinder SET "aerofinder.current_user_id" = '';
ALTER DATABASE aerofinder SET "aerofinder.current_session_id" = '';
ALTER DATABASE aerofinder SET "aerofinder.current_user_role" = '';

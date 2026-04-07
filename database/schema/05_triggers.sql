-- =============================================================================
-- AEROFINDER — Triggers y funciones de base de datos
-- Requiere: 04_indexes.sql ejecutado previamente
-- Orden de ejecución: 01 → 02 → 03 → 04 → 05 → 06
--
-- Triggers definidos:
--   1. trg_set_updated_at       — actualiza updated_at automáticamente en cada UPDATE
--   2. trg_set_gps_location     — deriva gps_location (PostGIS) desde lat/lon en detections
--   3. trg_audit_log            — registra INSERT/UPDATE/DELETE en audit_log
--   4. trg_mark_embedding_ready — marca has_embedding = TRUE al insertar en face_embeddings
--   5. trg_mark_detection_reviewed — marca is_reviewed = TRUE al insertar en detection_reviews
-- =============================================================================


-- =============================================================================
-- 1. FUNCIÓN GENÉRICA: updated_at automático
-- =============================================================================

-- Función reutilizable por todos los triggers de updated_at
CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- Trigger aplicado a cada tabla con columna updated_at
CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_notification_preferences_updated_at
    BEFORE UPDATE ON notification_preferences
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_missing_persons_updated_at
    BEFORE UPDATE ON missing_persons
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_person_photos_updated_at
    BEFORE UPDATE ON person_photos
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_drones_updated_at
    BEFORE UPDATE ON drones
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_missions_updated_at
    BEFORE UPDATE ON missions
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_mission_coverage_zones_updated_at
    BEFORE UPDATE ON mission_coverage_zones
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_alerts_updated_at
    BEFORE UPDATE ON alerts
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_notification_queue_updated_at
    BEFORE UPDATE ON notification_queue
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_system_config_updated_at
    BEFORE UPDATE ON system_config
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();


-- =============================================================================
-- 2. TRIGGER: gps_location derivada desde lat/lon en detections
-- =============================================================================

-- Genera automáticamente el punto PostGIS cuando se insertan o actualizan
-- las coordenadas lat/lon. Evita inconsistencias entre las tres columnas.
CREATE OR REPLACE FUNCTION fn_set_detection_gps_location()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.gps_latitude IS NOT NULL AND NEW.gps_longitude IS NOT NULL THEN
        NEW.gps_location = ST_SetSRID(
            ST_MakePoint(NEW.gps_longitude, NEW.gps_latitude),
            4326
        );
    ELSE
        NEW.gps_location = NULL;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_detections_gps_location
    BEFORE INSERT OR UPDATE OF gps_latitude, gps_longitude ON detections
    FOR EACH ROW EXECUTE FUNCTION fn_set_detection_gps_location();


-- =============================================================================
-- 3. TRIGGER: audit_log automático (inmutable, no puede saltarse desde la app)
-- =============================================================================

-- Lee el usuario actual desde el parámetro de sesión aerofinder.current_user_id
-- que FastAPI establece con SET LOCAL antes de cada escritura.
-- Patrón: BEGIN; SET LOCAL aerofinder.current_user_id = 'uuid'; ... COMMIT;
CREATE OR REPLACE FUNCTION fn_audit_log()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER AS $$
DECLARE
    v_user_id    UUID;
    v_session_id UUID;
    v_record_id  TEXT;
    v_old_vals   JSONB;
    v_new_vals   JSONB;
BEGIN
    -- Recuperar usuario de sesión; NULL si no fue establecido (operación interna)
    BEGIN
        v_user_id := current_setting('aerofinder.current_user_id', true)::UUID;
    EXCEPTION WHEN OTHERS THEN
        v_user_id := NULL;
    END;

    BEGIN
        v_session_id := current_setting('aerofinder.current_session_id', true)::UUID;
    EXCEPTION WHEN OTHERS THEN
        v_session_id := NULL;
    END;

    -- Extraer el ID del registro afectado (asume columna 'id' en todas las tablas auditadas)
    IF TG_OP = 'DELETE' THEN
        v_record_id := OLD.id::TEXT;
        v_old_vals  := to_jsonb(OLD);
        v_new_vals  := NULL;
    ELSIF TG_OP = 'INSERT' THEN
        v_record_id := NEW.id::TEXT;
        v_old_vals  := NULL;
        v_new_vals  := to_jsonb(NEW);
    ELSE -- UPDATE
        v_record_id := NEW.id::TEXT;
        v_old_vals  := to_jsonb(OLD);
        v_new_vals  := to_jsonb(NEW);
    END IF;

    INSERT INTO audit_log (
        table_name, record_id, operation,
        changed_by, session_id,
        old_values, new_values
    ) VALUES (
        TG_TABLE_NAME, v_record_id, TG_OP::audit_operation,
        v_user_id, v_session_id,
        v_old_vals, v_new_vals
    );

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

-- Tablas auditadas: cualquier modificación queda registrada con valores antes/después
-- NOTA: audit_log y data_access_log no se auditan a sí mismas (evitar recursión)
CREATE TRIGGER trg_audit_users
    AFTER INSERT OR UPDATE OR DELETE ON users
    FOR EACH ROW EXECUTE FUNCTION fn_audit_log();

CREATE TRIGGER trg_audit_missing_persons
    AFTER INSERT OR UPDATE OR DELETE ON missing_persons
    FOR EACH ROW EXECUTE FUNCTION fn_audit_log();

CREATE TRIGGER trg_audit_missions
    AFTER INSERT OR UPDATE OR DELETE ON missions
    FOR EACH ROW EXECUTE FUNCTION fn_audit_log();

CREATE TRIGGER trg_audit_drones
    AFTER INSERT OR UPDATE OR DELETE ON drones
    FOR EACH ROW EXECUTE FUNCTION fn_audit_log();

CREATE TRIGGER trg_audit_alerts
    AFTER INSERT OR UPDATE OR DELETE ON alerts
    FOR EACH ROW EXECUTE FUNCTION fn_audit_log();

CREATE TRIGGER trg_audit_system_config
    AFTER INSERT OR UPDATE OR DELETE ON system_config
    FOR EACH ROW EXECUTE FUNCTION fn_audit_log();

CREATE TRIGGER trg_audit_legal_consents
    AFTER INSERT OR UPDATE OR DELETE ON legal_consents
    FOR EACH ROW EXECUTE FUNCTION fn_audit_log();


-- =============================================================================
-- 4. TRIGGER: marcar has_embedding = TRUE al insertar embedding
-- =============================================================================

-- Sincroniza el flag de estado en person_photos automáticamente.
-- El worker de IA inserta en face_embeddings; este trigger actualiza la foto
-- sin necesidad de un segundo UPDATE explícito.
CREATE OR REPLACE FUNCTION fn_mark_photo_embedding_ready()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    UPDATE person_photos
    SET    has_embedding = TRUE,
           updated_at    = NOW()
    WHERE  id = NEW.photo_id
      AND  has_embedding = FALSE;  -- condición para evitar UPDATE innecesario
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_face_embeddings_mark_photo_ready
    AFTER INSERT ON face_embeddings
    FOR EACH ROW EXECUTE FUNCTION fn_mark_photo_embedding_ready();


-- =============================================================================
-- 5. TRIGGER: marcar is_reviewed = TRUE al insertar una revisión de detección
-- =============================================================================

-- Sincroniza el flag de estado en detections automáticamente.
-- Un operador inserta en detection_reviews; este trigger marca la detección
-- sin necesidad de un segundo UPDATE explícito en la aplicación.
CREATE OR REPLACE FUNCTION fn_mark_detection_reviewed()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    UPDATE detections
    SET    is_reviewed = TRUE
    WHERE  id = NEW.detection_id
      AND  is_reviewed = FALSE;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_detection_reviews_mark_reviewed
    AFTER INSERT ON detection_reviews
    FOR EACH ROW EXECUTE FUNCTION fn_mark_detection_reviewed();

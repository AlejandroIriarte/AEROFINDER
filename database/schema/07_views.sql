-- =============================================================================
-- AEROFINDER — Vistas del sistema
-- Requiere: 06_security.sql ejecutado previamente
-- Orden de ejecución: 01 → 02 → 03 → 04 → 05 → 06 → 07 → 08
--
-- Propósito de las vistas:
--   1. Column-level security: ocultar coords GPS y embeddings según rol
--   2. Joins precalculados para los patrones de acceso más frecuentes
--   3. Todas las vistas usan SECURITY INVOKER (default) para que RLS siga activo
--
-- Vistas definidas:
--   v_active_missions        — misiones en curso con persona buscada y drones
--   v_mission_timeline       — eventos de una misión en orden cronológico
--   v_detections_full        — detecciones con GPS (buscadores y admin)
--   v_detections_sanitized   — detecciones sin GPS ni embedding (ayudantes)
--   v_alert_inbox            — bandeja de alertas con contexto de detección
--   v_drone_fleet            — estado actual de la flota de drones
--   v_case_summary           — resumen de cada caso con última actividad
--   v_embedding_queue        — fotos pendientes de generación de embedding
--   v_notification_retry_queue — cola de notificaciones pendientes de reintento
-- =============================================================================


-- =============================================================================
-- 1. v_active_missions
-- Misiones en estado active o paused con persona buscada y drones asignados
-- Usada en: dashboard principal del buscador y del admin
-- =============================================================================

CREATE OR REPLACE VIEW v_active_missions AS
SELECT
    m.id                    AS mission_id,
    m.name                  AS mission_name,
    m.status,
    m.started_at,
    m.search_area,
    -- Persona buscada
    mp.id                   AS missing_person_id,
    mp.full_name            AS missing_person_name,
    mp.age_at_disappearance,
    mp.physical_description,
    -- Lead de la misión
    u.full_name             AS lead_user_name,
    u.phone                 AS lead_user_phone,
    -- Drones activos en la misión (agregado como JSON)
    COALESCE(
        json_agg(
            json_build_object(
                'drone_id',     d.id,
                'serial',       d.serial_number,
                'model',        d.model,
                'drone_status', d.status
            )
        ) FILTER (WHERE d.id IS NOT NULL),
        '[]'
    )                       AS drones,
    -- Conteo de detecciones en la misión
    COUNT(DISTINCT det.id)  AS total_detections,
    -- Cobertura de zonas
    COUNT(DISTINCT cz.id) FILTER (WHERE cz.status = 'completed') AS zones_completed,
    COUNT(DISTINCT cz.id)                                          AS zones_total
FROM missions m
JOIN missing_persons mp  ON mp.id = m.missing_person_id
JOIN users u             ON u.id  = m.lead_user_id
LEFT JOIN mission_drones md  ON md.mission_id = m.id AND md.left_at IS NULL
LEFT JOIN drones d           ON d.id = md.drone_id
LEFT JOIN detections det     ON det.mission_id = m.id
LEFT JOIN mission_coverage_zones cz ON cz.mission_id = m.id
WHERE m.status IN ('active', 'paused')
GROUP BY m.id, mp.id, u.id;


-- =============================================================================
-- 2. v_mission_timeline
-- Todos los eventos de todas las misiones en orden cronológico
-- Usada en: reconstrucción de línea de tiempo, auditoría post-misión
-- =============================================================================

CREATE OR REPLACE VIEW v_mission_timeline AS
SELECT
    me.id           AS event_id,
    me.mission_id,
    m.name          AS mission_name,
    me.event_type,
    me.occurred_at,
    me.payload,
    -- Drone involucrado (si aplica)
    d.serial_number AS drone_serial,
    d.model         AS drone_model,
    -- Usuario que generó el evento (si aplica)
    u.full_name     AS user_name,
    u.id            AS user_id
FROM mission_events me
JOIN missions m      ON m.id  = me.mission_id
LEFT JOIN drones d   ON d.id  = me.drone_id
LEFT JOIN users u    ON u.id  = me.user_id
ORDER BY me.mission_id, me.occurred_at ASC;


-- =============================================================================
-- 3. v_detections_full
-- Detecciones con todos los datos incluyendo coordenadas GPS y embedding
-- ACCESO: solo buscadores y admin (enforcement en la aplicación + RLS en detections)
-- Usada en: mapa de detecciones del buscador, export judicial
-- =============================================================================

CREATE OR REPLACE VIEW v_detections_full AS
SELECT
    det.id                   AS detection_id,
    det.mission_id,
    m.name                   AS mission_name,
    det.drone_id,
    dr.serial_number         AS drone_serial,
    -- Persona buscada
    det.missing_person_id,
    mp.full_name             AS missing_person_name,
    -- Datos técnicos de la detección
    det.frame_timestamp,
    det.frame_number,
    det.yolo_confidence,
    det.facenet_similarity,
    det.bounding_box,
    -- Coordenadas GPS (visibles en esta vista; la aplicación restringe acceso por rol)
    det.gps_latitude,
    det.gps_longitude,
    det.gps_location,
    -- Modelos usados
    ym.name                  AS detection_model_name,
    ym.version               AS detection_model_version,
    fm.name                  AS recognition_model_name,
    fm.version               AS recognition_model_version,
    -- Snapshot del frame
    det.snapshot_file_id,
    f.bucket                 AS snapshot_bucket,
    f.object_key             AS snapshot_object_key,
    -- Estado de revisión
    det.is_reviewed,
    det.created_at,
    -- Última revisión humana (si existe)
    dr2.verdict              AS last_review_verdict,
    dr2.reviewed_at          AS last_review_at,
    dr2_u.full_name          AS last_reviewer_name
FROM detections det
JOIN missions m              ON m.id   = det.mission_id
JOIN drones dr               ON dr.id  = det.drone_id
JOIN missing_persons mp      ON mp.id  = det.missing_person_id
JOIN ai_models ym            ON ym.id  = det.detection_model_id
JOIN ai_models fm            ON fm.id  = det.recognition_model_id
LEFT JOIN files f            ON f.id   = det.snapshot_file_id
-- Última revisión: subconsulta lateral para eficiencia
LEFT JOIN LATERAL (
    SELECT verdict, reviewed_at, reviewed_by
    FROM detection_reviews
    WHERE detection_id = det.id
    ORDER BY reviewed_at DESC
    LIMIT 1
) dr2 ON TRUE
LEFT JOIN users dr2_u        ON dr2_u.id = dr2.reviewed_by;


-- =============================================================================
-- 4. v_detections_sanitized
-- Detecciones SIN coordenadas GPS ni embedding vectorial
-- ACCESO: ayudantes (el familiar no accede a detecciones directamente, solo a alertas)
-- Usada en: panel del ayudante, notificación de detección sin ubicación
-- =============================================================================

CREATE OR REPLACE VIEW v_detections_sanitized AS
SELECT
    det.id                   AS detection_id,
    det.mission_id,
    m.name                   AS mission_name,
    det.drone_id,
    dr.serial_number         AS drone_serial,
    det.missing_person_id,
    mp.full_name             AS missing_person_name,
    det.frame_timestamp,
    det.yolo_confidence,
    det.facenet_similarity,
    det.bounding_box,
    -- GPS intencionalmente OMITIDO: gps_latitude, gps_longitude, gps_location
    -- embedding intencionalmente OMITIDO: detection_embedding
    det.snapshot_file_id,
    f.bucket                 AS snapshot_bucket,
    f.object_key             AS snapshot_object_key,
    det.is_reviewed,
    det.created_at
FROM detections det
JOIN missions m         ON m.id  = det.mission_id
JOIN drones dr          ON dr.id = det.drone_id
JOIN missing_persons mp ON mp.id = det.missing_person_id
LEFT JOIN files f       ON f.id  = det.snapshot_file_id;


-- =============================================================================
-- 5. v_alert_inbox
-- Bandeja de alertas con contexto de la detección adaptado al nivel de contenido
-- El content_level de la alerta determina qué datos se muestran
-- RLS sobre alerts filtra las filas al usuario actual automáticamente
-- Usada en: pantalla de alertas de cualquier rol
-- =============================================================================

CREATE OR REPLACE VIEW v_alert_inbox AS
SELECT
    a.id                     AS alert_id,
    a.status                 AS alert_status,
    a.content_level,
    a.generated_at,
    a.message_text,
    -- Persona buscada (siempre visible)
    mp.full_name             AS missing_person_name,
    mp.age_at_disappearance,
    -- Confianza de la detección (siempre visible)
    det.facenet_similarity,
    det.yolo_confidence,
    det.frame_timestamp      AS detected_at,
    -- Snapshot del frame (siempre visible — es el motivo de la alerta)
    f.bucket                 AS snapshot_bucket,
    f.object_key             AS snapshot_object_key,
    -- GPS: solo si content_level = 'full' (buscadores)
    CASE
        WHEN a.content_level = 'full' THEN det.gps_latitude
        ELSE NULL
    END                      AS gps_latitude,
    CASE
        WHEN a.content_level = 'full' THEN det.gps_longitude
        ELSE NULL
    END                      AS gps_longitude,
    -- Misión: nombre siempre visible; área solo para buscadores
    m.name                   AS mission_name,
    CASE
        WHEN a.content_level = 'full' THEN m.search_area
        ELSE NULL
    END                      AS mission_area,
    -- Estado de entrega por canal (agregado como JSON)
    COALESCE(
        json_agg(
            json_build_object(
                'channel',      nq.channel,
                'status',       nq.status,
                'attempts',     nq.attempts,
                'sent_at',      nq.sent_at,
                'delivered_at', nq.delivered_at
            )
        ) FILTER (WHERE nq.id IS NOT NULL),
        '[]'
    )                        AS delivery_status
FROM alerts a
JOIN detections det     ON det.id = a.detection_id
JOIN missing_persons mp ON mp.id  = det.missing_person_id
JOIN missions m         ON m.id   = det.mission_id
LEFT JOIN files f       ON f.id   = det.snapshot_file_id
LEFT JOIN notification_queue nq ON nq.alert_id = a.id
GROUP BY
    a.id, mp.id, det.id, m.id, f.id;


-- =============================================================================
-- 6. v_drone_fleet
-- Estado operacional actual de toda la flota de drones
-- Usada en: panel de administración, asignación de drones a misión
-- =============================================================================

CREATE OR REPLACE VIEW v_drone_fleet AS
SELECT
    d.id,
    d.serial_number,
    d.model,
    d.manufacturer,
    d.status,
    d.battery_warning_pct,
    d.max_flight_time_minutes,
    -- Piloto asignado
    u.full_name              AS assigned_to,
    u.phone                  AS assigned_to_phone,
    -- Misión actual (si está en vuelo)
    m.id                     AS current_mission_id,
    m.name                   AS current_mission_name,
    mp.full_name             AS searching_for,
    -- Último mantenimiento
    last_maint.maintenance_type AS last_maintenance_type,
    last_maint.performed_at     AS last_maintenance_at,
    last_maint.next_due_at      AS next_maintenance_due
FROM drones d
LEFT JOIN users u ON u.id = d.assigned_to_user_id
-- Misión activa actual
LEFT JOIN LATERAL (
    SELECT md.mission_id
    FROM mission_drones md
    JOIN missions ms ON ms.id = md.mission_id
    WHERE md.drone_id = d.id
      AND md.left_at IS NULL
      AND ms.status IN ('active', 'paused')
    LIMIT 1
) active_md ON TRUE
LEFT JOIN missions m         ON m.id  = active_md.mission_id
LEFT JOIN missing_persons mp ON mp.id = m.missing_person_id
-- Último registro de mantenimiento
LEFT JOIN LATERAL (
    SELECT maintenance_type, performed_at, next_due_at
    FROM drone_maintenance_logs
    WHERE drone_id = d.id
    ORDER BY performed_at DESC
    LIMIT 1
) last_maint ON TRUE;


-- =============================================================================
-- 7. v_case_summary
-- Resumen de cada caso de persona desaparecida con última actividad
-- Usada en: listado de casos del admin y buscador, dashboard general
-- =============================================================================

CREATE OR REPLACE VIEW v_case_summary AS
SELECT
    mp.id,
    mp.full_name,
    mp.age_at_disappearance,
    mp.gender,
    mp.disappeared_at,
    mp.status,
    mp.last_known_location,
    -- Fotos de referencia
    COUNT(DISTINCT pp.id) FILTER (WHERE pp.is_active = TRUE)        AS active_photos,
    COUNT(DISTINCT pp.id) FILTER (WHERE pp.has_embedding = TRUE)    AS photos_with_embedding,
    -- Misiones
    COUNT(DISTINCT ms.id)                                            AS total_missions,
    COUNT(DISTINCT ms.id) FILTER (WHERE ms.status = 'active')       AS active_missions,
    -- Detecciones totales
    COUNT(DISTINCT det.id)                                           AS total_detections,
    COUNT(DISTINCT det.id) FILTER (WHERE det.facenet_similarity >= 0.80) AS high_confidence_detections,
    -- Última detección
    MAX(det.created_at)                                              AS last_detection_at,
    -- Familiares registrados
    COUNT(DISTINCT pr.user_id)                                       AS registered_relatives,
    -- Fechas
    mp.created_at                                                    AS case_created_at,
    mp.found_at                                                      AS case_closed_at
FROM missing_persons mp
LEFT JOIN person_photos pp      ON pp.missing_person_id = mp.id
LEFT JOIN missions ms           ON ms.missing_person_id = mp.id
LEFT JOIN detections det        ON det.missing_person_id = mp.id
LEFT JOIN person_relatives pr   ON pr.missing_person_id = mp.id
GROUP BY mp.id;


-- =============================================================================
-- 8. v_embedding_queue
-- Fotos activas sin embedding pendientes de procesamiento por el worker de IA
-- Usada en: worker de generación de embeddings al arrancar o en ciclo periódico
-- =============================================================================

CREATE OR REPLACE VIEW v_embedding_queue AS
SELECT
    pp.id                    AS photo_id,
    pp.missing_person_id,
    mp.full_name             AS missing_person_name,
    pp.face_angle,
    pp.quality_score,
    pp.created_at            AS photo_uploaded_at,
    -- Datos del archivo en MinIO
    f.bucket,
    f.object_key,
    f.size_bytes,
    f.mime_type
FROM person_photos pp
JOIN missing_persons mp ON mp.id = pp.missing_person_id
JOIN files f            ON f.id  = pp.file_id
WHERE pp.has_embedding = FALSE
  AND pp.is_active     = TRUE
  AND f.upload_status  = 'verified'
ORDER BY pp.created_at ASC;  -- procesar en orden de llegada (FIFO)


-- =============================================================================
-- 9. v_notification_retry_queue
-- Notificaciones pendientes o fallidas que el worker debe reintentar
-- Usada en: worker de notificaciones en su ciclo de consulta periódica
-- =============================================================================

CREATE OR REPLACE VIEW v_notification_retry_queue AS
SELECT
    nq.id              AS queue_id,
    nq.alert_id,
    nq.channel,
    nq.status,
    nq.attempts,
    nq.next_retry_at,
    nq.last_error,
    -- Datos del destinatario
    a.recipient_user_id,
    u.full_name        AS recipient_name,
    np.endpoint_address,
    -- Nivel de contenido de la alerta
    a.content_level,
    a.message_text,
    -- Persona buscada (para construir el mensaje)
    mp.full_name       AS missing_person_name,
    det.facenet_similarity,
    -- Snapshot (para adjuntar en email o push)
    f.bucket           AS snapshot_bucket,
    f.object_key       AS snapshot_object_key
FROM notification_queue nq
JOIN alerts a          ON a.id   = nq.alert_id
JOIN detections det    ON det.id = a.detection_id
JOIN missing_persons mp ON mp.id = det.missing_person_id
LEFT JOIN users u      ON u.id   = a.recipient_user_id
LEFT JOIN notification_preferences np
    ON np.user_id = a.recipient_user_id
    AND np.channel = nq.channel
    AND np.is_enabled = TRUE
LEFT JOIN files f      ON f.id   = det.snapshot_file_id
WHERE nq.status IN ('pending', 'failed')
  AND (nq.next_retry_at IS NULL OR nq.next_retry_at <= NOW())
ORDER BY nq.next_retry_at ASC NULLS FIRST;


-- =============================================================================
-- PERMISOS SOBRE VISTAS
-- =============================================================================

GRANT SELECT ON v_active_missions          TO aerofinder_app;
GRANT SELECT ON v_mission_timeline         TO aerofinder_app;
GRANT SELECT ON v_detections_full          TO aerofinder_app;
GRANT SELECT ON v_detections_sanitized     TO aerofinder_app;
GRANT SELECT ON v_alert_inbox              TO aerofinder_app;
GRANT SELECT ON v_drone_fleet              TO aerofinder_app;
GRANT SELECT ON v_case_summary             TO aerofinder_app;

-- El worker usa estas vistas en sus ciclos de procesamiento
GRANT SELECT ON v_embedding_queue          TO aerofinder_worker;
GRANT SELECT ON v_notification_retry_queue TO aerofinder_worker;

-- Auditoría legal puede ver vistas de resumen
GRANT SELECT ON v_case_summary             TO aerofinder_audit;
GRANT SELECT ON v_mission_timeline         TO aerofinder_audit;

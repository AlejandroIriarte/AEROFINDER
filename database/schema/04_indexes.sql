-- =============================================================================
-- AEROFINDER — Índices de rendimiento
-- Requiere: 03_tables.sql ejecutado previamente
-- Orden de ejecución: 01 → 02 → 03 → 04 → 05 → 06
--
-- Convenciones:
--   idx_<tabla>_<columnas>        — índice B-tree estándar
--   idx_<tabla>_<col>_partial     — índice parcial (WHERE clause)
--   idx_<tabla>_<col>_gist        — índice GiST (geometría, exclusión temporal)
--   idx_<tabla>_<col>_gin         — índice GIN (JSONB, arrays)
--   idx_<tabla>_<col>_trgm        — índice trigrama (búsqueda aproximada de texto)
--   idx_<tabla>_<col>_hnsw        — índice HNSW (pgvector, similitud coseno)
-- =============================================================================


-- =============================================================================
-- DOMINIO 1: AUTENTICACIÓN Y SESIONES
-- =============================================================================

-- Búsqueda de sesiones activas de un usuario (navbar, listado de dispositivos)
CREATE INDEX idx_user_sessions_user_id
    ON user_sessions(user_id);

-- Validación de JWT en cada request: is_revoked + expires_at evita full-scan
CREATE INDEX idx_user_sessions_active
    ON user_sessions(is_revoked, expires_at)
    WHERE is_revoked = FALSE;

-- Rate-limiting por IP: contar intentos fallidos de una IP en los últimos N minutos
CREATE INDEX idx_login_attempts_ip_time
    ON login_attempts(ip_address, attempted_at DESC);

-- Rate-limiting por email: detectar ataques de credential stuffing contra una cuenta
CREATE INDEX idx_login_attempts_email_time
    ON login_attempts(email_attempted, attempted_at DESC);

-- Preferencias de notificación habilitadas: el worker solo consulta canales activos
CREATE INDEX idx_notification_prefs_user_enabled
    ON notification_preferences(user_id)
    WHERE is_enabled = TRUE;


-- =============================================================================
-- DOMINIO 2: PERSONAS DESAPARECIDAS
-- =============================================================================

-- Listado de casos activos (pantalla principal del operador)
CREATE INDEX idx_missing_persons_status
    ON missing_persons(status);

-- Búsqueda aproximada de nombre: tolera errores tipográficos y variaciones
-- Requiere: CREATE EXTENSION pg_trgm (01_extensions.sql)
CREATE INDEX idx_missing_persons_name_trgm
    ON missing_persons USING GIN (full_name gin_trgm_ops);

-- Fotos de una persona (galería de referencia al abrir el caso)
CREATE INDEX idx_person_photos_person
    ON person_photos(missing_person_id);

-- Cola de procesamiento de embeddings: fotos activas sin embedding pendientes de worker
CREATE INDEX idx_person_photos_pending_embedding
    ON person_photos(missing_person_id, created_at)
    WHERE has_embedding = FALSE AND is_active = TRUE;

-- Familiares de una persona: determina qué usuarios reciben alertas de este caso
CREATE INDEX idx_person_relatives_person
    ON person_relatives(missing_person_id);


-- =============================================================================
-- DOMINIO 3: MODELOS DE IA Y EMBEDDINGS
-- =============================================================================

-- Modelo activo de reconocimiento facial: consultado al iniciar cada misión
CREATE INDEX idx_ai_models_active_type
    ON ai_models(model_type)
    WHERE is_active = TRUE;

-- Embeddings por modelo: necesario para recalcular al deprecar un modelo
CREATE INDEX idx_face_embeddings_model
    ON face_embeddings(model_id);

-- Índice HNSW para búsqueda por similitud coseno (pgvector)
-- Es el índice más crítico del sistema: ejecuta N comparaciones por frame procesado
-- ef_construction=128, m=16 son valores de producción recomendados para buffalo_l
-- Requiere: CREATE EXTENSION vector (01_extensions.sql)
CREATE INDEX idx_face_embeddings_hnsw
    ON face_embeddings USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 128);

-- Embeddings HNSW sobre detecciones para análisis forense y correlación histórica
CREATE INDEX idx_detections_embedding_hnsw
    ON detections USING hnsw (detection_embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 128)
    WHERE detection_embedding IS NOT NULL;


-- =============================================================================
-- DOMINIO 4: DRONES
-- =============================================================================

-- Drones disponibles para asignar a una nueva misión
CREATE INDEX idx_drones_status
    ON drones(status);

-- Historial de mantenimiento de un dron (orden cronológico inverso)
CREATE INDEX idx_drone_maintenance_drone_time
    ON drone_maintenance_logs(drone_id, performed_at DESC);


-- =============================================================================
-- DOMINIO 5: MISIONES
-- =============================================================================

-- Misiones activas o pausadas (dashboard de operaciones en curso)
CREATE INDEX idx_missions_status
    ON missions(status);

-- Misiones asociadas a una persona desaparecida (historial del caso)
CREATE INDEX idx_missions_person
    ON missions(missing_person_id);

-- Índice espacial GiST sobre el área de búsqueda
-- Permite consultas como: ¿qué misiones cubren este punto GPS?
CREATE INDEX idx_missions_search_area_gist
    ON missions USING GIST (search_area);

-- Log de misión en orden cronológico: reconstrucción de la línea de tiempo
CREATE INDEX idx_mission_events_mission_time
    ON mission_events(mission_id, occurred_at ASC);

-- Índice espacial sobre zonas de cobertura: intersección con punto de detección
CREATE INDEX idx_coverage_zones_polygon_gist
    ON mission_coverage_zones USING GIST (zone_polygon);

-- Zonas pendientes de escanear por misión (display en mapa del operador)
CREATE INDEX idx_coverage_zones_pending
    ON mission_coverage_zones(mission_id)
    WHERE status = 'pending';

-- Drones participantes en una misión activa
CREATE INDEX idx_mission_drones_mission
    ON mission_drones(mission_id);


-- =============================================================================
-- DOMINIO 6: PIPELINE IA — DETECCIONES Y ALERTAS
-- =============================================================================

-- Detecciones de una misión en orden cronológico (timeline de eventos)
CREATE INDEX idx_detections_mission_time
    ON detections(mission_id, frame_timestamp ASC);

-- Detecciones de una persona específica (historial de búsqueda)
CREATE INDEX idx_detections_person
    ON detections(missing_person_id);

-- Detecciones de alta confianza no revisadas (cola de revisión prioritaria)
CREATE INDEX idx_detections_pending_review
    ON detections(facenet_similarity DESC, created_at ASC)
    WHERE is_reviewed = FALSE;

-- Índice espacial sobre coordenadas GPS de detecciones
-- Permite: ¿qué detecciones ocurrieron a menos de 500m de este punto?
CREATE INDEX idx_detections_gps_gist
    ON detections USING GIST (gps_location)
    WHERE gps_location IS NOT NULL;

-- Alertas de un usuario ordenadas por generación (bandeja de entrada)
CREATE INDEX idx_alerts_recipient_time
    ON alerts(recipient_user_id, generated_at DESC);

-- Alertas no confirmadas de un usuario (badge de notificaciones pendientes)
CREATE INDEX idx_alerts_recipient_pending
    ON alerts(recipient_user_id, generated_at DESC)
    WHERE status IN ('generated', 'sent');

-- Cola de reintentos: el worker de notificaciones consulta esto cada N segundos
-- Incluye 'failed' para reintentos con backoff; excluye delivered/confirmed
CREATE INDEX idx_notification_queue_retry
    ON notification_queue(next_retry_at ASC)
    WHERE status IN ('pending', 'failed');


-- =============================================================================
-- DOMINIO 7: ARCHIVOS
-- =============================================================================

-- Archivos con retención vencida: job nocturno de limpieza en MinIO
CREATE INDEX idx_files_expiry
    ON files(expires_at ASC)
    WHERE expires_at IS NOT NULL AND deleted_at IS NULL;

-- Uploads pendientes de verificación de hash (proceso post-subida)
CREATE INDEX idx_files_pending_verification
    ON files(uploaded_at ASC)
    WHERE upload_status = 'uploaded';


-- =============================================================================
-- DOMINIO 8: GRABACIONES DE VIDEO
-- =============================================================================

-- Segmentos de video de una misión en orden: reconstrucción para reproductor HLS
CREATE INDEX idx_video_recordings_mission_segment
    ON video_recordings(mission_id, drone_id, segment_index ASC);


-- =============================================================================
-- DOMINIO 9: TELEMETRÍA GPS
-- =============================================================================

-- Telemetría raw de un dron en una misión en orden temporal
-- Crítico para interpolación GPS-frame: consulta los 2 puntos más cercanos al timestamp
CREATE INDEX idx_telemetry_raw_drone_mission_time
    ON drone_telemetry_raw(drone_id, mission_id, recorded_at ASC);

-- Resumen de ruta por misión en orden temporal (mapa histórico)
CREATE INDEX idx_telemetry_summary_mission_time
    ON drone_telemetry_summary(mission_id, recorded_at ASC);

-- Puntos de inflexión únicamente (vista simplificada de la ruta)
CREATE INDEX idx_telemetry_summary_inflection
    ON drone_telemetry_summary(mission_id, recorded_at ASC)
    WHERE is_inflection_point = TRUE;


-- =============================================================================
-- DOMINIO 11: AUDITORÍA
-- =============================================================================

-- Historial de cambios de un registro específico (ej: quién modificó esta misión)
CREATE INDEX idx_audit_log_record
    ON audit_log(table_name, record_id, changed_at DESC);

-- Actividad de un usuario específico (investigación de incidente)
CREATE INDEX idx_audit_log_user_time
    ON audit_log(changed_by, changed_at DESC);

-- Accesos de un usuario a datos sensibles
CREATE INDEX idx_data_access_log_user_time
    ON data_access_log(user_id, accessed_at DESC);

-- Quién accedió a un recurso sensible específico (cadena de custodia)
CREATE INDEX idx_data_access_log_resource
    ON data_access_log(resource_type, resource_id, accessed_at DESC);

-- Índice GIN sobre payload JSONB de events para búsquedas por contenido
CREATE INDEX idx_mission_events_payload_gin
    ON mission_events USING GIN (payload);

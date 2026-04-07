-- =============================================================================
-- AEROFINDER — Tablas núcleo del sistema
-- Requiere: 01_extensions.sql y 02_enums.sql ejecutados previamente
-- Orden de ejecución: 01 → 02 → 03
--
-- Orden de creación en este archivo:
--   1. roles, users, user_sessions, login_attempts, notification_preferences
--   2. files  (referenciada por person_photos, detections, video_recordings)
--   3. missing_persons, person_photos, person_relatives
--   4. ai_models, face_embeddings
--   5. drones, drone_maintenance_logs
--   6. missions, mission_drones, mission_events, mission_coverage_zones, mission_waypoints
--   7. video_recordings
--   8. detections, detection_reviews, alerts, notification_queue
--   9. drone_telemetry_raw (particionada), drone_telemetry_summary
--  10. system_config
--  11. audit_log, data_access_log
--  12. legal_consents
--  13. ALTER TABLE — FKs diferidas que resuelven dependencias circulares
-- =============================================================================


-- =============================================================================
-- DOMINIO 1: AUTENTICACIÓN Y SESIONES
-- =============================================================================

-- Catálogo inmutable de roles del sistema
CREATE TABLE roles (
    id          UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
    name        role_name NOT NULL UNIQUE,
    description TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Usuarios del sistema; cada uno tiene exactamente un rol
-- password_hash: bcrypt o argon2id, nunca texto plano
CREATE TABLE users (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    email         TEXT        NOT NULL UNIQUE,
    password_hash TEXT        NOT NULL,
    full_name     TEXT        NOT NULL,
    phone         TEXT,
    role_id       UUID        NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
    is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
    last_login_at TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT users_email_format CHECK (email LIKE '%@%')
);

-- Tokens JWT emitidos; permite revocar un token específico sin afectar otras sesiones
-- El backend valida is_revoked en cada request protegido usando el jti del JWT
CREATE TABLE user_sessions (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    jti         UUID        NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    device_name TEXT,
    ip_address  INET        NOT NULL,
    user_agent  TEXT,
    issued_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at  TIMESTAMPTZ NOT NULL,
    revoked_at  TIMESTAMPTZ,
    is_revoked  BOOLEAN     NOT NULL DEFAULT FALSE,
    CONSTRAINT sessions_revoked_has_timestamp
        CHECK (NOT is_revoked OR revoked_at IS NOT NULL)
);

-- Intentos de login para rate-limiting y detección de ataques de fuerza bruta
-- user_id SET NULL al eliminar usuario para conservar el registro de seguridad
CREATE TABLE login_attempts (
    id              BIGSERIAL   PRIMARY KEY,
    user_id         UUID        REFERENCES users(id) ON DELETE SET NULL,
    email_attempted TEXT        NOT NULL,
    ip_address      INET        NOT NULL,
    user_agent      TEXT,
    success         BOOLEAN     NOT NULL,
    failure_reason  TEXT,
    attempted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Canal de notificación preferido por usuario con su dirección de entrega
-- endpoint_address: push token, dirección de email o número telefónico según canal
CREATE TABLE notification_preferences (
    id               UUID                 PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID                 NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    channel          notification_channel NOT NULL,
    is_enabled       BOOLEAN              NOT NULL DEFAULT TRUE,
    endpoint_address TEXT,
    created_at       TIMESTAMPTZ          NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ          NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, channel)
);


-- =============================================================================
-- DOMINIO 7: ARCHIVOS
-- Definida antes de person_photos, detections y video_recordings que la referencian
-- =============================================================================

-- Catálogo centralizado de todos los archivos almacenados en MinIO
-- sha256_hash permite deduplicación: si el hash existe, se reutiliza el registro
-- La fila se conserva (deleted_at ≠ NULL) incluso tras eliminar el objeto de MinIO
CREATE TABLE files (
    id               UUID                  PRIMARY KEY DEFAULT gen_random_uuid(),
    bucket           TEXT                  NOT NULL,
    object_key       TEXT                  NOT NULL,
    sha256_hash      TEXT                  NOT NULL UNIQUE,
    size_bytes       BIGINT                NOT NULL CHECK (size_bytes > 0),
    mime_type        TEXT                  NOT NULL,
    duration_seconds INTEGER,              -- solo para videos; NULL en imágenes
    retention_policy file_retention_policy NOT NULL DEFAULT 'permanent',
    expires_at       TIMESTAMPTZ,          -- NULL si retention_policy = 'permanent'
    upload_status    file_upload_status    NOT NULL DEFAULT 'pending',
    uploaded_by      UUID                  REFERENCES users(id) ON DELETE SET NULL,
    uploaded_at      TIMESTAMPTZ           NOT NULL DEFAULT NOW(),
    deleted_at       TIMESTAMPTZ,          -- fecha de eliminación en MinIO
    UNIQUE (bucket, object_key),
    CONSTRAINT files_expiry_required
        CHECK (retention_policy = 'permanent' OR expires_at IS NOT NULL)
);


-- =============================================================================
-- DOMINIO 2: PERSONAS DESAPARECIDAS
-- =============================================================================

-- Caso de persona desaparecida con ciclo de vida completo
-- Los campos found_* se populan al cerrar el caso
-- found_in_mission_id: FK a missions agregada al final (dependencia circular)
CREATE TABLE missing_persons (
    id                   UUID                  PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name            TEXT                  NOT NULL,
    date_of_birth        DATE,
    age_at_disappearance SMALLINT              CHECK (age_at_disappearance BETWEEN 0 AND 150),
    gender               TEXT,
    physical_description TEXT,
    last_known_location  TEXT,
    last_seen_at         TIMESTAMPTZ,
    disappeared_at       DATE                  NOT NULL,
    status               missing_person_status NOT NULL DEFAULT 'active',
    -- Reportante: usuario del sistema o persona externa sin cuenta
    reported_by_user_id  UUID                  REFERENCES users(id) ON DELETE SET NULL,
    reporter_name        TEXT,                 -- nombre del reportante externo
    reporter_contact     TEXT,                 -- teléfono o email de contacto externo
    -- Datos de cierre (NULL mientras el caso está activo)
    found_at             TIMESTAMPTZ,
    found_by_user_id     UUID                  REFERENCES users(id) ON DELETE SET NULL,
    found_in_mission_id  UUID,                 -- FK diferida; se agrega con ALTER TABLE al final
    closure_notes        TEXT,
    created_at           TIMESTAMPTZ           NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ           NOT NULL DEFAULT NOW(),
    CONSTRAINT missing_persons_closure_consistency CHECK (
        -- casos activos no requieren found_at
        status = 'active'
        -- falso reporte y archivados tampoco (la persona no fue encontrada)
        OR status IN ('false_report', 'archived')
        -- solo los estados de hallazgo real exigen fecha de cierre
        OR (status IN ('found_alive', 'found_deceased') AND found_at IS NOT NULL)
    )
);

-- Fotos de referencia de la persona desaparecida con metadatos de calidad y estado de embedding
-- Una foto de perfil de 2005 con mala iluminación genera peor embedding que una foto frontal reciente
CREATE TABLE person_photos (
    id                UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
    missing_person_id UUID             NOT NULL REFERENCES missing_persons(id) ON DELETE RESTRICT,
    file_id           UUID             NOT NULL REFERENCES files(id) ON DELETE RESTRICT,
    face_angle        photo_face_angle NOT NULL DEFAULT 'unknown',
    quality_score     REAL             CHECK (quality_score BETWEEN 0.0 AND 1.0),
    has_embedding     BOOLEAN          NOT NULL DEFAULT FALSE,
    is_active         BOOLEAN          NOT NULL DEFAULT TRUE,
    uploaded_by       UUID             REFERENCES users(id) ON DELETE SET NULL,
    created_at        TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

-- Vínculo entre usuario (rol familiar) y la persona que busca
-- Determina qué alertas recibe el familiar y con qué nivel de contenido
CREATE TABLE person_relatives (
    id                UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID             NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    missing_person_id UUID             NOT NULL REFERENCES missing_persons(id) ON DELETE CASCADE,
    relation          relative_relation NOT NULL DEFAULT 'other',
    verified          BOOLEAN          NOT NULL DEFAULT FALSE,
    created_at        TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, missing_person_id)
);


-- =============================================================================
-- DOMINIO 3: MODELOS DE IA Y EMBEDDINGS
-- =============================================================================

-- Catálogo de modelos de IA desplegados en el sistema
-- embedding_dim NULL para modelos de detección (YOLO no produce embeddings)
-- Permite múltiples modelos activos simultáneamente durante una migración
CREATE TABLE ai_models (
    id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    name          TEXT          NOT NULL,
    model_type    ai_model_type NOT NULL,
    version       TEXT          NOT NULL,
    embedding_dim SMALLINT      CHECK (embedding_dim > 0),
    is_active     BOOLEAN       NOT NULL DEFAULT FALSE,
    description   TEXT,
    deployed_at   TIMESTAMPTZ,
    deprecated_at TIMESTAMPTZ,
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    UNIQUE (name, version)
);

-- Embeddings faciales de las fotos de referencia
-- Vinculados explícitamente al modelo que los generó para recalcular al cambiar de modelo
-- NOTA: vector(512) corresponde a InsightFace buffalo_l.
-- Una migración de schema es necesaria si se adopta un modelo con distinta dimensión.
CREATE TABLE face_embeddings (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    photo_id   UUID        NOT NULL REFERENCES person_photos(id) ON DELETE CASCADE,
    model_id   UUID        NOT NULL REFERENCES ai_models(id) ON DELETE RESTRICT,
    embedding  vector(512) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (photo_id, model_id)  -- una foto tiene a lo sumo un embedding por modelo
);


-- =============================================================================
-- DOMINIO 4: DRONES Y MANTENIMIENTO
-- =============================================================================

-- Catálogo de drones con estado operacional en tiempo real
-- battery_warning_pct: umbral que dispara alerta de batería baja durante el vuelo
CREATE TABLE drones (
    id                      UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    serial_number           TEXT         NOT NULL UNIQUE,
    model                   TEXT         NOT NULL,
    manufacturer            TEXT         NOT NULL DEFAULT 'DJI',
    status                  drone_status NOT NULL DEFAULT 'available',
    battery_warning_pct     SMALLINT     NOT NULL DEFAULT 20
                                CHECK (battery_warning_pct BETWEEN 5 AND 50),
    max_flight_time_minutes SMALLINT,
    assigned_to_user_id     UUID         REFERENCES users(id) ON DELETE SET NULL,
    notes                   TEXT,
    registered_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Historial de mantenimiento técnico del dron
-- Requerido por regulaciones de aviación no tripulada (DGAC, ANAC, FAA, etc.)
-- flight_hours_at_maintenance permite calcular cuándo corresponde el próximo servicio
CREATE TABLE drone_maintenance_logs (
    id                          UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
    drone_id                    UUID             NOT NULL REFERENCES drones(id) ON DELETE RESTRICT,
    maintenance_type            maintenance_type NOT NULL,
    performed_by                UUID             REFERENCES users(id) ON DELETE SET NULL,
    performed_at                TIMESTAMPTZ      NOT NULL,
    flight_hours_at_maintenance REAL,
    notes                       TEXT,
    next_due_at                 TIMESTAMPTZ,
    created_at                  TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);


-- =============================================================================
-- DOMINIO 5: MISIONES Y OPERACIONES DE CAMPO
-- =============================================================================

-- Objeto central de la operación: conecta persona buscada, drones, GPS, video y alertas
-- search_area: polígono PostGIS de la zona asignada (SRID 4326 = WGS84)
CREATE TABLE missions (
    id                UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
    name              TEXT           NOT NULL,
    description       TEXT,
    missing_person_id UUID           NOT NULL REFERENCES missing_persons(id) ON DELETE RESTRICT,
    status            mission_status NOT NULL DEFAULT 'planned',
    search_area       GEOMETRY(Polygon, 4326),
    lead_user_id      UUID           NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    planned_at        TIMESTAMPTZ,
    started_at        TIMESTAMPTZ,
    completed_at      TIMESTAMPTZ,
    notes             TEXT,
    created_at        TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    CONSTRAINT missions_dates_order CHECK (
        (started_at IS NULL OR planned_at IS NULL OR started_at >= planned_at)
        AND (completed_at IS NULL OR started_at IS NULL OR completed_at >= started_at)
    )
);

-- Asignación M:N entre drones y misiones
-- Un dron puede participar en distintas misiones; una misión puede tener múltiples drones
CREATE TABLE mission_drones (
    mission_id UUID        NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
    drone_id   UUID        NOT NULL REFERENCES drones(id) ON DELETE RESTRICT,
    joined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    left_at    TIMESTAMPTZ,
    PRIMARY KEY (mission_id, drone_id)
);

-- Log estructurado e inmutable de todos los eventos durante la misión
-- payload JSONB varía por event_type:
--   drone_takeoff      → {altitude_m, battery_pct}
--   zone_changed       → {zone_id, previous_zone_id}
--   person_detected    → {detection_id, similarity, confidence}
--   stream_lost        → {rtmp_session_id, last_frame_timestamp}
--   drone_battery_low  → {battery_pct, estimated_minutes_remaining}
CREATE TABLE mission_events (
    id          BIGSERIAL          PRIMARY KEY,
    mission_id  UUID               NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
    event_type  mission_event_type NOT NULL,
    drone_id    UUID               REFERENCES drones(id) ON DELETE SET NULL,
    user_id     UUID               REFERENCES users(id) ON DELETE SET NULL,
    occurred_at TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
    payload     JSONB              NOT NULL DEFAULT '{}'
);

-- Sub-zonas del área de búsqueda con estado de cobertura
-- Permite al operador visualizar qué áreas ya fueron escaneadas y cuáles quedan
CREATE TABLE mission_coverage_zones (
    id           UUID                   PRIMARY KEY DEFAULT gen_random_uuid(),
    mission_id   UUID                   NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
    zone_polygon GEOMETRY(Polygon, 4326) NOT NULL,
    status       coverage_zone_status   NOT NULL DEFAULT 'pending',
    drone_id     UUID                   REFERENCES drones(id) ON DELETE SET NULL,
    started_at   TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at   TIMESTAMPTZ            NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ            NOT NULL DEFAULT NOW()
);

-- Plan de vuelo previo al despegue: waypoints ordenados con altitud planeada
-- Ruta intención; la ruta real se reconstruye desde drone_telemetry_raw
CREATE TABLE mission_waypoints (
    id              UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
    mission_id      UUID             NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
    sequence_number SMALLINT         NOT NULL,
    latitude        DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN -90 AND 90),
    longitude       DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN -180 AND 180),
    altitude_m      REAL,
    created_at      TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
    UNIQUE (mission_id, sequence_number)
);


-- =============================================================================
-- DOMINIO 8: GRABACIONES DE VIDEO
-- =============================================================================

-- Segmento de video continuo generado por MediaMTX (servidor RTMP/HLS)
-- Un stream que se corta y reconecta genera múltiples segmentos en la misma misión
-- segment_index ordena cronológicamente y permite detectar huecos temporales
-- file_id NULL mientras el segmento está siendo grabado y aún no subido a MinIO
CREATE TABLE video_recordings (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    mission_id        UUID        NOT NULL REFERENCES missions(id) ON DELETE RESTRICT,
    drone_id          UUID        NOT NULL REFERENCES drones(id) ON DELETE RESTRICT,
    file_id           UUID        REFERENCES files(id) ON DELETE RESTRICT,
    segment_index     SMALLINT    NOT NULL,
    rtmp_session_id   TEXT,
    stream_started_at TIMESTAMPTZ NOT NULL,
    stream_ended_at   TIMESTAMPTZ,
    duration_seconds  INTEGER,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (mission_id, drone_id, segment_index)
);


-- =============================================================================
-- DOMINIO 6: PIPELINE IA — DETECCIONES Y ALERTAS
-- =============================================================================

-- Hecho técnico inmutable generado por el worker de IA
-- gps_location: columna PostGIS derivada de gps_lat/lon (trigger en DB-3)
-- detection_embedding: vector del rostro detectado para análisis forense y reentrenamiento
-- NOTA: vector(512) corresponde a InsightFace buffalo_l (igual que face_embeddings)
CREATE TABLE detections (
    id                   UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
    mission_id           UUID             NOT NULL REFERENCES missions(id) ON DELETE RESTRICT,
    drone_id             UUID             NOT NULL REFERENCES drones(id) ON DELETE RESTRICT,
    video_recording_id   UUID             REFERENCES video_recordings(id) ON DELETE SET NULL,
    missing_person_id    UUID             NOT NULL REFERENCES missing_persons(id) ON DELETE RESTRICT,
    detection_model_id   UUID             NOT NULL REFERENCES ai_models(id) ON DELETE RESTRICT,
    recognition_model_id UUID             NOT NULL REFERENCES ai_models(id) ON DELETE RESTRICT,
    frame_timestamp      TIMESTAMPTZ      NOT NULL,
    frame_number         BIGINT,
    yolo_confidence      REAL             NOT NULL CHECK (yolo_confidence BETWEEN 0.0 AND 1.0),
    facenet_similarity   REAL             NOT NULL CHECK (facenet_similarity BETWEEN 0.0 AND 1.0),
    bounding_box         JSONB            NOT NULL,  -- {x, y, width, height} en píxeles
    gps_latitude         DOUBLE PRECISION CHECK (gps_latitude BETWEEN -90 AND 90),
    gps_longitude        DOUBLE PRECISION CHECK (gps_longitude BETWEEN -180 AND 180),
    gps_location         GEOMETRY(Point, 4326),      -- generada por trigger en DB-3
    snapshot_file_id     UUID             REFERENCES files(id) ON DELETE SET NULL,
    detection_embedding  vector(512),
    is_reviewed          BOOLEAN          NOT NULL DEFAULT FALSE,
    created_at           TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

-- Revisión humana de una detección por un operador
-- Inmutable: una revisión no se modifica; si cambia el juicio, se agrega una nueva fila
CREATE TABLE detection_reviews (
    id           UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
    detection_id UUID              NOT NULL REFERENCES detections(id) ON DELETE CASCADE,
    reviewed_by  UUID              NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    verdict      detection_verdict NOT NULL,
    notes        TEXT,
    reviewed_at  TIMESTAMPTZ       NOT NULL DEFAULT NOW()
);

-- Decisión de negocio de notificar a un usuario específico sobre una detección
-- content_level determina qué información sensible se incluye según el rol del destinatario:
--   buscador  → full (con GPS)
--   ayudante  → partial (sin GPS)
--   familiar  → confirmation_only (foto recortada, sin ubicación)
CREATE TABLE alerts (
    id                UUID               PRIMARY KEY DEFAULT gen_random_uuid(),
    detection_id      UUID               NOT NULL REFERENCES detections(id) ON DELETE RESTRICT,
    recipient_user_id UUID               REFERENCES users(id) ON DELETE SET NULL,
    content_level     alert_content_level NOT NULL,
    status            alert_status        NOT NULL DEFAULT 'generated',
    message_text      TEXT,
    generated_at      TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
    UNIQUE (detection_id, recipient_user_id)
);

-- Cola de entrega de alertas por canal con soporte de reintentos con backoff
-- El worker de notificaciones consulta: WHERE status = 'pending' AND next_retry_at <= NOW()
-- Una alerta puede tener múltiples filas aquí si el usuario tiene push + email + sms activos
CREATE TABLE notification_queue (
    id            UUID                        PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_id      UUID                        NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
    channel       notification_channel        NOT NULL,
    status        notification_delivery_status NOT NULL DEFAULT 'pending',
    attempts      SMALLINT                    NOT NULL DEFAULT 0,
    next_retry_at TIMESTAMPTZ,
    last_error    TEXT,
    sent_at       TIMESTAMPTZ,
    delivered_at  TIMESTAMPTZ,
    created_at    TIMESTAMPTZ                 NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ                 NOT NULL DEFAULT NOW(),
    UNIQUE (alert_id, channel)
);


-- =============================================================================
-- DOMINIO 9: TELEMETRÍA GPS
-- =============================================================================

-- Telemetría raw a 10 Hz — tabla particionada por rango de fecha
-- Volumen estimado: 72.000 filas/dron por misión de 2h; 360.000 filas con 5 drones
-- Particionado por recorded_at para purga eficiente de particiones antiguas
-- FK a drones y missions se omiten intencionalmente en la tabla particionada
-- para maximizar throughput de INSERT; la integridad se garantiza en la aplicación
CREATE TABLE drone_telemetry_raw (
    id             BIGSERIAL        NOT NULL,
    drone_id       UUID             NOT NULL,
    mission_id     UUID             NOT NULL,
    recorded_at    TIMESTAMPTZ      NOT NULL,
    latitude       DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN -90 AND 90),
    longitude      DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN -180 AND 180),
    altitude_m     REAL,
    battery_pct    SMALLINT         CHECK (battery_pct BETWEEN 0 AND 100),
    heading_deg    SMALLINT         CHECK (heading_deg BETWEEN 0 AND 359),
    speed_mps      REAL             CHECK (speed_mps >= 0),
    gps_accuracy_m REAL             CHECK (gps_accuracy_m >= 0),
    PRIMARY KEY (id, recorded_at)
) PARTITION BY RANGE (recorded_at);

-- Particiones trimestrales — agregar antes de que expire la partición actual
CREATE TABLE drone_telemetry_raw_2026_q2
    PARTITION OF drone_telemetry_raw
    FOR VALUES FROM ('2026-04-01') TO ('2026-07-01');

CREATE TABLE drone_telemetry_raw_2026_q3
    PARTITION OF drone_telemetry_raw
    FOR VALUES FROM ('2026-07-01') TO ('2026-10-01');

CREATE TABLE drone_telemetry_raw_2026_q4
    PARTITION OF drone_telemetry_raw
    FOR VALUES FROM ('2026-10-01') TO ('2027-01-01');

CREATE TABLE drone_telemetry_raw_2027_q1
    PARTITION OF drone_telemetry_raw
    FOR VALUES FROM ('2027-01-01') TO ('2027-04-01');

-- Puntos de inflexión de la ruta volada — retención permanente
-- Generados post-misión por proceso de simplificación (Ramer-Douglas-Peucker)
-- Permiten visualizar la ruta histórica en el mapa sin cargar los 72.000 puntos raw
CREATE TABLE drone_telemetry_summary (
    id                  UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
    drone_id            UUID             NOT NULL REFERENCES drones(id) ON DELETE RESTRICT,
    mission_id          UUID             NOT NULL REFERENCES missions(id) ON DELETE RESTRICT,
    recorded_at         TIMESTAMPTZ      NOT NULL,
    latitude            DOUBLE PRECISION NOT NULL,
    longitude           DOUBLE PRECISION NOT NULL,
    altitude_m          REAL,
    battery_pct         SMALLINT,
    is_inflection_point BOOLEAN          NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);


-- =============================================================================
-- DOMINIO 10: CONFIGURACIÓN DINÁMICA
-- =============================================================================

-- Parámetros del sistema editables en caliente sin redesplegar workers de IA
-- El backend cachea en Redis con TTL de 30s; cambios se propagan en ≤ 30s
-- REGLA: todos los umbrales de IA se leen de aquí, nunca de variables de entorno
-- Ejemplos de claves:
--   yolo.confidence_threshold   (float, 0.0–1.0)
--   facenet.similarity_threshold (float, 0.0–1.0)
--   yolo.frame_skip             (integer, 1–30)
--   drone.telemetry_timeout_sec (integer)
--   notification.max_retries    (integer)
CREATE TABLE system_config (
    id          UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
    config_key  TEXT              NOT NULL UNIQUE,
    value_text  TEXT              NOT NULL,
    value_type  config_value_type NOT NULL DEFAULT 'string',
    description TEXT,
    min_value   TEXT,             -- límite inferior como string; cast según value_type
    max_value   TEXT,             -- límite superior como string
    updated_by  UUID              REFERENCES users(id) ON DELETE SET NULL,
    updated_at  TIMESTAMPTZ       NOT NULL DEFAULT NOW()
);


-- =============================================================================
-- DOMINIO 11: AUDITORÍA LEGAL
-- =============================================================================

-- Log inmutable de mutaciones de estado del sistema
-- Poblado por triggers en DB-3 para que no pueda saltarse desde la aplicación
-- old_values NULL en INSERT; new_values NULL en DELETE
-- session_id permite correlacionar cambios con la sesión específica del usuario
CREATE TABLE audit_log (
    id         BIGSERIAL       PRIMARY KEY,
    table_name TEXT            NOT NULL,
    record_id  TEXT            NOT NULL,
    operation  audit_operation NOT NULL,
    changed_by UUID            REFERENCES users(id) ON DELETE SET NULL,
    session_id UUID            REFERENCES user_sessions(id) ON DELETE SET NULL,
    changed_at TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    old_values JSONB,
    new_values JSONB
);

-- Log de accesos a datos sensibles (lecturas, no mutaciones)
-- Responde en un proceso judicial: ¿quién vio las coordenadas GPS de esta detección y cuándo?
-- Datos auditados: coords GPS, fotos de personas, embeddings, trazados de misión
CREATE TABLE data_access_log (
    id            BIGSERIAL               PRIMARY KEY,
    user_id       UUID                    REFERENCES users(id) ON DELETE SET NULL,
    session_id    UUID                    REFERENCES user_sessions(id) ON DELETE SET NULL,
    resource_type sensitive_resource_type NOT NULL,
    resource_id   TEXT                    NOT NULL,
    action        sensitive_access_action NOT NULL,
    ip_address    INET,
    accessed_at   TIMESTAMPTZ             NOT NULL DEFAULT NOW()
);


-- =============================================================================
-- DOMINIO 12: CONSENTIMIENTO Y CUMPLIMIENTO
-- =============================================================================

-- Registro inmutable de consentimientos legales por usuario
-- document_hash: SHA256 del texto exacto aceptado; garantiza que el documento
-- no fue modificado retroactivamente tras la aceptación
-- revoked_at: derecho al olvido; dispara proceso de borrado de datos biométricos
CREATE TABLE legal_consents (
    id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID         NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    consent_type     consent_type NOT NULL,
    document_version TEXT         NOT NULL,
    document_hash    TEXT         NOT NULL,
    accepted_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    ip_address       INET         NOT NULL,
    user_agent       TEXT,
    revoked_at       TIMESTAMPTZ,
    UNIQUE (user_id, consent_type, document_version)
);


-- =============================================================================
-- FOREIGN KEYS DIFERIDAS
-- Resuelven la dependencia circular:
--   missing_persons.found_in_mission_id → missions.id
--   missions.missing_person_id          → missing_persons.id
-- Ambas tablas debían existir antes de agregar la segunda FK
-- =============================================================================

ALTER TABLE missing_persons
    ADD CONSTRAINT fk_missing_persons_found_in_mission
    FOREIGN KEY (found_in_mission_id)
    REFERENCES missions(id)
    ON DELETE SET NULL;

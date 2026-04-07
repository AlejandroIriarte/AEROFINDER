-- =============================================================================
-- AEROFINDER — Datos semilla iniciales
-- Requiere: 07_views.sql ejecutado previamente
-- Orden de ejecución: 01 → 02 → 03 → 04 → 05 → 06 → 07 → 08
--
-- Contiene los datos mínimos para que el sistema sea funcional:
--   1. Roles de usuario
--   2. Modelos de IA registrados
--   3. Configuración dinámica del sistema (umbrales de IA y operación)
--
-- NOTA: No incluye usuarios de producción ni drones (se crean desde la app).
-- Para entornos de desarrollo, ver database/seeds/dev_data.sql (creado en BE-1).
-- =============================================================================


-- =============================================================================
-- 1. ROLES DE USUARIO
-- Catálogo fijo; los valores del ENUM role_name deben coincidir exactamente
-- =============================================================================

INSERT INTO roles (name, description) VALUES
    ('admin',    'Control total: usuarios, misiones, configuración y auditoría'),
    ('buscador', 'Piloto de dron; gestiona misiones y ve coordenadas GPS en tiempo real'),
    ('ayudante', 'Equipo en terreno; recibe alertas de detección sin coordenadas GPS'),
    ('familiar', 'Pariente de la persona buscada; solo recibe confirmación de match con foto')
ON CONFLICT (name) DO NOTHING;


-- =============================================================================
-- 2. MODELOS DE IA
-- Registra los modelos activos en producción inicial
-- embedding_dim NULL en YOLO porque no genera embeddings
-- =============================================================================

INSERT INTO ai_models (name, model_type, version, embedding_dim, is_active, description, deployed_at) VALUES
    (
        'YOLOv8n',
        'object_detection',
        '8.0.0',
        NULL,
        TRUE,
        'YOLOv8 nano — detección de siluetas de personas en frames de video. '
        'Optimizado para latencia baja en GPU NVIDIA con CUDA 13.',
        NOW()
    ),
    (
        'buffalo_l',
        'face_recognition',
        '1.0.0',
        512,
        TRUE,
        'InsightFace buffalo_l — genera embeddings faciales de 512 dimensiones. '
        'Búsqueda por similitud coseno vía pgvector con índice HNSW.',
        NOW()
    )
ON CONFLICT (name, version) DO NOTHING;


-- =============================================================================
-- 3. CONFIGURACIÓN DINÁMICA DEL SISTEMA
-- Todos los umbrales y parámetros operacionales del sistema
-- El worker de IA los lee al iniciar y los cachea en Redis con TTL de 30s
-- El Admin puede modificarlos desde el dashboard sin redesplegar
-- =============================================================================

INSERT INTO system_config (config_key, value_text, value_type, description, min_value, max_value) VALUES

    -- ─── Pipeline YOLO ──────────────────────────────────────────────────────
    (
        'yolo.confidence_threshold',
        '0.65',
        'float',
        'Confianza mínima de YOLO para considerar una detección como silueta humana válida. '
        'Valor más bajo = más detecciones pero más falsos positivos.',
        '0.1', '0.99'
    ),
    (
        'yolo.frame_skip',
        '3',
        'integer',
        'Número de frames a saltar entre cada inferencia YOLO. '
        'frame_skip=3 procesa 1 de cada 4 frames; reduce carga GPU en ~75%.',
        '1', '30'
    ),
    (
        'yolo.max_detections_per_frame',
        '10',
        'integer',
        'Máximo de siluetas a procesar por frame. '
        'Limita el procesamiento en escenas con muchas personas.',
        '1', '50'
    ),

    -- ─── Pipeline FaceNet / InsightFace ────────────────────────────────────
    (
        'facenet.similarity_threshold',
        '0.72',
        'float',
        'Similitud coseno mínima para considerar que un rostro detectado coincide '
        'con una persona desaparecida y generar una alerta. '
        'Valor más alto = menos alertas pero mayor precisión.',
        '0.5', '0.99'
    ),
    (
        'facenet.high_confidence_threshold',
        '0.88',
        'float',
        'Umbral de alta confianza para detecciones prioritarias. '
        'Detecciones sobre este umbral se marcan con prioridad en el dashboard.',
        '0.7', '0.99'
    ),
    (
        'facenet.embedding_search_limit',
        '20',
        'integer',
        'Número máximo de embeddings de referencia a comparar por cada detección. '
        'Limita el alcance de la búsqueda pgvector (HNSW ef_search).',
        '1', '100'
    ),

    -- ─── Telemetría de drones ───────────────────────────────────────────────
    (
        'drone.telemetry_timeout_seconds',
        '5',
        'integer',
        'Segundos sin recibir telemetría GPS antes de considerar al dron desconectado '
        'y registrar evento drone_failure en la misión.',
        '2', '30'
    ),
    (
        'drone.battery_warning_pct',
        '20',
        'integer',
        'Porcentaje de batería bajo el cual se registra evento drone_battery_low '
        'y se notifica al piloto. Puede sobreescribirse por dron individual.',
        '5', '50'
    ),
    (
        'drone.telemetry_raw_retention_days',
        '90',
        'integer',
        'Días de retención para la tabla drone_telemetry_raw antes de purgar particiones antiguas. '
        'Los puntos de inflexión en drone_telemetry_summary se conservan permanentemente.',
        '30', '730'
    ),

    -- ─── Notificaciones ─────────────────────────────────────────────────────
    (
        'notification.max_retries',
        '5',
        'integer',
        'Número máximo de reintentos de envío de una notificación fallida '
        'antes de marcarla como definitivamente fallida.',
        '1', '20'
    ),
    (
        'notification.retry_initial_backoff_seconds',
        '60',
        'integer',
        'Segundos de espera antes del primer reintento de notificación fallida.',
        '10', '300'
    ),
    (
        'notification.retry_max_backoff_seconds',
        '3600',
        'integer',
        'Backoff máximo en segundos entre reintentos (cap del backoff exponencial).',
        '300', '86400'
    ),

    -- ─── Archivos y retención ───────────────────────────────────────────────
    (
        'file.snapshot_retention_days',
        '365',
        'integer',
        'Días de retención de snapshots de detecciones en MinIO. '
        'Snapshots de detecciones confirmadas se marcan como permanent.',
        '30', '3650'
    ),
    (
        'file.max_photo_size_mb',
        '10',
        'integer',
        'Tamaño máximo en MB para fotos de referencia de personas desaparecidas.',
        '1', '50'
    ),
    (
        'file.max_video_segment_size_mb',
        '500',
        'integer',
        'Tamaño máximo en MB por segmento de grabación de video.',
        '100', '2000'
    ),

    -- ─── Misiones ───────────────────────────────────────────────────────────
    (
        'mission.max_active_per_person',
        '3',
        'integer',
        'Número máximo de misiones activas simultáneamente para una misma persona desaparecida.',
        '1', '10'
    ),
    (
        'mission.coverage_simplification_tolerance',
        '0.0001',
        'float',
        'Tolerancia en grados decimales para el algoritmo Ramer-Douglas-Peucker '
        'al generar drone_telemetry_summary desde los datos raw. '
        '0.0001° ≈ 11 metros en el ecuador.',
        '0.00001', '0.01'
    ),

    -- ─── Seguridad ──────────────────────────────────────────────────────────
    (
        'auth.jwt_expiry_minutes',
        '60',
        'integer',
        'Tiempo de expiración en minutos de los tokens JWT emitidos.',
        '15', '1440'
    ),
    (
        'auth.max_login_attempts',
        '5',
        'integer',
        'Número de intentos fallidos de login antes de bloquear temporalmente la cuenta.',
        '3', '20'
    ),
    (
        'auth.lockout_minutes',
        '15',
        'integer',
        'Minutos de bloqueo temporal de cuenta tras superar max_login_attempts.',
        '5', '1440'
    )

ON CONFLICT (config_key) DO NOTHING;

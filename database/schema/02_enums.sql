-- =============================================================================
-- AEROFINDER — Tipos enumerados del sistema
-- Requiere: 01_extensions.sql
-- Orden de ejecución: 01 → 02 → 03
-- =============================================================================


-- ─── DOMINIO 1: Autenticación ─────────────────────────────────────────────────

-- Roles posibles en el sistema; mutuamente excluyentes por diseño
CREATE TYPE role_name AS ENUM (
    'admin',      -- control total: usuarios, misiones, configuración
    'buscador',   -- piloto de dron; ve coordenadas GPS en tiempo real
    'ayudante',   -- equipo en terreno; recibe alertas sin coordenadas GPS
    'familiar'    -- pariente de la persona buscada; solo confirmación con foto
);

-- Canales de entrega de notificaciones
CREATE TYPE notification_channel AS ENUM ('push', 'email', 'sms');


-- ─── DOMINIO 2: Personas desaparecidas ────────────────────────────────────────

-- Ciclo de vida de un caso de búsqueda
CREATE TYPE missing_person_status AS ENUM (
    'active',          -- búsqueda en curso
    'found_alive',     -- persona encontrada con vida
    'found_deceased',  -- persona encontrada sin vida
    'false_report',    -- reporte confirmado como falso
    'archived'         -- archivado sin resolución (plazo vencido, etc.)
);

-- Ángulo del rostro en la foto de referencia; afecta la calidad del embedding
CREATE TYPE photo_face_angle AS ENUM (
    'frontal',       -- vista frontal directa (óptima para reconocimiento)
    'profile',       -- vista de perfil
    'three_quarter', -- vista de tres cuartos
    'unknown'        -- ángulo no determinado al cargar la foto
);

-- Tipo de vínculo familiar entre usuario y persona desaparecida
CREATE TYPE relative_relation AS ENUM (
    'parent', 'sibling', 'spouse', 'child',
    'grandparent', 'uncle_aunt', 'cousin',
    'friend', 'other'
);


-- ─── DOMINIO 3: IA y Embeddings ───────────────────────────────────────────────

-- Categoría funcional del modelo de IA
CREATE TYPE ai_model_type AS ENUM (
    'object_detection',  -- YOLO: detecta siluetas de personas en el frame
    'face_recognition'   -- InsightFace: genera y compara embeddings faciales
);

-- Veredicto de la revisión humana de una detección de IA
CREATE TYPE detection_verdict AS ENUM (
    'confirmed',      -- detección válida; persona identificada correctamente
    'false_positive', -- el modelo se equivocó; persona distinta o falsa alarma
    'uncertain'       -- revisión no concluyente; requiere análisis adicional
);


-- ─── DOMINIO 4: Drones ────────────────────────────────────────────────────────

-- Estado operacional del dron en tiempo real
CREATE TYPE drone_status AS ENUM (
    'available',      -- listo para misión
    'in_mission',     -- volando actualmente
    'maintenance',    -- en mantenimiento programado
    'out_of_service'  -- fuera de servicio por falla o daño
);

-- Tipo de intervención técnica registrada en el historial de mantenimiento
CREATE TYPE maintenance_type AS ENUM (
    'routine',             -- mantenimiento periódico programado
    'battery_replacement', -- reemplazo de batería (ciclos de carga agotados)
    'repair',              -- reparación por daño o falla en vuelo
    'inspection',          -- inspección técnica regulatoria (DGAC, ANAC, etc.)
    'calibration'          -- calibración de sensores IMU o gimbal
);


-- ─── DOMINIO 5: Misiones ──────────────────────────────────────────────────────

-- Ciclo de vida de una misión de búsqueda
CREATE TYPE mission_status AS ENUM (
    'planned',      -- planificada, aún no iniciada
    'active',       -- en ejecución
    'paused',       -- pausada temporalmente (mal clima, batería, etc.)
    'completed',    -- finalizada exitosamente
    'interrupted',  -- interrumpida por falla técnica o emergencia
    'cancelled'     -- cancelada antes de iniciar
);

-- Tipos de eventos registrables durante una misión (log inmutable)
CREATE TYPE mission_event_type AS ENUM (
    'mission_started',
    'drone_takeoff',
    'drone_landing',
    'zone_changed',
    'mission_paused',
    'mission_resumed',
    'person_detected',
    'stream_lost',
    'stream_reconnected',
    'drone_battery_low',
    'drone_failure',
    'mission_completed',
    'emergency_abort'
);

-- Estado de cobertura de una sub-zona de búsqueda
CREATE TYPE coverage_zone_status AS ENUM (
    'pending',     -- aún no iniciada
    'in_progress', -- siendo escaneada actualmente
    'completed',   -- escaneada completamente
    'skipped'      -- omitida (zona inaccesible, peligro, etc.)
);


-- ─── DOMINIO 6: Pipeline IA — Detecciones y Alertas ──────────────────────────

-- Estado de una alerta de detección
CREATE TYPE alert_status AS ENUM (
    'generated',  -- alerta creada, pendiente de envío
    'sent',       -- al menos un canal de entrega intentado
    'confirmed',  -- destinatario confirmó haberla leído
    'dismissed'   -- destinatario la descartó explícitamente
);

-- Nivel de contenido de la alerta según rol del destinatario
-- Controla qué información sensible se incluye en el mensaje
CREATE TYPE alert_content_level AS ENUM (
    'full',              -- incluye coordenadas GPS (solo buscadores)
    'partial',           -- alerta sin coordenadas GPS (ayudantes)
    'confirmation_only'  -- solo confirmación con foto recortada (familiares)
);

-- Estado de entrega de una notificación por canal individual
CREATE TYPE notification_delivery_status AS ENUM (
    'pending',   -- pendiente de envío
    'sent',      -- enviado al proveedor (FCM, SendGrid, Twilio, etc.)
    'delivered', -- confirmación de entrega del proveedor
    'failed',    -- envío fallido; se agendará reintento
    'confirmed'  -- leída o confirmada por el destinatario
);


-- ─── DOMINIO 7: Archivos ──────────────────────────────────────────────────────

-- Política de retención de archivos en MinIO
CREATE TYPE file_retention_policy AS ENUM (
    'permanent',        -- retención indefinida (fotos de referencia, evidencia judicial)
    'mission_lifetime', -- se retiene mientras la misión esté activa; se elimina al cerrar
    'days_30',          -- retención de 30 días
    'days_90',          -- retención de 90 días
    'days_365'          -- retención de 1 año
);

-- Estado del proceso de subida de un archivo a MinIO
CREATE TYPE file_upload_status AS ENUM (
    'pending',  -- upload iniciado pero no completado
    'uploaded', -- bytes en MinIO pero hash no verificado aún
    'verified', -- hash SHA256 verificado contra el registrado en DB
    'deleted'   -- eliminado de MinIO; fila se conserva para auditoría
);


-- ─── DOMINIO 10: Configuración dinámica ──────────────────────────────────────

-- Tipo de valor almacenado en system_config (para validación y casting en aplicación)
CREATE TYPE config_value_type AS ENUM (
    'string',  -- texto libre
    'integer', -- número entero
    'float',   -- número decimal
    'boolean', -- true / false
    'json'     -- objeto o array JSON complejo
);


-- ─── DOMINIO 11: Auditoría legal ─────────────────────────────────────────────

-- Tipo de operación DML registrada en audit_log
CREATE TYPE audit_operation AS ENUM ('INSERT', 'UPDATE', 'DELETE');

-- Tipo de recurso sensible cuyo acceso se registra en data_access_log
CREATE TYPE sensitive_resource_type AS ENUM (
    'detection_gps_coords',  -- coordenadas GPS interpoladas de una detección
    'person_photo',          -- foto de referencia de la persona desaparecida
    'face_embedding',        -- vector biométrico facial (dato sensible GDPR art. 9)
    'mission_gps_track',     -- trazado GPS completo de una misión
    'person_identity_data',  -- datos personales de la persona desaparecida
    'alert_location'         -- ubicación incluida en el contenido de una alerta
);

-- Tipo de acción de acceso a dato sensible
CREATE TYPE sensitive_access_action AS ENUM (
    'view',     -- visualización en pantalla
    'export',   -- exportación a archivo externo
    'download', -- descarga directa del archivo
    'search'    -- consulta que retorna datos sensibles en resultados
);


-- ─── DOMINIO 12: Consentimiento y cumplimiento ───────────────────────────────

-- Tipo de consentimiento legal requerido por el sistema
CREATE TYPE consent_type AS ENUM (
    'terms_of_service',          -- términos y condiciones de uso de la plataforma
    'privacy_policy',            -- política de privacidad y tratamiento de datos
    'biometric_data_processing', -- procesamiento de datos biométricos (GDPR art. 9)
    'gps_tracking_consent'       -- registro permanente de telemetría GPS del piloto
);

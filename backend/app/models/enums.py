# =============================================================================
# AEROFINDER Backend — Enums Python que mapean los tipos PostgreSQL
#
# IMPORTANTE: create_type=False en todos los SAEnum — los tipos ya existen
# en la base de datos (creados por 02_enums.sql). SQLAlchemy no debe
# intentar emitir CREATE TYPE al generar o ejecutar migraciones.
#
# Patrón de uso en mapped_column():
#   status: Mapped[MissionStatus] = mapped_column(
#       SAEnum(MissionStatus, name='mission_status', create_type=False)
#   )
# =============================================================================

import enum

from sqlalchemy import Enum as SAEnum


# ── DOMINIO 1: Autenticación ──────────────────────────────────────────────────

class RoleName(str, enum.Enum):
    admin    = "admin"
    buscador = "buscador"
    ayudante = "ayudante"
    familiar = "familiar"


class NotificationChannel(str, enum.Enum):
    push  = "push"
    email = "email"
    sms   = "sms"


# ── DOMINIO 2: Personas desaparecidas ─────────────────────────────────────────

class MissingPersonStatus(str, enum.Enum):
    pending_review   = "pending_review"
    active           = "active"
    found_alive      = "found_alive"
    found_deceased   = "found_deceased"
    false_report     = "false_report"
    archived         = "archived"


class PhotoFaceAngle(str, enum.Enum):
    frontal       = "frontal"
    profile       = "profile"
    three_quarter = "three_quarter"
    unknown       = "unknown"


class RelativeRelation(str, enum.Enum):
    parent      = "parent"
    sibling     = "sibling"
    spouse      = "spouse"
    child       = "child"
    grandparent = "grandparent"
    uncle_aunt  = "uncle_aunt"
    cousin      = "cousin"
    friend      = "friend"
    other       = "other"


# ── DOMINIO 3: IA y Embeddings ────────────────────────────────────────────────

class AIModelType(str, enum.Enum):
    object_detection = "object_detection"
    face_recognition = "face_recognition"


class DetectionVerdict(str, enum.Enum):
    confirmed      = "confirmed"
    false_positive = "false_positive"
    uncertain      = "uncertain"


# ── DOMINIO 4: Drones ─────────────────────────────────────────────────────────

class DroneStatus(str, enum.Enum):
    available      = "available"
    in_mission     = "in_mission"
    maintenance    = "maintenance"
    out_of_service = "out_of_service"


class MaintenanceType(str, enum.Enum):
    routine              = "routine"
    battery_replacement  = "battery_replacement"
    repair               = "repair"
    inspection           = "inspection"
    calibration          = "calibration"


# ── DOMINIO 5: Misiones ───────────────────────────────────────────────────────

class MissionStatus(str, enum.Enum):
    planned     = "planned"
    active      = "active"
    paused      = "paused"
    completed   = "completed"
    interrupted = "interrupted"
    cancelled   = "cancelled"


class MissionEventType(str, enum.Enum):
    mission_started     = "mission_started"
    drone_takeoff       = "drone_takeoff"
    drone_landing       = "drone_landing"
    zone_changed        = "zone_changed"
    mission_paused      = "mission_paused"
    mission_resumed     = "mission_resumed"
    person_detected     = "person_detected"
    stream_lost         = "stream_lost"
    stream_reconnected  = "stream_reconnected"
    drone_battery_low   = "drone_battery_low"
    drone_failure       = "drone_failure"
    mission_completed   = "mission_completed"
    emergency_abort     = "emergency_abort"


class CoverageZoneStatus(str, enum.Enum):
    pending     = "pending"
    in_progress = "in_progress"
    completed   = "completed"
    skipped     = "skipped"


# ── DOMINIO 6: Pipeline IA — Detecciones y Alertas ───────────────────────────

class AlertStatus(str, enum.Enum):
    generated = "generated"
    sent      = "sent"
    confirmed = "confirmed"
    dismissed = "dismissed"


class AlertContentLevel(str, enum.Enum):
    full              = "full"
    partial           = "partial"
    confirmation_only = "confirmation_only"


class NotificationDeliveryStatus(str, enum.Enum):
    pending   = "pending"
    sent      = "sent"
    delivered = "delivered"
    failed    = "failed"
    confirmed = "confirmed"


# ── DOMINIO 7: Archivos ───────────────────────────────────────────────────────

class FileRetentionPolicy(str, enum.Enum):
    permanent        = "permanent"
    mission_lifetime = "mission_lifetime"
    days_30          = "days_30"
    days_90          = "days_90"
    days_365         = "days_365"


class FileUploadStatus(str, enum.Enum):
    pending  = "pending"
    uploaded = "uploaded"
    verified = "verified"
    deleted  = "deleted"


# ── DOMINIO 10: Configuración dinámica ───────────────────────────────────────

class ConfigValueType(str, enum.Enum):
    string  = "string"
    integer = "integer"
    float_  = "float"    # nombre Python: float_ para evitar colisión con builtin
    boolean = "boolean"
    json    = "json"


# ── DOMINIO 11: Auditoría legal ───────────────────────────────────────────────

class AuditOperation(str, enum.Enum):
    INSERT = "INSERT"
    UPDATE = "UPDATE"
    DELETE = "DELETE"


class SensitiveResourceType(str, enum.Enum):
    detection_gps_coords = "detection_gps_coords"
    person_photo         = "person_photo"
    face_embedding       = "face_embedding"
    mission_gps_track    = "mission_gps_track"
    person_identity_data = "person_identity_data"
    alert_location       = "alert_location"


class SensitiveAccessAction(str, enum.Enum):
    view     = "view"
    export   = "export"
    download = "download"
    search   = "search"


# ── DOMINIO 12: Consentimiento y cumplimiento ─────────────────────────────────

class ConsentType(str, enum.Enum):
    terms_of_service          = "terms_of_service"
    privacy_policy            = "privacy_policy"
    biometric_data_processing = "biometric_data_processing"
    gps_tracking_consent      = "gps_tracking_consent"


# =============================================================================
# Instancias SAEnum reutilizables con create_type=False
# Importar estos objetos en los mapped_column() de cada modelo
# =============================================================================

SANotificationChannel        = SAEnum(NotificationChannel,        name="notification_channel",          create_type=False)
SARoleName                   = SAEnum(RoleName,                   name="role_name",                     create_type=False)
SAMissingPersonStatus        = SAEnum(MissingPersonStatus,        name="missing_person_status",          create_type=False)
SAPhotoFaceAngle             = SAEnum(PhotoFaceAngle,             name="photo_face_angle",               create_type=False)
SARelativeRelation           = SAEnum(RelativeRelation,           name="relative_relation",              create_type=False)
SAAIModelType                = SAEnum(AIModelType,                name="ai_model_type",                  create_type=False)
SADetectionVerdict           = SAEnum(DetectionVerdict,           name="detection_verdict",              create_type=False)
SADroneStatus                = SAEnum(DroneStatus,                name="drone_status",                   create_type=False)
SAMaintenanceType            = SAEnum(MaintenanceType,            name="maintenance_type",               create_type=False)
SAMissionStatus              = SAEnum(MissionStatus,              name="mission_status",                 create_type=False)
SAMissionEventType           = SAEnum(MissionEventType,           name="mission_event_type",             create_type=False)
SACoverageZoneStatus         = SAEnum(CoverageZoneStatus,         name="coverage_zone_status",           create_type=False)
SAAlertStatus                = SAEnum(AlertStatus,                name="alert_status",                   create_type=False)
SAAlertContentLevel          = SAEnum(AlertContentLevel,          name="alert_content_level",            create_type=False)
SANotificationDeliveryStatus = SAEnum(NotificationDeliveryStatus, name="notification_delivery_status",   create_type=False)
SAFileRetentionPolicy        = SAEnum(FileRetentionPolicy,        name="file_retention_policy",          create_type=False)
SAFileUploadStatus           = SAEnum(FileUploadStatus,           name="file_upload_status",             create_type=False)
SAConfigValueType            = SAEnum(ConfigValueType,            name="config_value_type",              create_type=False)
SAAuditOperation             = SAEnum(AuditOperation,            name="audit_operation",                create_type=False)
SASensitiveResourceType      = SAEnum(SensitiveResourceType,      name="sensitive_resource_type",        create_type=False)
SASensitiveAccessAction      = SAEnum(SensitiveAccessAction,      name="sensitive_access_action",        create_type=False)
SAConsentType                = SAEnum(ConsentType,                name="consent_type",                   create_type=False)

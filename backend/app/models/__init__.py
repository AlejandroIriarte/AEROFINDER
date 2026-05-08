# =============================================================================
# AEROFINDER Backend — Importa todos los modelos para Alembic autogenerate
# Alembic lee Base.metadata; todos los modelos deben importarse aquí
# =============================================================================

from app.db.base import Base  # noqa: F401 — registra metadata

# Importar modelos en orden de dependencia para evitar errores de FK
from app.models.auth import (  # noqa: F401
    Role,
    User,
    UserSession,
    LoginAttempt,
    NotificationPreference,
)
from app.models.files import File  # noqa: F401
from app.models.persons import (  # noqa: F401
    MissingPerson,
    PersonPhoto,
    PersonRelative,
)
from app.models.ai import AIModel, FaceEmbedding  # noqa: F401
from app.models.drones import Drone, DroneMaintenanceLog  # noqa: F401
from app.models.missions import (  # noqa: F401
    Mission,
    MissionDrone,
    MissionEvent,
    MissionCoverageZone,
    MissionWaypoint,
)
from app.models.video import VideoRecording  # noqa: F401
from app.models.pipeline import (  # noqa: F401
    Detection,
    DetectionReview,
    Alert,
    NotificationQueue,
)
from app.models.telemetry import (  # noqa: F401
    DroneTelemetryRaw,
    DroneTelemetrySummary,
)
from app.models.system import SystemConfig  # noqa: F401
from app.models.audit import AuditLog, DataAccessLog  # noqa: F401
from app.models.legal import LegalConsent  # noqa: F401

__all__ = [
    "Base",
    "Role",
    "User",
    "UserSession",
    "LoginAttempt",
    "NotificationPreference",
    "File",
    "MissingPerson",
    "PersonPhoto",
    "PersonRelative",
    "AIModel",
    "FaceEmbedding",
    "Drone",
    "DroneMaintenanceLog",
    "Mission",
    "MissionDrone",
    "MissionEvent",
    "MissionCoverageZone",
    "MissionWaypoint",
    "VideoRecording",
    "Detection",
    "DetectionReview",
    "Alert",
    "NotificationQueue",
    "DroneTelemetryRaw",
    "DroneTelemetrySummary",
    "SystemConfig",
    "AuditLog",
    "DataAccessLog",
    "LegalConsent",
]

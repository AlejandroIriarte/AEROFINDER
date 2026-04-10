# =============================================================================
# AEROFINDER Backend — Configuración de la aplicación
# Lee variables de entorno; lanza error explícito si falta una requerida
# =============================================================================

from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import field_validator


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Base de datos ────────────────────────────────────────────────────────
    database_url: str

    # ── Redis ────────────────────────────────────────────────────────────────
    redis_url: str = "redis://redis:6379"
    redis_stream_telemetry: str = "aerofinder:telemetry"
    redis_stream_detections: str = "aerofinder:detections"
    redis_stream_notifications: str = "aerofinder:notifications"

    # ── MinIO ────────────────────────────────────────────────────────────────
    minio_url: str = "http://minio:9000"
    minio_access_key: str
    minio_secret_key: str
    minio_secure: bool = False
    minio_bucket_snapshots: str = "aerofinder-snapshots"
    minio_bucket_photos: str = "aerofinder-photos"
    minio_bucket_videos: str = "aerofinder-videos"

    # ── MediaMTX ─────────────────────────────────────────────────────────────
    mediamtx_api_url: str = "http://mediamtx:9997"

    # ── JWT ──────────────────────────────────────────────────────────────────
    secret_key: str
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60
    refresh_token_expire_days: int = 7

    # ── Notificaciones externas (opcionales; en desarrollo solo se loguean) ──
    fcm_server_key: str | None = None
    sendgrid_api_key: str | None = None
    sendgrid_from_email: str = "noreply@aerofinder.bo"
    twilio_account_sid: str | None = None
    twilio_auth_token: str | None = None
    twilio_from_number: str | None = None

    # ── Aplicación ───────────────────────────────────────────────────────────
    environment: str = "production"
    backend_cors_origins: str = "http://localhost:3000"

    @field_validator("backend_cors_origins", mode="before")
    @classmethod
    def parse_cors(cls, v: str) -> str:
        # Acepta string separado por coma; se divide en main.py
        return v

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.backend_cors_origins.split(",")]


settings = Settings()  # type: ignore[call-arg]

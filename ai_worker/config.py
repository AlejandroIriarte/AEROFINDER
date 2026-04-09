# =============================================================================
# AEROFINDER AI Worker — Configuración desde variables de entorno
# =============================================================================

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Base de datos ────────────────────────────────────────────────────────
    # Rol aerofinder_worker: permisos de solo lectura en la mayoría de tablas
    # y escritura en detections, drone_telemetry_raw, drone_telemetry_summary
    database_url: str

    # ── Redis ────────────────────────────────────────────────────────────────
    redis_url: str = "redis://redis:6379"
    redis_stream_telemetry: str = "aerofinder:telemetry"
    redis_stream_detections: str = "aerofinder:detections"

    # ── MinIO ────────────────────────────────────────────────────────────────
    minio_url: str = "http://minio:9000"
    minio_access_key: str
    minio_secret_key: str
    minio_secure: bool = False
    minio_bucket_snapshots: str = "aerofinder-snapshots"

    # ── MediaMTX ─────────────────────────────────────────────────────────────
    mediamtx_rtsp_url: str = "rtsp://mediamtx:8554"
    mediamtx_api_url: str = "http://mediamtx:9997"

    # ── Modelos de IA ────────────────────────────────────────────────────────
    models_dir: str = "/models"
    yolo_model_path: str = "/models/yolov8n.pt"
    insightface_model_dir: str = "/models/insightface"

    # ── Identidad del dron que este worker procesa ───────────────────────────
    # UUID del dron asignado; define qué misión activa se procesa y qué
    # stream RTSP se abre (mediamtx_rtsp_url/{drone_id})
    drone_id: str


settings = Settings()  # type: ignore[call-arg]

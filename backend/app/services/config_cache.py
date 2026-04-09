# =============================================================================
# AEROFINDER Backend — Caché de configuración dinámica desde system_config
# Lee los umbrales de IA y parámetros operacionales con TTL configurable.
# REGLA: todos los umbrales de IA se leen de aquí, nunca de os.getenv().
# =============================================================================

import asyncio
import json
import logging
from datetime import datetime
from typing import Any, Optional

from sqlalchemy import select

from app.db.session import AsyncSessionLocal
from app.models.enums import ConfigValueType
from app.models.system import SystemConfig

logger = logging.getLogger(__name__)


class ConfigCache:
    """
    Caché en memoria de la tabla system_config con TTL configurable.
    Thread-safe mediante asyncio.Lock para evitar múltiples recargas simultáneas.
    """

    # ── Claves predefinidas de configuración ──────────────────────────────────
    YOLO_CONFIDENCE         = "yolo.confidence_threshold"
    YOLO_FRAME_SKIP         = "yolo.frame_skip"
    FACENET_SIMILARITY      = "facenet.similarity_threshold"
    FACENET_BBOX_MIN_PCT    = "facenet.bbox_coverage_min_pct"
    TELEMETRY_GPS_WINDOW_MS = "telemetry.gps_interpolation_window_ms"
    NOTIFICATION_RETRY_MAX  = "notification.retry_max_attempts"
    NOTIFICATION_RETRY_BACKOFF = "notification.retry_backoff_seconds"
    DRONE_TELEMETRY_TIMEOUT = "drone.telemetry_timeout_seconds"
    DRONE_BATTERY_WARNING   = "drone.battery_warning_threshold_pct"

    def __init__(self, ttl_seconds: int = 30) -> None:
        self._ttl_seconds = ttl_seconds
        self._cache: dict[str, Any] = {}
        self._loaded_at: Optional[datetime] = None
        # Lock para serializar recargas concurrentes
        self._lock = asyncio.Lock()

    def _is_expired(self) -> bool:
        """Retorna True si el caché no fue cargado o superó el TTL."""
        if self._loaded_at is None:
            return True
        elapsed = (datetime.utcnow() - self._loaded_at).total_seconds()
        return elapsed >= self._ttl_seconds

    def _parse_value(self, value_text: str, value_type: ConfigValueType) -> Any:
        """
        Convierte value_text al tipo Python según value_type del registro en DB.
        En caso de error de parseo retorna el string original.
        """
        try:
            if value_type == ConfigValueType.integer:
                return int(value_text)
            if value_type == ConfigValueType.float_:
                return float(value_text)
            if value_type == ConfigValueType.boolean:
                return value_text.strip().lower() in ("true", "1", "yes", "on")
            if value_type == ConfigValueType.json:
                return json.loads(value_text)
            # string y cualquier valor desconocido
            return value_text
        except (ValueError, json.JSONDecodeError):
            logger.error(
                "Error al parsear valor de config: key desconocido, "
                "value_type=%s value_text=%s",
                value_type, value_text,
                exc_info=True,
            )
            return value_text

    async def _reload(self) -> None:
        """
        Recarga todos los registros de system_config desde la base de datos.
        Debe llamarse solo con el _lock adquirido.
        """
        try:
            async with AsyncSessionLocal() as session:
                result = await session.execute(
                    select(
                        SystemConfig.config_key,
                        SystemConfig.value_text,
                        SystemConfig.value_type,
                    )
                )
                rows = result.all()

            nuevo_cache: dict[str, Any] = {}
            for row in rows:
                nuevo_cache[row.config_key] = self._parse_value(
                    row.value_text, row.value_type
                )

            self._cache = nuevo_cache
            self._loaded_at = datetime.utcnow()
            logger.debug("ConfigCache recargado: %d parámetros cargados", len(nuevo_cache))
        except Exception:
            logger.error(
                "Error al recargar system_config desde la base de datos",
                exc_info=True,
            )

    async def get(self, key: str, default: Any = None) -> Any:
        """
        Retorna el valor del parámetro indicado.
        Si el caché expiró, recarga desde DB antes de responder.
        """
        async with self._lock:
            if self._is_expired():
                await self._reload()
        return self._cache.get(key, default)

    async def get_float(self, key: str, default: float = 0.0) -> float:
        """Retorna el parámetro casteado a float. Usa default si falla."""
        value = await self.get(key, default)
        try:
            return float(value)
        except (ValueError, TypeError):
            logger.error(
                "No se pudo castear a float: key=%s value=%s", key, value, exc_info=True
            )
            return default

    async def get_int(self, key: str, default: int = 0) -> int:
        """Retorna el parámetro casteado a int. Usa default si falla."""
        value = await self.get(key, default)
        try:
            return int(value)
        except (ValueError, TypeError):
            logger.error(
                "No se pudo castear a int: key=%s value=%s", key, value, exc_info=True
            )
            return default

    async def get_bool(self, key: str, default: bool = False) -> bool:
        """Retorna el parámetro casteado a bool. Usa default si falla."""
        value = await self.get(key, default)
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            return value.strip().lower() in ("true", "1", "yes", "on")
        try:
            return bool(value)
        except (ValueError, TypeError):
            logger.error(
                "No se pudo castear a bool: key=%s value=%s", key, value, exc_info=True
            )
            return default

    async def invalidate(self) -> None:
        """
        Invalida el caché para forzar recarga en el próximo get.
        Usar cuando el sistema_config es modificado desde el endpoint de admin.
        """
        async with self._lock:
            self._loaded_at = None
        logger.debug("ConfigCache invalidado manualmente")


# Singleton compartido por toda la aplicación
config_cache = ConfigCache()

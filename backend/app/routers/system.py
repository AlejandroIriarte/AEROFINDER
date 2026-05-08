# =============================================================================
# AEROFINDER Backend — Router: Configuración Dinámica del Sistema
# REGLA: todos los umbrales de IA se leen de aquí, nunca de os.getenv().
# Endpoints: GET /config, GET /config/{key}, PATCH /config/{key}
# =============================================================================

import logging
import os

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import CurrentUser, get_current_user, require_role
from app.db.session import get_db
from app.models.enums import RoleName
from app.models.system import SystemConfig
from app.schemas.system import ConfigResponse, ConfigUpdate
from app.services.config_cache import config_cache

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/config", tags=["configuración"])

_admin = require_role(RoleName.admin)
# Todos los roles autenticados pueden leer la configuración (los workers también la leen)
_any_auth = get_current_user


@router.get("/network-info")
async def get_network_info(
    _: CurrentUser = Depends(_admin),
) -> dict:
    """
    Devuelve las URLs de red del servidor para configurar drones DJI y acceso HLS.
    Solo admin. La IP se lee de SERVER_HOST (actualizada con aerofinder.sh ip <nueva_ip>).
    """
    host = os.getenv("SERVER_HOST", "localhost")
    return {
        "server_ip": host,
        "rtmp_port": 1935,
        "hls_port": 8888,
        "rtmp_url_template": f"rtmp://{host}:1935/{{serial}}",
        "hls_url_template": f"http://{host}:8888/{{serial}}/index.m3u8",
        "rtsp_url_template": f"rtsp://{host}:8554/{{serial}}",
    }


@router.get("/", response_model=list[ConfigResponse])
async def list_config(
    _: CurrentUser = Depends(_any_auth),
    db: AsyncSession = Depends(get_db),
) -> list[ConfigResponse]:
    """
    Lista todos los parámetros de configuración.
    Todos los roles autenticados pueden leer.
    """
    try:
        result = await db.execute(select(SystemConfig).order_by(SystemConfig.config_key))
        configs = result.scalars().all()
    except Exception:
        logger.error("Error al listar configuración del sistema", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

    return [ConfigResponse.model_validate(c) for c in configs]


@router.get("/{config_key}", response_model=ConfigResponse)
async def get_config(
    config_key: str,
    _: CurrentUser = Depends(_any_auth),
    db: AsyncSession = Depends(get_db),
) -> ConfigResponse:
    """Obtiene un parámetro de configuración por clave."""
    try:
        result = await db.execute(
            select(SystemConfig).where(SystemConfig.config_key == config_key)
        )
        config: SystemConfig | None = result.scalar_one_or_none()
    except Exception:
        logger.error("Error al obtener config key=%s", config_key, exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

    if config is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Clave de configuración no encontrada")

    return ConfigResponse.model_validate(config)


@router.patch("/{config_key}", response_model=ConfigResponse)
async def update_config(
    config_key: str,
    body: ConfigUpdate,
    current_user: CurrentUser = Depends(_admin),
    db: AsyncSession = Depends(get_db),
) -> ConfigResponse:
    """
    Actualiza el valor de un parámetro de configuración.
    Solo admin. El cambio se propaga a los workers en ≤ 30s (via caché Redis en BE-5).
    """
    try:
        result = await db.execute(
            select(SystemConfig).where(SystemConfig.config_key == config_key)
        )
        config: SystemConfig | None = result.scalar_one_or_none()
    except Exception:
        logger.error("Error al buscar config key=%s", config_key, exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

    if config is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Clave de configuración no encontrada")

    config.value_text = body.value_text
    config.updated_by = current_user.id

    # Invalidar caché para que los workers lean el nuevo valor en el próximo ciclo
    await config_cache.invalidate()

    return ConfigResponse.model_validate(config)

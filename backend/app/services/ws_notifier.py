# =============================================================================
# AEROFINDER Backend — Notificador de alertas via WebSocket
#
# Filtra el payload según el rol del destinatario antes de emitir.
# Los familiares y ayudantes no reciben coordenadas GPS de la detección.
# =============================================================================

import logging
import uuid
from typing import Any

from app.core.ws_manager import ws_manager

logger = logging.getLogger(__name__)

# Roles con acceso a coordenadas GPS de las detecciones
_GPS_ALLOWED_ROLES = {"admin", "buscador"}

# Campos GPS que se ocultan a familiar y ayudante
_GPS_FIELDS = {"gps_lat", "gps_lng", "gps_latitude", "gps_longitude", "lat", "lng", "gps"}


async def notify_via_websocket(
    user_id: uuid.UUID,
    alert_data: dict[str, Any],
    role: str,
) -> None:
    """
    Emite una alerta al frontend vía WebSocket con filtrado por rol.

    Filtrado de campos según rol:
      buscador / admin  → payload completo (incluye GPS)
      ayudante          → sin coordenadas GPS
      familiar          → sin coordenadas GPS

    Salas a las que se emite:
      mission:{mission_id}  → siempre (si mission_id está en alert_data)
      alerts                → solo admin y buscador
    """
    # Construir el payload base con tipo "alert"
    payload: dict[str, Any] = {
        "type": "alert",
        **alert_data,
    }

    # Filtrar coordenadas GPS para roles sin permiso de ubicación exacta
    if role not in _GPS_ALLOWED_ROLES:
        for gps_field in _GPS_FIELDS:
            payload.pop(gps_field, None)

    mission_id = alert_data.get("mission_id")
    if mission_id:
        try:
            await ws_manager.broadcast(f"mission:{mission_id}", payload)
            logger.debug(
                "Alerta emitida por WS: room=mission:%s role=%s user=%s",
                mission_id, role, user_id,
            )
        except Exception:
            logger.error(
                "Error al emitir alerta WS al room mission:%s", mission_id, exc_info=True
            )

    # Emitir al canal global de alertas solo para roles operacionales
    if role in _GPS_ALLOWED_ROLES:
        try:
            await ws_manager.broadcast("alerts", payload)
        except Exception:
            logger.error(
                "Error al emitir alerta WS al room alerts", exc_info=True
            )

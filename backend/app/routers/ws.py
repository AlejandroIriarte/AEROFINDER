# =============================================================================
# AEROFINDER Backend — Router: WebSockets en tiempo real
#
# Endpoints:
#   WS /ws/missions/{mission_id}   — actualizaciones de misión
#   WS /ws/telemetry/{drone_id}    — telemetría GPS del dron
#   WS /ws/alerts                  — alertas de IA del sistema
#
# Autenticación: query param ?token=<jwt> (los WS no soportan cabeceras Bearer)
# Los mensajes entrantes del cliente solo se usan como keepalive (ping).
# Los mensajes salientes los emite el servidor vía ws_manager.broadcast().
# =============================================================================

import logging
import uuid
from typing import Any

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect, WebSocketException, status
from jose import JWTError
from sqlalchemy import select

from app.core.security import decode_access_token
from app.core.ws_manager import ws_manager
from app.db.session import AsyncSessionLocal, set_db_session_context
from app.models.auth import User, UserSession
from app.models.enums import RoleName
from app.models.persons import PersonRelative

logger = logging.getLogger(__name__)
router = APIRouter(tags=["websockets"])

# ── Tipos de mensaje saliente ─────────────────────────────────────────────────
# Usados por ws_manager.broadcast() desde BE-5, AI-1, AI-3, etc.
#   mission_update  → cambio de estado de misión
#   telemetry       → coordenadas GPS + batería del dron
#   detection       → detección de IA (bounding box, confianza)
#   alert           → alerta generada por el pipeline
#   ping            → keepalive del servidor


async def _authenticate_ws(token: str) -> dict[str, Any] | None:
    """
    Valida el JWT del query param y devuelve el payload si es válido.
    Retorna None si el token es inválido o la sesión está revocada.
    """
    try:
        payload = decode_access_token(token)
        user_id = uuid.UUID(payload["sub"])
        jti = uuid.UUID(payload["jti"])
        role_str: str = payload["role"]
    except (JWTError, KeyError, ValueError):
        return None

    async with AsyncSessionLocal() as db:
        try:
            await set_db_session_context(db, user_id, role_str)
            result = await db.execute(
                select(UserSession, User)
                .join(User, UserSession.user_id == User.id)
                .where(
                    UserSession.jti == jti,
                    UserSession.is_revoked.is_(False),
                    User.id == user_id,
                    User.is_active.is_(True),
                )
            )
            row = result.first()
            if row is None:
                return None
        except Exception:
            logger.error("Error al validar sesión WS", exc_info=True)
            return None

    return {
        "user_id": user_id,
        "role": RoleName(role_str),
        "jti": jti,
    }


async def _familiar_owns_mission(user_id: uuid.UUID, mission_id: uuid.UUID) -> bool:
    """
    Verifica que el familiar tiene una persona vinculada con esa misión.
    Evita que vea misiones de otros casos.
    """
    from app.models.missions import Mission

    async with AsyncSessionLocal() as db:
        try:
            result = await db.execute(
                select(Mission.id)
                .join(PersonRelative, Mission.missing_person_id == PersonRelative.missing_person_id)
                .where(
                    Mission.id == mission_id,
                    PersonRelative.user_id == user_id,
                )
            )
            return result.scalar_one_or_none() is not None
        except Exception:
            logger.error("Error al verificar misión para familiar user=%s", user_id, exc_info=True)
            return False


# ── WS /ws/missions/{mission_id} ─────────────────────────────────────────────

@router.websocket("/ws/missions/{mission_id}")
async def ws_mission(
    websocket: WebSocket,
    mission_id: uuid.UUID,
    token: str = Query(..., description="JWT de acceso"),
) -> None:
    """
    Canal de actualizaciones de una misión.
    - familiar: solo puede conectarse si está vinculado a esa misión.
    - ayudante, buscador, admin: acceso libre.
    Mensajes esperados del servidor: mission_update, detection, alert, ping.
    """
    auth = await _authenticate_ws(token)
    if auth is None:
        raise WebSocketException(code=status.WS_1008_POLICY_VIOLATION, reason="No autenticado")

    role: RoleName = auth["role"]

    # Familiar solo puede ver misiones de sus personas vinculadas
    if role == RoleName.familiar:
        allowed = await _familiar_owns_mission(auth["user_id"], mission_id)
        if not allowed:
            raise WebSocketException(code=status.WS_1008_POLICY_VIOLATION, reason="Acceso denegado")

    room_id = f"mission:{mission_id}"
    await ws_manager.connect(websocket, room_id)

    try:
        # Confirmación de conexión
        await ws_manager.send_personal(websocket, {
            "type": "connected",
            "room": room_id,
        })

        # Bucle keepalive: cliente puede enviar ping; servidor responde pong
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await ws_manager.send_personal(websocket, {"type": "pong"})
    except WebSocketDisconnect:
        logger.debug("WS desconectado room=%s user=%s", room_id, auth["user_id"])
    finally:
        ws_manager.disconnect(websocket, room_id)


# ── WS /ws/telemetry/{drone_id} ──────────────────────────────────────────────

@router.websocket("/ws/telemetry/{drone_id}")
async def ws_telemetry(
    websocket: WebSocket,
    drone_id: uuid.UUID,
    token: str = Query(..., description="JWT de acceso"),
) -> None:
    """
    Canal de telemetría GPS en tiempo real de un dron.
    Solo admin y buscador (datos operacionales sensibles).
    Mensajes del servidor: telemetry (lat, lng, altitude_m, battery_pct, speed_mps).
    """
    auth = await _authenticate_ws(token)
    if auth is None:
        raise WebSocketException(code=status.WS_1008_POLICY_VIOLATION, reason="No autenticado")

    role: RoleName = auth["role"]
    if role not in (RoleName.admin, RoleName.buscador):
        raise WebSocketException(code=status.WS_1008_POLICY_VIOLATION, reason="Permiso insuficiente")

    room_id = f"telemetry:{drone_id}"
    await ws_manager.connect(websocket, room_id)

    try:
        await ws_manager.send_personal(websocket, {
            "type": "connected",
            "room": room_id,
        })
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await ws_manager.send_personal(websocket, {"type": "pong"})
    except WebSocketDisconnect:
        logger.debug("WS desconectado room=%s user=%s", room_id, auth["user_id"])
    finally:
        ws_manager.disconnect(websocket, room_id)


# ── WS /ws/alerts ─────────────────────────────────────────────────────────────

@router.websocket("/ws/alerts")
async def ws_alerts(
    websocket: WebSocket,
    token: str = Query(..., description="JWT de acceso"),
) -> None:
    """
    Canal global de alertas del pipeline de IA.
    Admin, buscador y ayudante. Familiar no tiene acceso (usa /ws/missions).
    Mensajes del servidor: alert (mission_id, person_id, confidence, location).
    """
    auth = await _authenticate_ws(token)
    if auth is None:
        raise WebSocketException(code=status.WS_1008_POLICY_VIOLATION, reason="No autenticado")

    role: RoleName = auth["role"]
    if role == RoleName.familiar:
        raise WebSocketException(code=status.WS_1008_POLICY_VIOLATION, reason="Permiso insuficiente")

    room_id = "alerts"
    await ws_manager.connect(websocket, room_id)

    try:
        await ws_manager.send_personal(websocket, {
            "type": "connected",
            "room": room_id,
        })
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await ws_manager.send_personal(websocket, {"type": "pong"})
    except WebSocketDisconnect:
        logger.debug("WS desconectado room=%s user=%s", room_id, auth["user_id"])
    finally:
        ws_manager.disconnect(websocket, room_id)

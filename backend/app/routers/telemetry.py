# =============================================================================
# AEROFINDER Backend — Router: Ingesta de telemetría GPS desde app Android DJI
#
# Endpoints:
#   WS  /ws/ingest/telemetry?stream_key=<key>  — ingesta en tiempo real
#   POST /telemetry/ingest                      — alternativa HTTP
#
# Flujo por mensaje:
#   Parseo → Redis Stream → drone_telemetry_raw → drone update →
#   drone_telemetry_summary (si aplica) → broadcast WS frontend
# =============================================================================

import json
import logging
import uuid
from collections import defaultdict, deque
from datetime import datetime, timezone
from typing import Optional

import redis.asyncio as aioredis
from fastapi import APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect, status
from pydantic import ValidationError
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.ws_manager import ws_manager
from app.db.session import AsyncSessionLocal
from app.models.drones import Drone
from app.models.telemetry import DroneTelemetryRaw, DroneTelemetrySummary
from app.schemas.telemetry import TelemetryIngest, TelemetryWSMessage

logger = logging.getLogger(__name__)

router = APIRouter(tags=["telemetría"])

# UUID sentinel para operaciones de sistema (sin usuario autenticado)
_SYSTEM_USER_ID = uuid.UUID("00000000-0000-0000-0000-000000000000")

# ── Rate limiting en memoria para el endpoint REST ────────────────────────────
# dict[drone_id_str → deque[timestamp_float]]
_request_timestamps: dict[str, deque] = defaultdict(lambda: deque(maxlen=100))
_RATE_LIMIT_RPS    = 20   # requests por segundo antes de loguear warning
_RATE_LIMIT_WINDOW = 1.0  # ventana en segundos

# ── Thresholds para decidir si guardar punto en telemetry_summary ─────────────
_SUMMARY_HEADING_DELTA_DEG  = 15.0   # grados de cambio de rumbo
_SUMMARY_SPEED_DELTA_MPS    = 2.0    # m/s de cambio de velocidad
_SUMMARY_MAX_INTERVAL_S     = 30.0   # segundos máximos sin guardar un punto


# ── Helpers de DB ─────────────────────────────────────────────────────────────

async def _get_drone_by_stream_key(stream_key: str) -> Optional[Drone]:
    """
    Busca el dron cuyo serial_number coincide con el stream_key.
    Retorna el objeto Drone o None si no existe.
    """
    try:
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(Drone).where(Drone.serial_number == stream_key)
            )
            return result.scalar_one_or_none()
    except Exception:
        logger.error(
            "Error al validar stream_key=%s contra tabla drones", stream_key, exc_info=True
        )
        return None


async def _insert_telemetry_raw(
    session: AsyncSession,
    payload: TelemetryIngest,
) -> None:
    """Inserta un punto de telemetría en drone_telemetry_raw."""
    recorded_at = datetime.fromtimestamp(payload.timestamp, tz=timezone.utc)
    raw = DroneTelemetryRaw(
        drone_id=payload.drone_id,
        mission_id=payload.mission_id,
        recorded_at=recorded_at,
        latitude=payload.lat,
        longitude=payload.lng,
        altitude_m=payload.altitude_m,
        battery_pct=payload.battery_pct,
        heading_deg=int(payload.heading_deg),
        speed_mps=payload.speed_mps,
    )
    session.add(raw)


async def _insert_telemetry_summary(
    session: AsyncSession,
    payload: TelemetryIngest,
) -> None:
    """
    Inserta un punto de inflexión en drone_telemetry_summary.
    is_inflection_point=False porque el marcado definitivo lo hace
    el algoritmo Ramer-Douglas-Peucker en post-procesamiento de misión.
    """
    recorded_at = datetime.fromtimestamp(payload.timestamp, tz=timezone.utc)
    summary = DroneTelemetrySummary(
        drone_id=payload.drone_id,
        mission_id=payload.mission_id,
        recorded_at=recorded_at,
        latitude=payload.lat,
        longitude=payload.lng,
        altitude_m=payload.altitude_m,
        battery_pct=payload.battery_pct,
        is_inflection_point=False,
    )
    session.add(summary)


async def _update_drone_last_telemetry(
    session: AsyncSession,
    payload: TelemetryIngest,
) -> None:
    """
    Actualiza los campos de última telemetría conocida en la tabla drones.
    Usa SQL raw porque las columnas last_telemetry_at, last_known_lat,
    last_known_lng, last_known_alt se agregan en una migración futura.
    Falla silenciosamente si las columnas aún no existen.
    """
    try:
        recorded_at = datetime.fromtimestamp(payload.timestamp, tz=timezone.utc)
        await session.execute(
            text(
                """
                UPDATE drones
                SET last_telemetry_at = :ts,
                    last_known_lat    = :lat,
                    last_known_lng    = :lng,
                    last_known_alt    = :alt,
                    updated_at        = NOW()
                WHERE id = :drone_id
                """
            ),
            {
                "ts":       recorded_at,
                "lat":      payload.lat,
                "lng":      payload.lng,
                "alt":      payload.altitude_m,
                "drone_id": str(payload.drone_id),
            },
        )
    except Exception:
        # Las columnas aún no existen en el schema actual; solo actualizamos updated_at
        logger.warning(
            "Columnas last_telemetry_at/last_known_* no existen aún en drones; "
            "actualizando solo updated_at para drone_id=%s",
            payload.drone_id,
        )
        try:
            await session.execute(
                text("UPDATE drones SET updated_at = NOW() WHERE id = :drone_id"),
                {"drone_id": str(payload.drone_id)},
            )
        except Exception:
            logger.error(
                "Error al actualizar updated_at para drone_id=%s",
                payload.drone_id, exc_info=True,
            )


async def _publish_to_redis(payload: TelemetryIngest) -> None:
    """
    Publica el punto de telemetría en el Redis Stream aerofinder:telemetry.
    El schema del mensaje debe coincidir con lo que consume gps_interpolator.py (AI-1).
    """
    try:
        redis_client = aioredis.from_url(settings.redis_url, decode_responses=True)
        message = {
            "drone_id":    str(payload.drone_id),
            "stream_key":  payload.stream_key,
            "mission_id":  str(payload.mission_id),
            "timestamp":   payload.timestamp,
            "lat":         payload.lat,
            "lng":         payload.lng,
            "altitude_m":  payload.altitude_m,
            "heading_deg": payload.heading_deg,
            "speed_mps":   payload.speed_mps,
            "battery_pct": payload.battery_pct,
        }
        await redis_client.xadd(
            settings.redis_stream_telemetry,
            {"data": json.dumps(message, ensure_ascii=False)},
        )
        await redis_client.aclose()
    except Exception:
        logger.error(
            "Error al publicar telemetría en Redis Stream para drone_id=%s",
            payload.drone_id, exc_info=True,
        )


def _should_save_summary(
    payload: TelemetryIngest,
    last_heading: Optional[float],
    last_speed: Optional[float],
    last_summary_ts: float,
) -> bool:
    """
    Determina si el punto actual merece guardarse en drone_telemetry_summary.
    Criterios: cambio de rumbo > 15°, cambio de velocidad > 2 m/s,
    o han pasado > 30 s desde el último punto guardado.
    """
    if last_heading is None or last_speed is None:
        return True  # siempre guardar el primer punto

    heading_delta = abs(payload.heading_deg - last_heading)
    speed_delta   = abs(payload.speed_mps   - last_speed)
    time_delta    = payload.timestamp - last_summary_ts

    return (
        heading_delta > _SUMMARY_HEADING_DELTA_DEG
        or speed_delta > _SUMMARY_SPEED_DELTA_MPS
        or time_delta  > _SUMMARY_MAX_INTERVAL_S
    )


async def _process_telemetry(
    payload: TelemetryIngest,
    last_heading: Optional[float],
    last_speed: Optional[float],
    last_summary_ts: float,
) -> tuple[float, float, float]:
    """
    Ejecuta los pasos 2-6 del flujo de ingesta:
      2. Redis Stream
      3. drone_telemetry_raw
      4. Update drones
      5. drone_telemetry_summary (si aplica)
      6. Broadcast WebSocket frontend

    Retorna (new_heading, new_speed, new_summary_ts).
    """
    # ── 2. Publicar en Redis Stream ───────────────────────────────────────────
    await _publish_to_redis(payload)

    # ── 3-5. Escrituras en DB en una sola transacción ─────────────────────────
    save_summary = _should_save_summary(
        payload, last_heading, last_speed, last_summary_ts
    )
    new_summary_ts = payload.timestamp if save_summary else last_summary_ts

    try:
        async with AsyncSessionLocal() as session:
            async with session.begin():
                # SET LOCAL para que los triggers de auditoría usen el ID de sistema
                await session.execute(
                    text(f"SET LOCAL aerofinder.current_user_id = '{str(_SYSTEM_USER_ID)}'")
                )
                await session.execute(
                    text("SET LOCAL aerofinder.current_user_role = 'system'")
                )

                # 3. Insertar telemetría raw (alta frecuencia)
                await _insert_telemetry_raw(session, payload)

                # 4. Actualizar última posición conocida del dron
                await _update_drone_last_telemetry(session, payload)

                # 5. Insertar punto de inflexión si aplica
                if save_summary:
                    await _insert_telemetry_summary(session, payload)
    except Exception:
        logger.error(
            "Error al persistir telemetría en DB para drone_id=%s",
            payload.drone_id, exc_info=True,
        )

    # ── 6. Broadcast al canal WebSocket del frontend ──────────────────────────
    ws_message = TelemetryWSMessage(
        drone_id=payload.drone_id,
        mission_id=payload.mission_id,
        lat=payload.lat,
        lng=payload.lng,
        altitude_m=payload.altitude_m,
        battery_pct=payload.battery_pct,
        heading_deg=payload.heading_deg,
        speed_mps=payload.speed_mps,
        timestamp=payload.timestamp,
    )
    await ws_manager.broadcast(
        f"telemetry:{payload.drone_id}",
        ws_message.model_dump(),
    )

    return payload.heading_deg, payload.speed_mps, new_summary_ts


# ── WebSocket: /ws/ingest/telemetry ──────────────────────────────────────────

@router.websocket("/ws/ingest/telemetry")
async def ws_ingest_telemetry(
    websocket: WebSocket,
    stream_key: str = Query(..., description="stream_key del dron (= serial_number)"),
) -> None:
    """
    Endpoint WebSocket para ingesta de telemetría desde la app Android DJI.
    Autenticación por stream_key (= serial_number del dron en la DB).
    Cierra con WS_1008 si el stream_key no corresponde a ningún dron registrado.
    """
    # ── Validar stream_key contra la DB ──────────────────────────────────────
    drone = await _get_drone_by_stream_key(stream_key)
    if drone is None:
        logger.warning(
            "Conexión rechazada: stream_key desconocido=%s", stream_key
        )
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await websocket.accept()
    logger.info(
        "Dron conectado vía WS: drone_id=%s serial=%s",
        drone.id, drone.serial_number,
    )

    # ── Estado interno de la conexión ────────────────────────────────────────
    last_heading:    Optional[float] = None
    last_speed:      Optional[float] = None
    last_summary_ts: float           = 0.0
    msg_count:       int             = 0

    try:
        while True:
            # Recibir mensaje del dron (JSON como texto)
            try:
                raw = await websocket.receive_text()
            except WebSocketDisconnect:
                raise  # propagar para que lo maneje el bloque finally

            # Parsear y validar el payload
            try:
                data = json.loads(raw)
                payload = TelemetryIngest(**data)
            except (json.JSONDecodeError, ValidationError) as exc:
                logger.warning(
                    "Mensaje de telemetría inválido desde drone_id=%s: %s",
                    drone.id, exc,
                )
                continue

            # Procesar el mensaje (pasos 2-6)
            last_heading, last_speed, last_summary_ts = await _process_telemetry(
                payload, last_heading, last_speed, last_summary_ts
            )

            msg_count += 1
            # Log cada 10 mensajes para no saturar
            if msg_count % 10 == 0:
                logger.info(
                    "Telemetría procesada: drone_id=%s mensajes=%d "
                    "lat=%.6f lng=%.6f alt=%.1f bat=%d%%",
                    drone.id, msg_count,
                    payload.lat, payload.lng,
                    payload.altitude_m, payload.battery_pct,
                )

    except WebSocketDisconnect:
        logger.info(
            "Dron desconectado: drone_id=%s serial=%s mensajes_procesados=%d",
            drone.id, drone.serial_number, msg_count,
        )
    except Exception:
        logger.error(
            "Error inesperado en WS de telemetría drone_id=%s",
            drone.id, exc_info=True,
        )
    finally:
        try:
            await websocket.close()
        except Exception:
            pass


# ── REST: POST /telemetry/ingest ─────────────────────────────────────────────

@router.post("/telemetry/ingest", status_code=status.HTTP_200_OK)
async def http_ingest_telemetry(
    payload: TelemetryIngest,
) -> dict:
    """
    Alternativa HTTP para dispositivos que no soporten WebSocket.
    Acepta el mismo schema que el endpoint WS.
    Rate limiting conceptual: loguea warning si un dron supera 20 req/s.
    """
    drone_key = str(payload.drone_id)

    # ── Rate limiting conceptual ──────────────────────────────────────────────
    import time as _time
    now = _time.time()
    ts_queue = _request_timestamps[drone_key]
    ts_queue.append(now)

    # Contar cuántas requests llegaron en la última ventana de 1s
    cutoff = now - _RATE_LIMIT_WINDOW
    recent = sum(1 for t in ts_queue if t >= cutoff)
    if recent > _RATE_LIMIT_RPS:
        logger.warning(
            "Rate limit superado para drone_id=%s: %d req en la última %.1fs",
            payload.drone_id, recent, _RATE_LIMIT_WINDOW,
        )

    # ── Validar stream_key ────────────────────────────────────────────────────
    drone = await _get_drone_by_stream_key(payload.stream_key)
    if drone is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="stream_key no corresponde a ningún dron registrado",
        )

    # ── Procesar telemetría (pasos 2-6) ───────────────────────────────────────
    # Sin estado de sesión persistente en HTTP: no hay deltas disponibles,
    # por lo que siempre se evalúa como primer punto (guarda en summary).
    try:
        await _process_telemetry(
            payload,
            last_heading=None,
            last_speed=None,
            last_summary_ts=0.0,
        )
    except Exception:
        logger.error(
            "Error al procesar telemetría HTTP para drone_id=%s",
            payload.drone_id, exc_info=True,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error al procesar el punto de telemetría",
        )

    return {"status": "ok"}

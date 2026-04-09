# =============================================================================
# AEROFINDER Backend — Worker de entrega de notificaciones
#
# Polling de notification_queue cada 5 segundos.
# Para cada entrada pendiente: llama al handler del canal (push/email/sms),
# actualiza el estado y maneja reintentos con backoff exponencial.
#
# La tabla notification_queue no tiene columnas user_id ni payload;
# se obtienen vía JOIN con alerts y notification_preferences.
# =============================================================================

import asyncio
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from sqlalchemy import text

from app.db.session import AsyncSessionLocal
from app.services.config_cache import config_cache
from app.services.notification_handlers import (
    send_email_notification,
    send_push_notification,
    send_sms_notification,
)
from app.services.ws_notifier import notify_via_websocket

logger = logging.getLogger(__name__)

# ── Constantes de operación ───────────────────────────────────────────────────
_POLL_INTERVAL_S  = 5.0    # segundos entre ciclos de polling
_BATCH_SIZE       = 20     # filas máximas por ciclo
_PARALLEL_SIZE    = 5      # notificaciones en paralelo por ciclo
_BACKOFF_STEPS    = [5, 10, 30]  # backoff de conexión DB en segundos

# Valor por defecto si system_config no responde
_DEFAULT_RETRY_MAX     = 3
_DEFAULT_RETRY_BACKOFF = 60.0  # segundos

# Fecha lejana para marcar fallos permanentes sin eliminar la fila
_FAR_FUTURE = datetime(9999, 12, 31, tzinfo=timezone.utc)


# ── Query principal ───────────────────────────────────────────────────────────
# Joinea con alerts para obtener recipient_user_id y message_text,
# y con notification_preferences para obtener endpoint_address del canal.
_SELECT_PENDING_SQL = text(
    """
    SELECT
        nq.id                       AS queue_id,
        nq.alert_id,
        nq.channel,
        nq.attempts,
        a.recipient_user_id,
        a.message_text,
        a.content_level,
        a.detection_id,
        np.endpoint_address,
        u.email                     AS user_email,
        u.phone                     AS user_phone,
        r.name                      AS user_role
    FROM notification_queue nq
    JOIN alerts a ON a.id = nq.alert_id
    LEFT JOIN users u ON u.id = a.recipient_user_id
    LEFT JOIN roles r ON r.id = u.role_id
    LEFT JOIN notification_preferences np
        ON np.user_id = a.recipient_user_id
       AND np.channel = nq.channel
       AND np.is_enabled = TRUE
    WHERE nq.status IN ('pending', 'failed')
      AND (nq.next_retry_at IS NULL OR nq.next_retry_at <= NOW())
    ORDER BY nq.next_retry_at ASC NULLS FIRST
    LIMIT :limit
    """
)


# ── Helpers de DB ─────────────────────────────────────────────────────────────

async def _mark_sent(queue_id: uuid.UUID) -> None:
    """Marca la notificación como enviada exitosamente."""
    try:
        async with AsyncSessionLocal() as session:
            async with session.begin():
                await session.execute(
                    text(
                        """
                        UPDATE notification_queue
                        SET status   = 'sent',
                            sent_at  = NOW(),
                            updated_at = NOW()
                        WHERE id = :qid
                        """
                    ),
                    {"qid": str(queue_id)},
                )
    except Exception:
        logger.error(
            "Error al marcar notificación como sent: id=%s", queue_id, exc_info=True
        )


async def _mark_failed(
    queue_id: uuid.UUID,
    attempts: int,
    error_msg: str,
    retry_max: int,
    retry_backoff: float,
) -> None:
    """
    Actualiza la fila con el resultado del fallo:
    - Si attempts >= retry_max: status='failed', next_retry_at lejano (fallo permanente).
    - Si no: status='failed', next_retry_at = backoff exponencial.
    Nota: no existe status 'failed_permanent' en el enum actual;
    se usa next_retry_at=9999 para evitar re-pickup.
    """
    new_attempts = attempts + 1
    is_permanent = new_attempts >= retry_max

    if is_permanent:
        next_retry_at = _FAR_FUTURE
        logger.warning(
            "Notificación id=%s alcanzó el máximo de reintentos (%d); "
            "marcada como fallo permanente",
            queue_id, retry_max,
        )
    else:
        # Backoff exponencial: retry_backoff * 2^(attempts)
        delay_s = retry_backoff * (2 ** attempts)
        next_retry_at = datetime.now(timezone.utc) + timedelta(seconds=delay_s)
        logger.info(
            "Notificación id=%s fallida; reintento %d/%d en %.0fs",
            queue_id, new_attempts, retry_max, delay_s,
        )

    try:
        async with AsyncSessionLocal() as session:
            async with session.begin():
                await session.execute(
                    text(
                        """
                        UPDATE notification_queue
                        SET status         = 'failed',
                            attempts       = :attempts,
                            next_retry_at  = :next_retry_at,
                            last_error     = :last_error,
                            updated_at     = NOW()
                        WHERE id = :qid
                        """
                    ),
                    {
                        "qid":           str(queue_id),
                        "attempts":      new_attempts,
                        "next_retry_at": next_retry_at,
                        "last_error":    error_msg[:500],  # truncar mensajes largos
                    },
                )
    except Exception:
        logger.error(
            "Error al marcar notificación como failed: id=%s", queue_id, exc_info=True
        )


# ── Procesamiento de una notificación ─────────────────────────────────────────

async def _process_one(
    row: Any,
    retry_max: int,
    retry_backoff: float,
) -> None:
    """
    Intenta entregar una notificación según su canal.
    Actualiza el estado en DB según el resultado.
    También emite el evento por WebSocket al frontend.
    """
    queue_id   = row.queue_id
    channel    = str(row.channel)
    attempts   = int(row.attempts)
    role       = str(row.user_role) if row.user_role else "buscador"
    message    = row.message_text or "AEROFINDER: nueva detección"

    # Dirección de destino: endpoint_address tiene prioridad;
    # si no está configurado, se usa email/phone del usuario
    endpoint  = row.endpoint_address
    user_email = row.user_email
    user_phone = row.user_phone

    # Emitir también vía WebSocket (no bloquea el resultado del handler)
    if row.recipient_user_id and row.detection_id:
        try:
            alert_data = {
                "alert_id":    str(row.alert_id),
                "detection_id": str(row.detection_id),
                "mission_id":  None,  # sin join a detections en esta query
                "message":     message,
                "content_level": str(row.content_level),
            }
            await notify_via_websocket(
                user_id=row.recipient_user_id,
                alert_data=alert_data,
                role=role,
            )
        except Exception:
            logger.error(
                "Error al emitir alerta por WS para queue_id=%s", queue_id, exc_info=True
            )

    # ── Llamar al handler según canal ─────────────────────────────────────────
    success = False
    error_msg = ""

    try:
        if channel == "push":
            token = endpoint or ""
            if not token:
                logger.warning(
                    "Sin push token para queue_id=%s; omitiendo", queue_id
                )
                success = True  # no reintentar si no hay token
            else:
                success = await send_push_notification(
                    token=token,
                    title="AEROFINDER — Detección",
                    body=message,
                    data={
                        "alert_id":     str(row.alert_id),
                        "detection_id": str(row.detection_id) if row.detection_id else "",
                    },
                )

        elif channel == "email":
            to_addr = endpoint or user_email or ""
            if not to_addr:
                logger.warning(
                    "Sin dirección de email para queue_id=%s; omitiendo", queue_id
                )
                success = True
            else:
                body_html = (
                    f"<p>{message}</p>"
                    f"<p><small>AEROFINDER — Sistema de búsqueda de personas desaparecidas</small></p>"
                )
                success = await send_email_notification(
                    to_email=to_addr,
                    subject="AEROFINDER — Alerta de detección",
                    body_html=body_html,
                )

        elif channel == "sms":
            to_phone = endpoint or user_phone or ""
            if not to_phone:
                logger.warning(
                    "Sin número de teléfono para queue_id=%s; omitiendo", queue_id
                )
                success = True
            else:
                # SMS limitado a 160 caracteres
                sms_body = message[:157] + "..." if len(message) > 160 else message
                success = await send_sms_notification(
                    to_phone=to_phone,
                    message=sms_body,
                )

        else:
            logger.warning(
                "Canal desconocido '%s' para queue_id=%s; ignorando",
                channel, queue_id,
            )
            success = True

    except Exception as exc:
        error_msg = str(exc)
        logger.error(
            "Excepción en handler canal=%s queue_id=%s: %s",
            channel, queue_id, error_msg, exc_info=True,
        )
        success = False

    # ── Actualizar estado en DB ───────────────────────────────────────────────
    if success:
        await _mark_sent(queue_id)
        logger.info(
            "Notificación enviada: queue_id=%s canal=%s", queue_id, channel
        )
    else:
        if not error_msg:
            error_msg = f"Handler de canal '{channel}' retornó False"
        await _mark_failed(
            queue_id=queue_id,
            attempts=attempts,
            error_msg=error_msg,
            retry_max=retry_max,
            retry_backoff=retry_backoff,
        )


# ── Worker principal ───────────────────────────────────────────────────────────

async def run_notification_worker() -> None:
    """
    Worker de polling para la tabla notification_queue.
    Ciclo cada 5 segundos; procesa hasta 20 filas en batches de 5 en paralelo.
    Implementa backoff exponencial (5s→10s→30s) si la DB no responde.
    """
    logger.info("Worker de notificaciones iniciado (polling cada %ds)", int(_POLL_INTERVAL_S))
    backoff_idx = 0

    while True:
        try:
            # ── Leer config dinámica ──────────────────────────────────────────
            retry_max     = await config_cache.get_int(
                config_cache.NOTIFICATION_RETRY_MAX, default=_DEFAULT_RETRY_MAX
            )
            retry_backoff = await config_cache.get_float(
                config_cache.NOTIFICATION_RETRY_BACKOFF, default=_DEFAULT_RETRY_BACKOFF
            )

            # ── Obtener lote de notificaciones pendientes ─────────────────────
            async with AsyncSessionLocal() as session:
                result = await session.execute(
                    _SELECT_PENDING_SQL, {"limit": _BATCH_SIZE}
                )
                rows = result.mappings().all()

            if not rows:
                backoff_idx = 0  # resetear backoff al operar normalmente
                await asyncio.sleep(_POLL_INTERVAL_S)
                continue

            logger.debug(
                "Worker de notificaciones: %d entradas pendientes a procesar", len(rows)
            )

            # ── Procesar en batches de _PARALLEL_SIZE en paralelo ─────────────
            for i in range(0, len(rows), _PARALLEL_SIZE):
                batch = rows[i : i + _PARALLEL_SIZE]
                await asyncio.gather(
                    *[
                        _process_one(row, retry_max, retry_backoff)
                        for row in batch
                    ],
                    return_exceptions=True,  # no abortar el gather si uno falla
                )

            backoff_idx = 0
            await asyncio.sleep(_POLL_INTERVAL_S)

        except Exception:
            wait = _BACKOFF_STEPS[min(backoff_idx, len(_BACKOFF_STEPS) - 1)]
            logger.error(
                "Error en el worker de notificaciones; reintentando en %ds",
                wait, exc_info=True,
            )
            await asyncio.sleep(wait)
            backoff_idx += 1

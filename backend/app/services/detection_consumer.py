# =============================================================================
# AEROFINDER Backend — Consumer del Redis Stream aerofinder:detections
#
# Lee mensajes publicados por el worker de IA (AI-1), persiste las detecciones
# en PostgreSQL, sube snapshots a MinIO y emite eventos por WebSocket.
#
# Flujo por mensaje:
#   Redis Stream → parseo JSON → MinIO (snapshot) → INSERT detections
#   → INSERT alerts (si face_match) → broadcast WebSocket → XACK
# =============================================================================

import asyncio
import base64
import hashlib
import json
import logging
import socket
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

import redis.asyncio as aioredis
from sqlalchemy import select, text

from app.config import settings
from app.core.ws_manager import ws_manager
from app.db.session import AsyncSessionLocal
from app.models.ai import AIModel
from app.models.enums import (
    AIModelType,
    AlertContentLevel,
    AlertStatus,
    FileRetentionPolicy,
    FileUploadStatus,
)
from app.models.files import File
from app.models.missions import Mission
from app.models.pipeline import Alert, Detection
from app.services.config_cache import config_cache
from app.services.minio_service import minio_service

logger = logging.getLogger(__name__)

# ── Constantes del consumer ───────────────────────────────────────────────────
_CONSUMER_GROUP    = "backend-consumers"
_CONSUMER_NAME     = f"backend-{socket.gethostname()}"

# UUID centinela para operaciones del consumer (sin usuario humano autenticado)
_SYSTEM_USER_ID = uuid.UUID("00000000-0000-0000-0000-000000000000")
_STREAM_KEY        = settings.redis_stream_detections
_DEAD_LETTER_KEY   = f"{settings.redis_stream_detections}:dead_letter"
_MAX_BATCH         = 10      # mensajes por iteración XREADGROUP
_MAX_FAILURES      = 3       # intentos antes de mover al dead-letter
_BACKOFF_BASE      = 1.0     # segundos base del backoff exponencial
_BACKOFF_MAX       = 30.0    # tope del backoff

# IDs de modelos activos: se resuelven una vez al arrancar el consumer
_detection_model_id: Optional[uuid.UUID]   = None
_recognition_model_id: Optional[uuid.UUID] = None


# ── Helpers de DB ─────────────────────────────────────────────────────────────

async def _resolve_active_models() -> None:
    """
    Consulta los IDs de los modelos de IA activos (YOLO e InsightFace).
    Se ejecuta una sola vez al inicio; los IDs se cachean en variables globales.
    """
    global _detection_model_id, _recognition_model_id
    try:
        async with AsyncSessionLocal() as session:
            # Modelo de detección de objetos (YOLOv8n)
            result = await session.execute(
                select(AIModel.id).where(
                    AIModel.model_type == AIModelType.object_detection,
                    AIModel.is_active.is_(True),
                ).limit(1)
            )
            _detection_model_id = result.scalar_one_or_none()

            # Modelo de reconocimiento facial (InsightFace buffalo_l)
            result = await session.execute(
                select(AIModel.id).where(
                    AIModel.model_type == AIModelType.face_recognition,
                    AIModel.is_active.is_(True),
                ).limit(1)
            )
            _recognition_model_id = result.scalar_one_or_none()

        logger.info(
            "Modelos IA resueltos: detection=%s recognition=%s",
            _detection_model_id, _recognition_model_id,
        )
    except Exception:
        logger.error("Error al resolver IDs de modelos IA activos", exc_info=True)


async def _get_mission_person_id(
    session: Any, mission_id: uuid.UUID
) -> Optional[uuid.UUID]:
    """Retorna el missing_person_id de la misión dada."""
    try:
        result = await session.execute(
            select(Mission.missing_person_id).where(Mission.id == mission_id)
        )
        return result.scalar_one_or_none()
    except Exception:
        logger.error(
            "Error al obtener missing_person_id de misión %s", mission_id, exc_info=True
        )
        return None


# ── Lógica de procesamiento de un mensaje ────────────────────────────────────

async def _handle_message(message_id: str, data: dict[str, Any]) -> None:
    """
    Procesa un mensaje del stream de detecciones end-to-end:
      1. Parsea campos del payload.
      2. Sube snapshot a MinIO si existe.
      3. Inserta en tabla detections.
      4. Inserta en tabla alerts si es face_match.
      5. Emite evento WebSocket.
    """
    # ── 1. Parseo de campos del payload ──────────────────────────────────────
    raw_payload: str = data.get("data", "{}")
    try:
        payload: dict[str, Any] = json.loads(raw_payload)
    except json.JSONDecodeError:
        logger.error(
            "Mensaje con JSON inválido en stream detecciones: id=%s payload=%s",
            message_id, raw_payload, exc_info=True,
        )
        raise

    mission_id_str: str        = payload["mission_id"]
    drone_id_str: str          = payload["drone_id"]
    detection_type: str        = payload.get("detection_type", "person_detected")
    yolo_confidence: float     = float(payload["yolo_confidence"])
    similarity_score: float    = float(payload.get("similarity_score", 0.0))
    matched_person_id_str: Optional[str] = payload.get("matched_person_id")
    bbox: dict                 = payload.get("bbox", {})
    gps: dict                  = payload.get("gps", {})
    snapshot_b64: Optional[str] = payload.get("snapshot_b64")
    frame_timestamp_str: str   = payload.get("frame_timestamp", datetime.now(timezone.utc).isoformat())

    # IDs tipados
    mission_id   = uuid.UUID(mission_id_str)
    drone_id     = uuid.UUID(drone_id_str)
    matched_person_id = uuid.UUID(matched_person_id_str) if matched_person_id_str else None
    frame_timestamp   = datetime.fromisoformat(frame_timestamp_str)

    # IDs de modelos: preferir los del payload; usar los globales como fallback
    det_model_id_str = payload.get("detection_model_id")
    rec_model_id_str = payload.get("recognition_model_id")
    detection_model_id   = uuid.UUID(det_model_id_str) if det_model_id_str else _detection_model_id
    recognition_model_id = uuid.UUID(rec_model_id_str) if rec_model_id_str else _recognition_model_id

    if detection_model_id is None or recognition_model_id is None:
        raise ValueError(
            "No se encontraron modelos IA activos; "
            f"detection_model_id={detection_model_id} recognition_model_id={recognition_model_id}"
        )

    # GPS
    gps_lat: Optional[float] = gps.get("lat")
    gps_lng: Optional[float] = gps.get("lng")

    # ── 2. Subir snapshot a MinIO ─────────────────────────────────────────────
    snapshot_file_id: Optional[uuid.UUID] = None
    snapshot_url: Optional[str] = None

    if snapshot_b64:
        try:
            image_bytes = base64.b64decode(snapshot_b64)
            sha256_hash = hashlib.sha256(image_bytes).hexdigest()

            # Deduplicación por hash antes de subir
            exists, existing_key = await minio_service.file_exists_by_hash(sha256_hash)

            if exists and existing_key:
                # Reutilizar registro existente; buscar su ID en la tabla files
                async with AsyncSessionLocal() as session:
                    result = await session.execute(
                        select(File.id).where(File.sha256_hash == sha256_hash)
                    )
                    snapshot_file_id = result.scalar_one_or_none()
                snapshot_url = minio_service.build_public_url(
                    settings.minio_bucket_snapshots, existing_key
                )
            else:
                # Generar ID nuevo para el snapshot y subir
                new_file_id = uuid.uuid4()
                snapshot_url = minio_service.upload_snapshot(
                    image_bytes=image_bytes,
                    mission_id=mission_id_str,
                    detection_id=str(new_file_id),
                )
                object_key = f"missions/{mission_id_str}/detections/{new_file_id}.jpg"

                # Registrar en tabla files
                async with AsyncSessionLocal() as session:
                    async with session.begin():
                        await session.execute(
                            text(f"SET LOCAL aerofinder.current_user_id = '{str(_SYSTEM_USER_ID)}'")
                        )
                        await session.execute(
                            text("SET LOCAL aerofinder.current_user_role = 'system'")
                        )
                        file_record = File(
                            id=new_file_id,
                            bucket=settings.minio_bucket_snapshots,
                            object_key=object_key,
                            sha256_hash=sha256_hash,
                            size_bytes=len(image_bytes),
                            mime_type="image/jpeg",
                            upload_status=FileUploadStatus.uploaded,
                            retention_policy=FileRetentionPolicy.mission_lifetime,
                        )
                        session.add(file_record)
                snapshot_file_id = new_file_id

        except Exception:
            logger.error(
                "Error al procesar snapshot del mensaje id=%s", message_id, exc_info=True
            )
            # Continuar sin snapshot antes de abortar la detección completa

    # ── 3. Insertar detección en DB ───────────────────────────────────────────
    detection_id = uuid.uuid4()

    async with AsyncSessionLocal() as session:
        async with session.begin():
            await session.execute(
                text(f"SET LOCAL aerofinder.current_user_id = '{str(_SYSTEM_USER_ID)}'")
            )
            await session.execute(
                text("SET LOCAL aerofinder.current_user_role = 'system'")
            )
            # Obtener missing_person_id desde la misión si no vino en el payload
            missing_person_id = matched_person_id
            if missing_person_id is None:
                missing_person_id = await _get_mission_person_id(session, mission_id)
            if missing_person_id is None:
                raise ValueError(
                    f"No se pudo determinar missing_person_id para misión {mission_id}"
                )

            detection = Detection(
                id=detection_id,
                mission_id=mission_id,
                drone_id=drone_id,
                missing_person_id=missing_person_id,
                detection_model_id=detection_model_id,
                recognition_model_id=recognition_model_id,
                frame_timestamp=frame_timestamp,
                yolo_confidence=yolo_confidence,
                facenet_similarity=similarity_score,
                bounding_box=bbox,
                gps_latitude=gps_lat,
                gps_longitude=gps_lng,
                snapshot_file_id=snapshot_file_id,
            )
            session.add(detection)

    # ── 4. Insertar alerta si es face_match con similitud suficiente ──────────
    alert_id: Optional[uuid.UUID] = None
    facenet_threshold = await config_cache.get_float(
        config_cache.FACENET_SIMILARITY, default=0.72
    )

    if detection_type == "face_match" and similarity_score >= facenet_threshold:
        # Determinar nivel de confianza y mensaje descriptivo
        if similarity_score >= 0.95:
            content_level = AlertContentLevel.full
            tipo_alerta   = "face_match_confirmed"
            descripcion   = "Coincidencia facial confirmada con alta confianza"
        elif similarity_score >= 0.85:
            content_level = AlertContentLevel.partial
            tipo_alerta   = "face_match_probable"
            descripcion   = "Coincidencia facial probable, se recomienda verificación"
        else:
            content_level = AlertContentLevel.confirmation_only
            tipo_alerta   = "face_match_possible"
            descripcion   = "Posible coincidencia facial, confianza baja"

        message_text = (
            f"[{tipo_alerta}] {descripcion}. "
            f"Similitud: {similarity_score:.2%}. "
            f"Misión: {mission_id_str}. "
            f"Dron: {drone_id_str}."
        )

        alert_id = uuid.uuid4()
        try:
            async with AsyncSessionLocal() as session:
                async with session.begin():
                    await session.execute(
                        text(f"SET LOCAL aerofinder.current_user_id = '{str(_SYSTEM_USER_ID)}'")
                    )
                    await session.execute(
                        text("SET LOCAL aerofinder.current_user_role = 'system'")
                    )
                    alert = Alert(
                        id=alert_id,
                        detection_id=detection_id,
                        content_level=content_level,
                        status=AlertStatus.generated,
                        message_text=message_text,
                    )
                    session.add(alert)
            logger.info(
                "Alerta generada: id=%s tipo=%s similitud=%.3f",
                alert_id, tipo_alerta, similarity_score,
            )
        except Exception:
            logger.error(
                "Error al insertar alerta para detección %s", detection_id, exc_info=True
            )
            # El trigger fn_create_notification_queue_entries() se dispara
            # automáticamente en el INSERT de alerts; no duplicar aquí.

    # ── 5. Emitir evento WebSocket ────────────────────────────────────────────
    ws_payload: dict[str, Any] = {
        "type": "detection",
        "detection_id": str(detection_id),
        "mission_id": mission_id_str,
        "drone_id": drone_id_str,
        "detection_type": detection_type,
        "yolo_confidence": yolo_confidence,
        "similarity_score": similarity_score,
        "bbox": bbox,
        "gps": gps,
        "snapshot_url": snapshot_url,
        "frame_timestamp": frame_timestamp_str,
    }

    # Broadcast a la sala de la misión
    await ws_manager.broadcast(f"mission:{mission_id_str}", ws_payload)

    # Broadcast adicional al canal de alertas si es face_match
    if detection_type == "face_match" and alert_id is not None:
        await ws_manager.broadcast(
            "alerts",
            {
                **ws_payload,
                "type": "alert",
                "alert_id": str(alert_id),
            },
        )

    logger.debug(
        "Mensaje procesado: id=%s detection=%s tipo=%s",
        message_id, detection_id, detection_type,
    )


# ── Consumer principal ────────────────────────────────────────────────────────

async def run_detection_consumer() -> None:
    """
    Consumer async del Redis Stream aerofinder:detections.
    Crea el grupo de consumo si no existe y procesa mensajes en loop infinito.
    Implementa dead-letter para poison pills y backoff exponencial en errores.
    """
    logger.info(
        "Iniciando consumer de detecciones: stream=%s grupo=%s consumer=%s",
        _STREAM_KEY, _CONSUMER_GROUP, _CONSUMER_NAME,
    )

    # Resolver IDs de modelos IA antes de comenzar a procesar
    await _resolve_active_models()

    redis_client: Optional[aioredis.Redis] = None
    backoff = _BACKOFF_BASE

    while True:
        try:
            # ── Conexión Redis ────────────────────────────────────────────────
            if redis_client is None:
                redis_client = aioredis.from_url(
                    settings.redis_url,
                    decode_responses=True,
                )
                logger.info("Conexión Redis establecida")

            # ── Crear grupo si no existe ──────────────────────────────────────
            try:
                await redis_client.xgroup_create(
                    name=_STREAM_KEY,
                    groupname=_CONSUMER_GROUP,
                    id="$",
                    mkstream=True,
                )
                logger.info(
                    "Grupo de consumo creado: stream=%s grupo=%s",
                    _STREAM_KEY, _CONSUMER_GROUP,
                )
            except aioredis.ResponseError as exc:
                # BUSYGROUP: el grupo ya existe, es el estado esperado tras reinicio
                if "BUSYGROUP" not in str(exc):
                    raise

            backoff = _BACKOFF_BASE  # resetear backoff al conectar exitosamente

            # ── Loop de lectura ───────────────────────────────────────────────
            while True:
                try:
                    # Leer mensajes pendientes (no confirmados) de iteraciones anteriores
                    results = await redis_client.xreadgroup(
                        groupname=_CONSUMER_GROUP,
                        consumername=_CONSUMER_NAME,
                        streams={_STREAM_KEY: ">"},
                        count=_MAX_BATCH,
                        block=5000,  # bloquear hasta 5 s esperando mensajes nuevos
                    )

                    if not results:
                        continue

                    # results: [(stream_key, [(msg_id, {fields}), ...])]
                    for _stream, messages in results:
                        for message_id, fields in messages:
                            await _process_with_dead_letter(
                                redis_client, message_id, fields
                            )

                except aioredis.ConnectionError:
                    logger.error(
                        "Conexión Redis perdida en el loop de lectura", exc_info=True
                    )
                    redis_client = None
                    break  # salir del loop interno para reconectar

        except Exception:
            logger.error(
                "Error en el consumer de detecciones; reintentando en %.1fs",
                backoff,
                exc_info=True,
            )
            if redis_client is not None:
                try:
                    await redis_client.aclose()
                except Exception:
                    pass
                redis_client = None

            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, _BACKOFF_MAX)


async def _process_with_dead_letter(
    redis_client: aioredis.Redis,
    message_id: str,
    fields: dict[str, str],
) -> None:
    """
    Intenta procesar un mensaje hasta _MAX_FAILURES veces.
    Si supera el límite, lo mueve al stream dead-letter y hace XACK del original.
    """
    # Consultar cuántas veces fue entregado este mensaje al consumer
    try:
        pending_info = await redis_client.xpending_range(
            name=_STREAM_KEY,
            groupname=_CONSUMER_GROUP,
            min=message_id,
            max=message_id,
            count=1,
        )
        delivery_count = pending_info[0]["times_delivered"] if pending_info else 1
    except Exception:
        delivery_count = 1

    if delivery_count > _MAX_FAILURES:
        # Mover al dead-letter stream con contexto del error
        logger.warning(
            "Poison pill detectado: mensaje %s entregado %d veces; moviendo a dead-letter",
            message_id, delivery_count,
        )
        try:
            dead_letter_data = {
                "original_id": message_id,
                "stream": _STREAM_KEY,
                "consumer": _CONSUMER_NAME,
                "delivery_count": str(delivery_count),
                "data": fields.get("data", ""),
                "error": "Superó el límite de reintentos",
                "moved_at": datetime.now(timezone.utc).isoformat(),
            }
            await redis_client.xadd(_DEAD_LETTER_KEY, dead_letter_data)
        except Exception:
            logger.error(
                "Error al escribir en dead-letter stream para mensaje %s",
                message_id, exc_info=True,
            )
        # XACK para que no siga bloqueando el grupo
        await redis_client.xack(_STREAM_KEY, _CONSUMER_GROUP, message_id)
        return

    # Intento normal de procesamiento
    try:
        await _handle_message(message_id, fields)
        await redis_client.xack(_STREAM_KEY, _CONSUMER_GROUP, message_id)
    except Exception:
        logger.error(
            "Error al procesar mensaje %s (intento %d/%d)",
            message_id, delivery_count, _MAX_FAILURES,
            exc_info=True,
        )
        # Sin XACK: el mensaje quedará como pendiente para el próximo XREADGROUP

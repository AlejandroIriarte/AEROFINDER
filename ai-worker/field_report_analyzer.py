# =============================================================================
# AEROFINDER AI Worker — Analizador de Field Reports
#
# Flujo:
#   BLPOP aerofinder:field_report_analysis
#   → descargar fotos desde MinIO (bucket aerofinder-photos)
#   → InsightFace embedding por foto
#   → promediar + normalizar → pgvector cosine search top-3
#   → INSERT field_report_matches + UPDATE status='completed'
#   → publicar field_report_complete en aerofinder:detections
# =============================================================================

import asyncio
import json
import logging
from typing import Any, Optional

import cv2
import numpy as np
import redis.asyncio as aioredis
from minio import Minio

from config import settings
from db import get_field_report_data, save_field_report_results, search_similar_persons
from publisher import RedisPublisher
from recognizer import FaceRecognizer

logger = logging.getLogger(__name__)

_BLPOP_TIMEOUT = 30   # segundos; None bloquea indefinidamente, 0 no bloquea
_FIELD_REPORT_QUEUE = "aerofinder:field_report_analysis"


async def _download_image(
    minio_client: Minio,
    bucket: str,
    object_key: str,
) -> Optional[np.ndarray]:
    """Descarga un objeto de MinIO y lo decodifica como imagen BGR."""
    try:
        response = await asyncio.get_running_loop().run_in_executor(
            None,
            lambda: minio_client.get_object(bucket, object_key),
        )
        img_bytes = response.read()
        response.close()

        arr = np.frombuffer(img_bytes, dtype=np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if img is None:
            logger.warning("No se pudo decodificar imagen: %s/%s", bucket, object_key)
        return img
    except Exception:
        logger.error("Error al descargar %s/%s", bucket, object_key, exc_info=True)
        return None


async def _process_field_report(
    report_id: str,
    mission_id: str,
    recognizer: FaceRecognizer,
    minio_client: Minio,
    redis_client: aioredis.Redis,
) -> None:
    """Procesa un field report: embed → search → save → notify."""
    # ── 1. Obtener fotos del reporte ──────────────────────────────────────────
    data = await get_field_report_data(report_id)
    if data is None:
        logger.error("Field report no encontrado o sin fotos: %s", report_id)
        return

    rescuer_id = data["rescuer_id"]
    photos     = data["photos"]
    bucket     = settings.minio_bucket_photos

    logger.info(
        "Procesando field report %s: %d fotos rescuer=%s",
        report_id, len(photos), rescuer_id,
    )

    # ── 2. Extraer embeddings de cada foto ───────────────────────────────────
    embeddings: list[np.ndarray] = []

    for obj_name in photos:
        img = await _download_image(minio_client, bucket, obj_name)
        if img is None:
            continue

        embedding = await asyncio.get_running_loop().run_in_executor(
            None,
            lambda frame=img: recognizer.extract_embedding(frame),
        )
        if embedding is not None:
            embeddings.append(embedding)
        else:
            logger.warning(
                "InsightFace no detectó rostro en %s — se ignora esta foto", obj_name
            )

    # ── 3. Promediar y normalizar ────────────────────────────────────────────
    matches: list[dict] = []

    if embeddings:
        avg_emb = np.mean(embeddings, axis=0).astype(np.float32)
        norm = np.linalg.norm(avg_emb)
        if norm > 0:
            avg_emb = avg_emb / norm

        # ── 4. Búsqueda pgvector ─────────────────────────────────────────────
        matches = await search_similar_persons(avg_emb, top_k=3)
        logger.info(
            "Búsqueda completada: report=%s matches=%d",
            report_id, len(matches),
        )
    else:
        logger.warning(
            "Sin embeddings válidos en field report %s; se completa sin matches", report_id
        )

    # ── 5. Guardar resultados en DB ──────────────────────────────────────────
    await save_field_report_results(report_id, mission_id, rescuer_id, matches)

    # ── 6. Notificar al backend (vía detections stream) ──────────────────────
    publisher = RedisPublisher(redis_client, settings.redis_stream_detections)
    await publisher.publish({
        "detection_type": "field_report_complete",
        "report_id":      report_id,
        "mission_id":     mission_id,
        "rescuer_id":     rescuer_id,
        "matches": [
            {
                "person_id":        m["person_id"],
                "similarity_score": m["similarity_score"],
                "rank":             m["rank"],
            }
            for m in matches
        ],
    })

    logger.info("Field report %s completado y notificación enviada", report_id)


async def field_report_analyzer_loop(
    redis_client: aioredis.Redis,
    recognizer: FaceRecognizer,
    minio_client: Minio,
) -> None:
    """
    Loop infinito que consume la cola Redis de field reports pendientes.
    Usa BLPOP con timeout para liberar el event loop periódicamente.
    """
    logger.info("Field report analyzer iniciado (queue=%s)", _FIELD_REPORT_QUEUE)

    while True:
        try:
            result: Any = await redis_client.blpop(
                _FIELD_REPORT_QUEUE,
                timeout=_BLPOP_TIMEOUT,
            )
            if result is None:
                # Timeout expirado, nada en la cola
                continue

            _, raw = result
            try:
                payload = json.loads(raw)
            except json.JSONDecodeError:
                logger.error("JSON inválido en field_report_analysis: %r", raw)
                continue

            report_id  = payload.get("report_id")
            mission_id = payload.get("mission_id")

            if not report_id or not mission_id:
                logger.error("Payload inválido (faltan campos): %s", payload)
                continue

            await _process_field_report(
                report_id=report_id,
                mission_id=mission_id,
                recognizer=recognizer,
                minio_client=minio_client,
                redis_client=redis_client,
            )

        except asyncio.CancelledError:
            logger.info("Field report analyzer cancelado")
            raise
        except Exception:
            logger.error("Error en field_report_analyzer_loop", exc_info=True)
            await asyncio.sleep(5)

# =============================================================================
# AEROFINDER AI Worker — Loop principal con supervisor multi-dron
#
# Arquitectura:
#   supervisor_loop()          — cada 10s consulta DB + inicia/cancela tasks
#   process_stream(serial)     — una task por dron activo; RTSP → YOLO → FaceNet
#   embedding_generation_loop() — genera embeddings para fotos de personas
#   field_report_analyzer_loop() — analiza field reports de rescatistas (BLPOP)
# =============================================================================

import asyncio
import base64
import logging
import time
from datetime import datetime, timezone
from typing import Optional

import cv2
import numpy as np
import redis.asyncio as aioredis
from minio import Minio

from config import settings
from db import (
    get_active_mission_streams,
    get_photos_pending_embedding,
    insert_face_embedding,
    load_system_config,
    load_embeddings_for_person,
)
from deduplicator import SpatioTemporalDeduplicator
from detector import YOLODetector
from field_report_analyzer import field_report_analyzer_loop
from gps_interpolator import get_gps_for_timestamp
from publisher import RedisPublisher
from recognizer import FaceRecognizer

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)

# ── Constantes de operación ───────────────────────────────────────────────────
_CONFIG_RELOAD_INTERVAL   = 60.0   # segundos entre recargas de system_config
_MISSION_POLL_INTERVAL    = 10.0   # segundos entre ciclos del supervisor
_EMBEDDING_GEN_INTERVAL   = 30.0   # segundos entre ciclos de generación de embeddings
_BACKOFF_STEPS            = [1, 2, 4, 8, 30]  # backoff exponencial en segundos

# Claves de system_config que consume este worker
_CONFIG_KEYS = [
    "yolo.confidence_threshold",
    "yolo.frame_skip",
    "facenet.similarity_threshold",
    "facenet.bbox_coverage_min_pct",
    "telemetry.gps_interpolation_window_ms",
]

# Valores por defecto si system_config no está disponible
_CONFIG_DEFAULTS = {
    "yolo.confidence_threshold":              0.65,
    "yolo.frame_skip":                        3,
    "facenet.similarity_threshold":           0.72,
    "facenet.bbox_coverage_min_pct":          5.0,
    "telemetry.gps_interpolation_window_ms":  500,
}

# Registro global de tasks activas: serial_number → asyncio.Task
_active_tasks:        dict[str, asyncio.Task] = {}
# Snapshot de la config de misión con la que se inició cada task
_active_mission_data: dict[str, dict]         = {}


# ── Helper: carga de configuración dinámica ───────────────────────────────────

async def _load_config() -> dict:
    """Carga parámetros de sistema desde DB y los mezcla con defaults."""
    try:
        raw    = await load_system_config(_CONFIG_KEYS)
        merged = {**_CONFIG_DEFAULTS, **raw}
        logger.info("Configuración dinámica cargada: %s", merged)
        return merged
    except Exception:
        logger.error("Error al cargar config dinámica; usando defaults", exc_info=True)
        return dict(_CONFIG_DEFAULTS)


# ── Helper: apertura del stream RTSP con backoff ──────────────────────────────

def _open_capture(rtsp_url: str) -> Optional[cv2.VideoCapture]:
    """Intenta abrir el stream RTSP. Retorna VideoCapture o None."""
    try:
        cap = cv2.VideoCapture(rtsp_url)
        if cap.isOpened():
            logger.info("Stream RTSP abierto: %s", rtsp_url)
            return cap
        cap.release()
        logger.warning("No se pudo abrir el stream RTSP: %s", rtsp_url)
        return None
    except Exception:
        logger.error("Error al abrir stream RTSP: %s", rtsp_url, exc_info=True)
        return None


# ── Loop de generación de embeddings ──────────────────────────────────────────

async def embedding_generation_loop(recognizer: FaceRecognizer) -> None:
    """
    Corre en paralelo con el supervisor.
    Cada _EMBEDDING_GEN_INTERVAL segundos busca fotos activas sin embedding,
    descarga desde MinIO, extrae el vector InsightFace y lo guarda en DB.
    """
    minio_client = Minio(
        settings.minio_url.replace("http://", "").replace("https://", ""),
        access_key=settings.minio_access_key,
        secret_key=settings.minio_secret_key,
        secure=settings.minio_secure,
    )

    while True:
        try:
            pending = await get_photos_pending_embedding()
            if pending:
                logger.info("Fotos pendientes de embedding: %d", len(pending))

            for photo in pending:
                photo_id  = str(photo["photo_id"])
                person_id = str(photo["missing_person_id"])
                bucket    = photo["bucket"]
                object_key = photo["object_key"]

                try:
                    response = await asyncio.get_running_loop().run_in_executor(
                        None,
                        lambda b=bucket, k=object_key: minio_client.get_object(b, k),
                    )
                    img_bytes = response.read()
                    response.close()

                    img_array = np.frombuffer(img_bytes, dtype=np.uint8)
                    img = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
                    if img is None:
                        logger.warning("No se pudo decodificar imagen photo_id=%s", photo_id)
                        continue

                    embedding = recognizer.extract_embedding(img)
                    if embedding is None:
                        logger.warning(
                            "InsightFace no detectó rostro en photo_id=%s — "
                            "sube una foto clara del rostro de frente", photo_id
                        )
                        continue

                    await insert_face_embedding(photo_id, person_id, embedding)
                    logger.info(
                        "✅ Embedding generado para photo_id=%s person_id=%s",
                        photo_id, person_id,
                    )

                except Exception:
                    logger.error("Error procesando photo_id=%s", photo_id, exc_info=True)

        except Exception:
            logger.error("Error en embedding_generation_loop", exc_info=True)

        await asyncio.sleep(_EMBEDDING_GEN_INTERVAL)


# ── Task de procesamiento de un stream de dron ────────────────────────────────

async def process_stream(
    serial: str,
    mission: dict,
    redis_client: aioredis.Redis,
    detector: YOLODetector,
    recognizer: FaceRecognizer,
    publisher: RedisPublisher,
) -> None:
    """
    Procesa el stream RTSP de un dron específico.
    Se ejecuta como asyncio.Task cancelable desde supervisor_loop.
    Cada task mantiene sus propios embeddings para evitar colisiones con
    otras tasks que buscan personas distintas.
    """
    rtsp_url             = f"{settings.mediamtx_rtsp_url}/{serial}"
    mission_id           = mission["mission_id"]
    face_recognition_on  = mission.get("face_recognition_active", False)

    logger.info(
        "Iniciando stream: drone=%s mission=%s face_recognition=%s",
        serial, mission_id, face_recognition_on,
    )

    # ── Cargar embeddings de referencia (por-task, sin modificar el caché global) ─
    task_embeddings: list[dict] = []
    if face_recognition_on:
        task_embeddings = await load_embeddings_for_person(mission["missing_person_id"])
        if not task_embeddings:
            logger.warning(
                "Sin embeddings para person_id=%s; se detectarán solo siluetas",
                mission["missing_person_id"],
            )

    # ── Cargar configuración dinámica ─────────────────────────────────────────
    config          = await _load_config()
    last_config_ts  = time.time()

    yolo_confidence  = float(config["yolo.confidence_threshold"])
    yolo_frame_skip  = int(config["yolo.frame_skip"])
    facenet_sim      = float(config["facenet.similarity_threshold"])
    facenet_bbox_min = float(config["facenet.bbox_coverage_min_pct"])
    gps_window_ms    = int(config["telemetry.gps_interpolation_window_ms"])

    deduplicator = SpatioTemporalDeduplicator(window_seconds=8, pixel_radius=80)
    cap: Optional[cv2.VideoCapture] = None
    backoff_idx = 0

    try:
        while True:
            # ── Abrir stream RTSP con backoff ──────────────────────────────────
            while cap is None:
                cap = _open_capture(rtsp_url)
                if cap is None:
                    wait = _BACKOFF_STEPS[min(backoff_idx, len(_BACKOFF_STEPS) - 1)]
                    logger.warning(
                        "RTSP no disponible drone=%s; reintentando en %ds", serial, wait
                    )
                    await asyncio.sleep(wait)
                    backoff_idx += 1
            backoff_idx = 0

            frame_counter = 0

            while True:
                now = time.time()

                # ── Recarga periódica de configuración ─────────────────────────
                if now - last_config_ts >= _CONFIG_RELOAD_INTERVAL:
                    config         = await _load_config()
                    last_config_ts = now
                    yolo_confidence  = float(config["yolo.confidence_threshold"])
                    yolo_frame_skip  = int(config["yolo.frame_skip"])
                    facenet_sim      = float(config["facenet.similarity_threshold"])
                    facenet_bbox_min = float(config["facenet.bbox_coverage_min_pct"])
                    gps_window_ms    = int(config["telemetry.gps_interpolation_window_ms"])

                # ── Captura de frame ──────────────────────────────────────────
                try:
                    ret, frame = cap.read()
                except Exception:
                    logger.error("Excepción al leer frame drone=%s", serial, exc_info=True)
                    ret = False

                if not ret:
                    logger.warning("Stream perdido drone=%s; reconectando...", serial)
                    try:
                        cap.release()
                    except Exception:
                        pass
                    cap = None
                    break  # sale al loop de backoff

                frame_counter += 1
                if frame_counter % yolo_frame_skip != 0:
                    continue

                frame_ts = time.time()

                # ── Inferencia YOLO ───────────────────────────────────────────
                detections = detector.detect(frame, yolo_confidence)

                for det in detections:
                    bbox         = det["bbox"]
                    coverage_pct = det["coverage_pct"]
                    yolo_conf    = det["confidence"]

                    bbox_cx = bbox["x"] + bbox["w"] // 2
                    bbox_cy = bbox["y"] + bbox["h"] // 2

                    detection_type:    str             = "person_silhouette"
                    similarity:        Optional[float] = None
                    matched_person_id: Optional[str]   = None
                    snapshot_b64:      Optional[str]   = None

                    # ── Reconocimiento facial si está activo ──────────────────
                    if face_recognition_on and coverage_pct >= facenet_bbox_min:
                        x, y, w, h = bbox["x"], bbox["y"], bbox["w"], bbox["h"]
                        crop = frame[
                            max(0, y): min(frame.shape[0], y + h),
                            max(0, x): min(frame.shape[1], x + w),
                        ]

                        if crop.size > 0:
                            embedding = recognizer.extract_embedding(crop)

                            if embedding is not None:
                                # Pasar embeddings de esta task explícitamente
                                # para evitar colisión con otras tasks
                                match = recognizer.find_best_match(
                                    embedding, facenet_sim,
                                    embeddings_cache=task_embeddings,
                                )

                                if match:
                                    detection_type    = "face_match"
                                    similarity        = match["similarity"]
                                    matched_person_id = match["person_id"]
                                else:
                                    detection_type = "face_candidate"

                                try:
                                    ok, buf = cv2.imencode(".jpg", crop)
                                    if ok:
                                        snapshot_b64 = base64.b64encode(
                                            buf.tobytes()
                                        ).decode("utf-8")
                                except Exception:
                                    logger.error(
                                        "Error al codificar snapshot JPEG", exc_info=True
                                    )

                    # ── Deduplicación espacio-temporal ────────────────────────
                    if deduplicator.is_duplicate(bbox_cx, bbox_cy, matched_person_id, frame_ts):
                        continue
                    deduplicator.register(bbox_cx, bbox_cy, matched_person_id, frame_ts)

                    # ── Interpolación GPS ─────────────────────────────────────
                    try:
                        gps = await get_gps_for_timestamp(
                            redis_client,
                            settings.redis_stream_telemetry,
                            frame_ts,
                            gps_window_ms,
                        )
                    except Exception:
                        logger.error(
                            "Error GPS drone=%s", serial, exc_info=True
                        )
                        gps = {
                            "lat": None, "lng": None,
                            "altitude_m": None, "interpolated": False, "available": False,
                        }

                    frame_ts_iso = datetime.fromtimestamp(
                        frame_ts, tz=timezone.utc
                    ).isoformat()

                    # ── Publicar en Redis Stream ──────────────────────────────
                    await publisher.publish({
                        "mission_id":              mission_id,
                        "drone_id":                mission["drone_id"],
                        "detection_type":          detection_type,
                        "yolo_confidence":         round(yolo_conf, 4),
                        "similarity_score":        round(similarity, 4) if similarity is not None else 0.0,
                        "matched_person_id":       matched_person_id,
                        "bbox":                    bbox,
                        "gps": {
                            "lat":        gps.get("lat"),
                            "lng":        gps.get("lng"),
                            "altitude_m": gps.get("altitude_m"),
                        },
                        "snapshot_b64":            snapshot_b64,
                        "frame_timestamp":         frame_ts_iso,
                        "ai_model_detection_id":   None,
                        "ai_model_recognition_id": None,
                        "missing_person_id":       mission["missing_person_id"],
                    })

                    logger.info(
                        "Detección publicada: tipo=%s conf=%.2f sim=%s drone=%s mission=%s",
                        detection_type, yolo_conf,
                        f"{similarity:.3f}" if similarity else "—",
                        serial, mission_id,
                    )

                # Ceder el event loop para que otras coroutines puedan ejecutarse
                await asyncio.sleep(0)

    except asyncio.CancelledError:
        logger.info("Stream task cancelada para drone=%s", serial)
        if cap is not None:
            try:
                cap.release()
            except Exception:
                pass
        raise


# ── Supervisor loop ───────────────────────────────────────────────────────────

async def supervisor_loop(
    redis_client: aioredis.Redis,
    detector: YOLODetector,
    recognizer: FaceRecognizer,
    publisher: RedisPublisher,
) -> None:
    """
    Cada _MISSION_POLL_INTERVAL segundos:
    - Consulta DB para todos los (misión, dron) activos con recognition_active=TRUE.
    - Inicia asyncio.Task por cada serial no activo aún.
    - Cancela tasks cuyo serial ya no aparece en la lista activa.
    - Reinicia tasks cuya configuración de misión cambió (p.ej. face_recognition_active).
    """
    logger.info(
        "Supervisor iniciado — polling cada %ds", int(_MISSION_POLL_INTERVAL)
    )

    while True:
        try:
            active = await get_active_mission_streams()
            active_serials = {m["drone_serial_number"]: m for m in active}

            # ── Iniciar o reiniciar tasks ──────────────────────────────────────
            for serial, mission_data in active_serials.items():
                task_done    = serial not in _active_tasks or _active_tasks[serial].done()
                config_changed = _active_mission_data.get(serial) != mission_data

                if task_done or config_changed:
                    # Cancelar task anterior si sigue corriendo
                    if serial in _active_tasks and not _active_tasks[serial].done():
                        _active_tasks[serial].cancel()
                        logger.info(
                            "Task reiniciada por cambio de config: drone=%s", serial
                        )

                    logger.info(
                        "Iniciando task: drone=%s mission=%s face_recognition=%s",
                        serial, mission_data["mission_id"],
                        mission_data["face_recognition_active"],
                    )
                    _active_tasks[serial] = asyncio.create_task(
                        process_stream(
                            serial, mission_data,
                            redis_client, detector, recognizer, publisher,
                        ),
                        name=f"stream-{serial}",
                    )
                    _active_mission_data[serial] = mission_data

            # ── Cancelar tasks de seriales ya no activos ──────────────────────
            for serial in list(_active_tasks.keys()):
                if serial not in active_serials:
                    task = _active_tasks.pop(serial)
                    _active_mission_data.pop(serial, None)
                    if not task.done():
                        task.cancel()
                        logger.info("Task cancelada (ya no activo): drone=%s", serial)

        except Exception:
            logger.error("Error en supervisor_loop", exc_info=True)

        await asyncio.sleep(_MISSION_POLL_INTERVAL)


# ── Punto de entrada ──────────────────────────────────────────────────────────

async def main() -> None:
    """Punto de entrada async del AI Worker."""
    logger.info("AEROFINDER AI Worker iniciando — modo supervisor multi-dron")

    # ── Conexión Redis ─────────────────────────────────────────────────────────
    redis_client = aioredis.from_url(settings.redis_url, decode_responses=True)
    logger.info("Conexión Redis establecida: %s", settings.redis_url)

    # ── Inicializar modelos y servicios ────────────────────────────────────────
    detector   = YOLODetector(settings.yolo_model_path)
    recognizer = FaceRecognizer(settings.insightface_model_dir)
    publisher  = RedisPublisher(redis_client, settings.redis_stream_detections)

    # ── Cliente MinIO (compartido por embedding_gen y field_report_analyzer) ──
    minio_client = Minio(
        settings.minio_url.replace("http://", "").replace("https://", ""),
        access_key=settings.minio_access_key,
        secret_key=settings.minio_secret_key,
        secure=settings.minio_secure,
    )

    # ── Tareas de fondo paralelas ──────────────────────────────────────────────
    asyncio.create_task(embedding_generation_loop(recognizer))
    logger.info("Loop de generación de embeddings iniciado")

    asyncio.create_task(field_report_analyzer_loop(redis_client, recognizer, minio_client))
    logger.info("Field report analyzer iniciado")

    # ── Supervisor principal (bloquea hasta cancelación) ──────────────────────
    await supervisor_loop(redis_client, detector, recognizer, publisher)


if __name__ == "__main__":
    asyncio.run(main())

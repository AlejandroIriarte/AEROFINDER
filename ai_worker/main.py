# =============================================================================
# AEROFINDER AI Worker — Loop principal de procesamiento de video con IA
#
# Flujo general:
#   RTSP (MediaMTX) → OpenCV → YOLO (silueta) → InsightFace (embedding)
#   → deduplicación → interpolación GPS → Redis Stream (detecciones)
# =============================================================================

import asyncio
import base64
import logging
import time
from datetime import datetime, timezone
from typing import Optional

import cv2
import redis.asyncio as aioredis

from config import settings
from db import (
    get_active_mission_for_stream,
    insert_detection,
    insert_telemetry,
    load_embeddings_for_person,
    load_system_config,
)
from deduplicator import SpatioTemporalDeduplicator
from detector import YOLODetector
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
_CONFIG_RELOAD_INTERVAL = 60.0   # segundos entre recargas de system_config
_MISSION_POLL_INTERVAL  = 10.0   # segundos de espera si no hay misión activa
_BACKOFF_STEPS          = [1, 2, 4, 8, 30]  # backoff exponencial en segundos

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
    "yolo.confidence_threshold":        0.65,
    "yolo.frame_skip":                  3,
    "facenet.similarity_threshold":     0.72,
    "facenet.bbox_coverage_min_pct":    5.0,
    "telemetry.gps_interpolation_window_ms": 500,
}


# ── Helper: carga de configuración dinámica ───────────────────────────────────

async def _load_config() -> dict:
    """
    Carga parámetros de sistema desde DB y los mezcla con defaults.
    """
    try:
        raw = await load_system_config(_CONFIG_KEYS)
        merged = {**_CONFIG_DEFAULTS, **raw}
        logger.info("Configuración dinámica cargada: %s", merged)
        return merged
    except Exception:
        logger.error("Error al cargar config dinámica; usando defaults", exc_info=True)
        return dict(_CONFIG_DEFAULTS)


# ── Helper: apertura del stream RTSP con backoff ──────────────────────────────

def _open_capture(rtsp_url: str) -> Optional[cv2.VideoCapture]:
    """
    Intenta abrir el stream RTSP. Retorna el VideoCapture si tiene éxito o None.
    """
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


# ── Loop principal ────────────────────────────────────────────────────────────

async def run() -> None:
    """
    Función principal del worker de IA.
    Conecta a Redis y DB, inicializa modelos, busca misión activa,
    carga embeddings y procesa frames en loop infinito.
    """
    logger.info(
        "AEROFINDER AI Worker iniciando — drone_id=%s", settings.drone_id
    )

    # ── 1. Conexión Redis ─────────────────────────────────────────────────────
    redis_client = aioredis.from_url(settings.redis_url, decode_responses=True)
    logger.info("Conexión Redis establecida: %s", settings.redis_url)

    # ── 2. Conexión DB (implícita via SQLAlchemy pool) ────────────────────────
    # El engine se crea al importar db.py; no requiere conexión explícita aquí.

    # ── 3. Inicializar modelos y servicios ────────────────────────────────────
    detector     = YOLODetector(settings.yolo_model_path)
    recognizer   = FaceRecognizer(settings.insightface_model_dir)
    deduplicator = SpatioTemporalDeduplicator(window_seconds=8, pixel_radius=80)
    publisher    = RedisPublisher(redis_client, settings.redis_stream_detections)

    stream_key   = settings.drone_id  # el drone_id es la clave para identificar la misión
    rtsp_url     = f"{settings.mediamtx_rtsp_url}/{stream_key}"

    # ── 4. Esperar misión activa ──────────────────────────────────────────────
    mission: Optional[dict] = None
    while mission is None:
        mission = await get_active_mission_for_stream(stream_key)
        if mission is None:
            logger.info(
                "Sin misión activa para drone_id=%s; reintentando en %ds",
                stream_key, int(_MISSION_POLL_INTERVAL),
            )
            await asyncio.sleep(_MISSION_POLL_INTERVAL)

    logger.info(
        "Misión activa encontrada: mission_id=%s persona=%s",
        mission["mission_id"], mission["missing_person_id"],
    )

    # ── 5. Cargar embeddings de referencia ────────────────────────────────────
    embeddings = await load_embeddings_for_person(mission["missing_person_id"])
    if not embeddings:
        logger.warning(
            "No se encontraron embeddings para person_id=%s; "
            "solo se detectarán siluetas (sin reconocimiento facial)",
            mission["missing_person_id"],
        )
    recognizer.load_embeddings(embeddings)

    # ── 6. Cargar configuración dinámica ──────────────────────────────────────
    config            = await _load_config()
    last_config_ts    = time.time()

    yolo_confidence:   float = float(config["yolo.confidence_threshold"])
    yolo_frame_skip:   int   = int(config["yolo.frame_skip"])
    facenet_similarity: float = float(config["facenet.similarity_threshold"])
    facenet_bbox_min:  float = float(config["facenet.bbox_coverage_min_pct"])
    gps_window_ms:     int   = int(config["telemetry.gps_interpolation_window_ms"])

    # ── 7. Abrir stream RTSP con backoff exponencial ──────────────────────────
    cap: Optional[cv2.VideoCapture] = None
    backoff_idx = 0

    while cap is None:
        cap = _open_capture(rtsp_url)
        if cap is None:
            wait = _BACKOFF_STEPS[min(backoff_idx, len(_BACKOFF_STEPS) - 1)]
            logger.warning("RTSP no disponible; reintentando en %ds", wait)
            await asyncio.sleep(wait)
            backoff_idx += 1

    backoff_idx = 0  # resetear backoff tras conexión exitosa

    # ── 8. Loop de captura y procesamiento ────────────────────────────────────
    frame_counter = 0

    while True:
        # ── Recarga periódica de configuración dinámica ───────────────────────
        now = time.time()
        if now - last_config_ts >= _CONFIG_RELOAD_INTERVAL:
            config         = await _load_config()
            last_config_ts = now
            yolo_confidence  = float(config["yolo.confidence_threshold"])
            yolo_frame_skip  = int(config["yolo.frame_skip"])
            facenet_similarity = float(config["facenet.similarity_threshold"])
            facenet_bbox_min = float(config["facenet.bbox_coverage_min_pct"])
            gps_window_ms    = int(config["telemetry.gps_interpolation_window_ms"])

        # ── Captura de frame ──────────────────────────────────────────────────
        try:
            ret, frame = cap.read()
        except Exception:
            logger.error("Excepción al leer frame del stream RTSP", exc_info=True)
            ret = False

        if not ret:
            # Stream cortado: liberar y reconectar con backoff
            logger.warning("Stream RTSP perdido; reconectando...")
            try:
                cap.release()
            except Exception:
                pass
            cap = None

            while cap is None:
                wait = _BACKOFF_STEPS[min(backoff_idx, len(_BACKOFF_STEPS) - 1)]
                await asyncio.sleep(wait)
                backoff_idx += 1
                cap = _open_capture(rtsp_url)

            backoff_idx = 0
            frame_counter = 0
            continue

        frame_counter += 1

        # Saltar frames según configuración para reducir carga GPU
        if frame_counter % yolo_frame_skip != 0:
            continue

        frame_ts = time.time()

        # ── Inferencia YOLO ───────────────────────────────────────────────────
        detections = detector.detect(frame, yolo_confidence)

        for det in detections:
            bbox = det["bbox"]
            coverage_pct = det["coverage_pct"]
            yolo_conf    = det["confidence"]

            bbox_cx = bbox["x"] + bbox["w"] // 2
            bbox_cy = bbox["y"] + bbox["h"] // 2

            # Tipo de detección y datos de reconocimiento facial
            detection_type:     str             = "person_silhouette"
            similarity:         Optional[float] = None
            matched_person_id:  Optional[str]   = None
            snapshot_b64:       Optional[str]   = None
            rec_model_id:       Optional[str]   = None

            # ── Reconocimiento facial si la bbox cubre suficiente área ────────
            if coverage_pct >= facenet_bbox_min:
                # Recortar el crop de la persona detectada
                x, y, w, h = bbox["x"], bbox["y"], bbox["w"], bbox["h"]
                crop = frame[
                    max(0, y): min(frame.shape[0], y + h),
                    max(0, x): min(frame.shape[1], x + w),
                ]

                if crop.size > 0:
                    embedding = recognizer.extract_embedding(crop)

                    if embedding is not None:
                        match = recognizer.find_best_match(embedding, facenet_similarity)

                        if match:
                            detection_type    = "face_match"
                            similarity        = match["similarity"]
                            matched_person_id = match["person_id"]
                        else:
                            detection_type = "face_candidate"

                        # Capturar snapshot del crop en JPEG codificado como base64
                        try:
                            encode_ok, img_buf = cv2.imencode(".jpg", crop)
                            if encode_ok:
                                snapshot_b64 = base64.b64encode(
                                    img_buf.tobytes()
                                ).decode("utf-8")
                        except Exception:
                            logger.error(
                                "Error al codificar snapshot JPEG", exc_info=True
                            )

            # ── Deduplicación espacio-temporal ────────────────────────────────
            if deduplicator.is_duplicate(bbox_cx, bbox_cy, matched_person_id, frame_ts):
                continue

            deduplicator.register(bbox_cx, bbox_cy, matched_person_id, frame_ts)

            # ── Interpolación GPS ─────────────────────────────────────────────
            try:
                gps = await get_gps_for_timestamp(
                    redis_client,
                    settings.redis_stream_telemetry,
                    frame_ts,
                    gps_window_ms,
                )
            except Exception:
                logger.error("Error al interpolación GPS", exc_info=True)
                gps = {
                    "lat": None, "lng": None,
                    "altitude_m": None, "interpolated": False, "available": False,
                }

            # Timestamp ISO 8601 del frame
            frame_timestamp_iso = datetime.fromtimestamp(
                frame_ts, tz=timezone.utc
            ).isoformat()

            # ── Publicar en Redis Stream ──────────────────────────────────────
            # Schema exacto esperado por detection_consumer.py (BE-5)
            await publisher.publish(
                {
                    "mission_id":             mission["mission_id"],
                    "drone_id":               mission["drone_id"],
                    "detection_type":         detection_type,
                    "yolo_confidence":        round(yolo_conf, 4),
                    "similarity_score":       round(similarity, 4) if similarity is not None else 0.0,
                    "matched_person_id":      matched_person_id,
                    "bbox":                   bbox,
                    "gps": {
                        "lat":        gps.get("lat"),
                        "lng":        gps.get("lng"),
                        "altitude_m": gps.get("altitude_m"),
                    },
                    "snapshot_b64":           snapshot_b64,
                    "frame_timestamp":        frame_timestamp_iso,
                    "ai_model_detection_id":  None,  # resuelto en detection_consumer.py
                    "ai_model_recognition_id": None,
                    # Campos extra para que detection_consumer.py resuelva FKs
                    "missing_person_id":      mission["missing_person_id"],
                }
            )

            logger.info(
                "Detección publicada: tipo=%s conf=%.2f sim=%s mission=%s",
                detection_type, yolo_conf,
                f"{similarity:.3f}" if similarity else "—",
                mission["mission_id"],
            )

        # Ceder el event loop para que otras coroutines puedan ejecutarse
        await asyncio.sleep(0)


# ── Punto de entrada ──────────────────────────────────────────────────────────

if __name__ == "__main__":
    asyncio.run(run())

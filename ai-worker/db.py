# =============================================================================
# AEROFINDER AI Worker — Capa de acceso a la base de datos PostgreSQL
# Rol: aerofinder_worker (permisos restringidos definidos en 06_security.sql)
# =============================================================================

import logging
import uuid
from typing import Optional

import numpy as np
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from config import settings

logger = logging.getLogger(__name__)

# ── Motor async ───────────────────────────────────────────────────────────────
engine = create_async_engine(
    settings.database_url,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


# ── Consultas ─────────────────────────────────────────────────────────────────

async def get_active_mission_with_recognition() -> Optional[dict]:
    """
    Busca la primera misión activa que tiene recognition_active=true.
    Retorna dict con mission_id, drone_id, drone_serial_number, missing_person_id
    o None si no hay ninguna.
    El AI worker procesa esta misión hasta que recognition_active se desactive
    o la misión cambie de estado.
    """
    try:
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                text(
                    """
                    SELECT
                        m.id                AS mission_id,
                        md.drone_id         AS drone_id,
                        d.serial_number     AS drone_serial_number,
                        m.missing_person_id
                    FROM missions m
                    JOIN mission_drones md ON md.mission_id = m.id
                    JOIN drones d ON d.id = md.drone_id
                    WHERE m.status = 'active'
                      AND m.recognition_active = TRUE
                      AND md.left_at IS NULL
                    ORDER BY m.started_at DESC
                    LIMIT 1
                    """
                ),
            )
            row = result.mappings().one_or_none()
            if row is None:
                return None
            return {
                "mission_id": str(row["mission_id"]),
                "drone_id": str(row["drone_id"]),
                "drone_serial_number": str(row["drone_serial_number"]),
                "missing_person_id": str(row["missing_person_id"]),
            }
    except Exception:
        logger.error("Error al buscar misión activa con reconocimiento", exc_info=True)
        return None


async def is_mission_recognition_still_active(mission_id: str) -> bool:
    """
    Verifica si la misión sigue activa y con recognition_active=true.
    Se llama periódicamente desde el loop de procesamiento para detectar
    cuando el admin desactiva el reconocimiento o cambia el estado de la misión.
    """
    try:
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                text(
                    """
                    SELECT 1
                    FROM missions
                    WHERE id = :mission_id
                      AND status = 'active'
                      AND recognition_active = TRUE
                    """
                ),
                {"mission_id": mission_id},
            )
            return result.one_or_none() is not None
    except Exception:
        logger.error(
            "Error al verificar estado de reconocimiento misión id=%s", mission_id, exc_info=True
        )
        return False


async def load_embeddings_for_person(missing_person_id: str) -> list[dict]:
    """
    Carga todos los embeddings faciales activos de la persona buscada.
    Retorna lista de dicts con: embedding_id, vector (numpy array),
    person_id, model_id.
    """
    try:
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                text(
                    """
                    SELECT
                        fe.id           AS embedding_id,
                        fe.embedding    AS vector,
                        pp.missing_person_id AS person_id,
                        fe.model_id
                    FROM face_embeddings fe
                    JOIN person_photos pp ON pp.id = fe.photo_id
                    WHERE pp.missing_person_id = :person_id
                      AND pp.is_active = TRUE
                      AND pp.has_embedding = TRUE
                    """
                ),
                {"person_id": missing_person_id},
            )
            rows = result.mappings().all()

        embeddings: list[dict] = []
        for row in rows:
            # Convertir vector pgvector → numpy array float32 normalizado
            raw_vector = row["vector"]
            if isinstance(raw_vector, str):
                # pgvector retorna strings en formato "[0.1, 0.2, ...]"
                values = [float(v) for v in raw_vector.strip("[]").split(",")]
                vector = np.array(values, dtype=np.float32)
            else:
                vector = np.array(raw_vector, dtype=np.float32)

            norm = np.linalg.norm(vector)
            if norm > 0:
                vector = vector / norm

            embeddings.append(
                {
                    "embedding_id": str(row["embedding_id"]),
                    "vector": vector,
                    "person_id": str(row["person_id"]),
                    "model_id": str(row["model_id"]),
                }
            )

        logger.info(
            "Embeddings cargados: %d para person_id=%s", len(embeddings), missing_person_id
        )
        return embeddings
    except Exception:
        logger.error(
            "Error al cargar embeddings para person_id=%s", missing_person_id, exc_info=True
        )
        return []


async def insert_detection(detection_data: dict) -> str:
    """
    Inserta una fila en la tabla detections.
    Retorna el UUID generado por PostgreSQL.
    """
    try:
        async with AsyncSessionLocal() as session:
            async with session.begin():
                result = await session.execute(
                    text(
                        """
                        INSERT INTO detections (
                            mission_id, drone_id, missing_person_id,
                            detection_model_id, recognition_model_id,
                            frame_timestamp, yolo_confidence, facenet_similarity,
                            bounding_box, gps_latitude, gps_longitude,
                            snapshot_file_id
                        ) VALUES (
                            :mission_id, :drone_id, :missing_person_id,
                            :detection_model_id, :recognition_model_id,
                            :frame_timestamp, :yolo_confidence, :facenet_similarity,
                            :bounding_box::jsonb, :gps_latitude, :gps_longitude,
                            :snapshot_file_id
                        )
                        RETURNING id
                        """
                    ),
                    {
                        "mission_id": detection_data["mission_id"],
                        "drone_id": detection_data["drone_id"],
                        "missing_person_id": detection_data["missing_person_id"],
                        "detection_model_id": detection_data.get("detection_model_id"),
                        "recognition_model_id": detection_data.get("recognition_model_id"),
                        "frame_timestamp": detection_data["frame_timestamp"],
                        "yolo_confidence": detection_data["yolo_confidence"],
                        "facenet_similarity": detection_data.get("facenet_similarity", 0.0),
                        "bounding_box": detection_data.get("bounding_box", "{}"),
                        "gps_latitude": detection_data.get("gps_latitude"),
                        "gps_longitude": detection_data.get("gps_longitude"),
                        "snapshot_file_id": detection_data.get("snapshot_file_id"),
                    },
                )
                row = result.one()
                detection_id = str(row[0])
        logger.debug("Detección insertada en DB: id=%s", detection_id)
        return detection_id
    except Exception:
        logger.error("Error al insertar detección en DB", exc_info=True)
        raise


async def insert_telemetry(telemetry_data: dict) -> None:
    """
    Inserta un registro en drone_telemetry_raw.
    La tabla está particionada por recorded_at; no lanzar excepción si falla
    para no interrumpir el loop de captura de frames.
    """
    try:
        async with AsyncSessionLocal() as session:
            async with session.begin():
                await session.execute(
                    text(
                        """
                        INSERT INTO drone_telemetry_raw (
                            drone_id, mission_id, recorded_at,
                            latitude, longitude, altitude_m,
                            battery_pct, heading_deg, speed_mps
                        ) VALUES (
                            :drone_id, :mission_id, :recorded_at,
                            :latitude, :longitude, :altitude_m,
                            :battery_pct, :heading_deg, :speed_mps
                        )
                        """
                    ),
                    {
                        "drone_id": telemetry_data["drone_id"],
                        "mission_id": telemetry_data["mission_id"],
                        "recorded_at": telemetry_data["recorded_at"],
                        "latitude": telemetry_data["latitude"],
                        "longitude": telemetry_data["longitude"],
                        "altitude_m": telemetry_data.get("altitude_m"),
                        "battery_pct": telemetry_data.get("battery_pct"),
                        "heading_deg": telemetry_data.get("heading_deg"),
                        "speed_mps": telemetry_data.get("speed_mps"),
                    },
                )
        logger.debug(
            "Telemetría insertada: drone=%s ts=%s",
            telemetry_data["drone_id"], telemetry_data["recorded_at"],
        )
    except Exception:
        logger.error("Error al insertar telemetría en DB", exc_info=True)


async def load_system_config(keys: list[str]) -> dict:
    """
    Carga parámetros específicos de system_config.
    Retorna dict {config_key: value_text} para los keys solicitados.
    """
    try:
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                text(
                    """
                    SELECT config_key, value_text, value_type
                    FROM system_config
                    WHERE config_key = ANY(:keys)
                    """
                ),
                {"keys": keys},
            )
            rows = result.mappings().all()

        config: dict = {}
        for row in rows:
            raw = row["value_text"]
            vtype = row["value_type"]
            try:
                if vtype == "integer":
                    config[row["config_key"]] = int(raw)
                elif vtype == "float":
                    config[row["config_key"]] = float(raw)
                elif vtype == "boolean":
                    config[row["config_key"]] = raw.lower() in ("true", "1", "yes")
                else:
                    config[row["config_key"]] = raw
            except (ValueError, TypeError):
                config[row["config_key"]] = raw
        return config
    except Exception:
        logger.error("Error al cargar system_config desde DB", exc_info=True)
        return {}


async def get_photos_pending_embedding() -> list[dict]:
    """
    Retorna fotos activas que aún no tienen embedding generado.
    Incluye object_key para descargar desde MinIO.
    """
    try:
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                text(
                    """
                    SELECT
                        pp.id           AS photo_id,
                        pp.missing_person_id,
                        f.bucket,
                        f.object_key
                    FROM person_photos pp
                    JOIN files f ON f.id = pp.file_id
                    WHERE pp.is_active = TRUE
                      AND pp.has_embedding = FALSE
                      AND f.upload_status = 'uploaded'
                    ORDER BY pp.created_at ASC
                    LIMIT 10
                    """
                )
            )
            return [dict(row) for row in result.mappings()]
    except Exception:
        logger.error("Error al consultar fotos pendientes de embedding", exc_info=True)
        return []


async def get_active_mission_streams() -> list[dict]:
    """
    Retorna todos los pares (misión, dron) activos con recognition_active=TRUE.
    El supervisor usa esta lista para iniciar/cancelar tasks por serial.
    Incluye face_recognition_active para configurar cada tarea.
    """
    try:
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                text(
                    """
                    SELECT
                        m.id                    AS mission_id,
                        md.drone_id             AS drone_id,
                        d.serial_number         AS drone_serial_number,
                        m.missing_person_id,
                        m.face_recognition_active
                    FROM missions m
                    JOIN mission_drones md ON md.mission_id = m.id
                    JOIN drones d ON d.id = md.drone_id
                    WHERE m.status = 'active'
                      AND m.recognition_active = TRUE
                      AND md.left_at IS NULL
                    ORDER BY m.started_at DESC
                    """
                )
            )
            rows = result.mappings().all()
            return [
                {
                    "mission_id":              str(row["mission_id"]),
                    "drone_id":                str(row["drone_id"]),
                    "drone_serial_number":     str(row["drone_serial_number"]),
                    "missing_person_id":       str(row["missing_person_id"]),
                    "face_recognition_active": bool(row["face_recognition_active"]),
                }
                for row in rows
            ]
    except Exception:
        logger.error("Error al consultar streams activos de misiones", exc_info=True)
        return []


async def get_field_report_data(report_id: str) -> Optional[dict]:
    """
    Retorna los datos del field report necesarios para el análisis:
    rescuer_id, mission_id y lista de object names de fotos en MinIO.
    """
    try:
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                text(
                    """
                    SELECT
                        fr.mission_id,
                        fr.rescuer_id,
                        frp.minio_object
                    FROM field_reports fr
                    JOIN field_report_photos frp ON frp.field_report_id = fr.id
                    WHERE fr.id = :report_id
                    ORDER BY frp.uploaded_at ASC
                    """
                ),
                {"report_id": report_id},
            )
            rows = result.mappings().all()
        if not rows:
            return None
        return {
            "mission_id":  str(rows[0]["mission_id"]),
            "rescuer_id":  str(rows[0]["rescuer_id"]),
            "photos":      [row["minio_object"] for row in rows],
        }
    except Exception:
        logger.error("Error al obtener datos del field report %s", report_id, exc_info=True)
        return None


async def search_similar_persons(query_vector: "np.ndarray", top_k: int = 3) -> list[dict]:
    """
    Busca las top_k personas más similares al vector de consulta usando
    pgvector cosine distance (<=>). Devuelve lista con person_id, similarity_score y rank.
    """
    vector_str = "[" + ",".join(str(float(v)) for v in query_vector) + "]"
    try:
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                text(
                    """
                    SELECT
                        pp.missing_person_id,
                        MIN(fe.embedding <=> :query::vector) AS distance
                    FROM face_embeddings fe
                    JOIN person_photos pp ON pp.id = fe.photo_id
                    WHERE pp.is_active = TRUE
                      AND pp.has_embedding = TRUE
                    GROUP BY pp.missing_person_id
                    ORDER BY distance ASC
                    LIMIT :top_k
                    """
                ),
                {"query": vector_str, "top_k": top_k},
            )
            rows = result.mappings().all()
        return [
            {
                "person_id":        str(row["missing_person_id"]),
                "similarity_score": round(max(0.0, 1.0 - float(row["distance"])), 4),
                "rank":             i + 1,
            }
            for i, row in enumerate(rows)
        ]
    except Exception:
        logger.error("Error al buscar personas similares en pgvector", exc_info=True)
        return []


async def save_field_report_results(
    report_id: str,
    mission_id: str,
    rescuer_id: str,
    matches: list[dict],
) -> None:
    """
    Guarda los matches del análisis en field_report_matches y actualiza
    el estado del field_report a 'completed'.
    """
    try:
        async with AsyncSessionLocal() as session:
            async with session.begin():
                for m in matches:
                    await session.execute(
                        text(
                            """
                            INSERT INTO field_report_matches
                                (field_report_id, person_id, similarity_score, rank)
                            VALUES (:report_id, :person_id, :score, :rank)
                            """
                        ),
                        {
                            "report_id": report_id,
                            "person_id": m["person_id"],
                            "score":     m["similarity_score"],
                            "rank":      m["rank"],
                        },
                    )
                await session.execute(
                    text(
                        """
                        UPDATE field_reports
                        SET status       = 'completed',
                            completed_at = NOW()
                        WHERE id = :report_id
                        """
                    ),
                    {"report_id": report_id},
                )
        logger.info(
            "Resultados guardados: report_id=%s matches=%d", report_id, len(matches)
        )
    except Exception:
        logger.error(
            "Error al guardar resultados del field report %s", report_id, exc_info=True
        )
        raise


async def insert_face_embedding(photo_id: str, missing_person_id: str, vector: "np.ndarray") -> None:
    """
    Inserta el vector facial en face_embeddings y actualiza has_embedding en person_photos.
    El trigger trg_face_embeddings_mark_photo_ready hace el UPDATE automáticamente.
    Requiere el model_id del modelo InsightFace registrado en ai_models.
    """
    try:
        async with AsyncSessionLocal() as session:
            async with session.begin():
                # Obtener o crear el ai_model para InsightFace buffalo_l
                result = await session.execute(
                    text(
                        """
                        SELECT id FROM ai_models
                        WHERE name = 'insightface_buffalo_l'
                        LIMIT 1
                        """
                    )
                )
                row = result.one_or_none()
                if row is None:
                    result = await session.execute(
                        text(
                            """
                            INSERT INTO ai_models (name, version, task, framework)
                            VALUES ('insightface_buffalo_l', '1.0', 'face_recognition', 'onnxruntime')
                            RETURNING id
                            """
                        )
                    )
                    row = result.one()
                model_id = row[0]

                vector_str = "[" + ",".join(str(float(v)) for v in vector) + "]"
                await session.execute(
                    text(
                        """
                        INSERT INTO face_embeddings (photo_id, model_id, embedding)
                        VALUES (:photo_id, :model_id, :embedding::vector)
                        ON CONFLICT (photo_id, model_id) DO NOTHING
                        """
                    ),
                    {
                        "photo_id": photo_id,
                        "model_id": str(model_id),
                        "embedding": vector_str,
                    },
                )
        logger.info("Embedding insertado para photo_id=%s", photo_id)
    except Exception:
        logger.error("Error al insertar embedding para photo_id=%s", photo_id, exc_info=True)

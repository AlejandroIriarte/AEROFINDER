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

async def get_active_mission_for_stream(stream_key: str) -> Optional[dict]:
    """
    Busca la misión activa asignada al dron identificado por stream_key.
    stream_key corresponde al drone_id (UUID como string) del dron que este
    worker procesa. Retorna dict con mission_id, drone_id, missing_person_id
    o None si no hay misión activa para ese dron.
    """
    try:
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                text(
                    """
                    SELECT
                        m.id            AS mission_id,
                        md.drone_id     AS drone_id,
                        m.missing_person_id
                    FROM missions m
                    JOIN mission_drones md ON md.mission_id = m.id
                    WHERE m.status = 'active'
                      AND md.drone_id = :drone_id
                      AND md.left_at IS NULL
                    ORDER BY m.started_at DESC
                    LIMIT 1
                    """
                ),
                {"drone_id": stream_key},
            )
            row = result.mappings().one_or_none()
            if row is None:
                return None
            return {
                "mission_id": str(row["mission_id"]),
                "drone_id": str(row["drone_id"]),
                "missing_person_id": str(row["missing_person_id"]),
            }
    except Exception:
        logger.error(
            "Error al buscar misión activa para stream_key=%s", stream_key, exc_info=True
        )
        return None


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

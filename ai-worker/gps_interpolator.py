# =============================================================================
# AEROFINDER AI Worker — Interpolador GPS desde Redis Stream de telemetría
# Lee los puntos GPS más cercanos al timestamp del frame y los interpola.
# =============================================================================

import json
import logging
from typing import Any, Optional

logger = logging.getLogger(__name__)

# Resultado vacío cuando no hay datos de GPS disponibles
_NO_GPS: dict = {
    "lat": None,
    "lng": None,
    "altitude_m": None,
    "interpolated": False,
    "available": False,
}


def _lerp(a: float, b: float, t: float) -> float:
    """Interpolación lineal entre a y b con factor t ∈ [0, 1]."""
    return a + (b - a) * t


async def get_gps_for_timestamp(
    redis_client: Any,
    stream_key: str,
    target_ts: float,
    window_ms: int = 500,
) -> dict:
    """
    Obtiene coordenadas GPS interpoladas para el timestamp de un frame.

    Busca en el Redis Stream (stream_key) los mensajes dentro de la ventana
    temporal [target_ts - window_ms, target_ts + window_ms] filtrando por
    el drone_id configurado en settings. Interpola linealmente entre los
    2 puntos más cercanos al target_ts.

    Retorna dict con:
      {"lat": float, "lng": float, "altitude_m": float,
       "interpolated": bool, "available": True}
    o {"lat": None, "lng": None, "altitude_m": None,
       "interpolated": False, "available": False}
    """
    from config import settings

    # Convertir ventana de tiempo a milisegundos para los IDs del Redis Stream
    half_window_ms = window_ms
    start_ms = int(target_ts * 1000) - half_window_ms
    end_ms   = int(target_ts * 1000) + half_window_ms

    # Asegurar IDs válidos (los IDs de Redis Stream son ms no negativos)
    start_id = f"{max(0, start_ms)}-0"
    end_id   = f"{end_ms}-999"

    try:
        messages = await redis_client.xrange(
            stream_key, min=start_id, max=end_id, count=200
        )
    except Exception:
        logger.error(
            "Error al leer stream de telemetría %s para interpolación GPS",
            stream_key, exc_info=True,
        )
        return _NO_GPS

    if not messages:
        logger.debug(
            "Sin puntos GPS en ventana [%d, %d] ms para drone %s",
            start_ms, end_ms, settings.drone_id,
        )
        return _NO_GPS

    # Parsear los mensajes y filtrar por drone_id del worker actual
    points: list[dict] = []
    for _msg_id, fields in messages:
        try:
            raw_data = fields.get("data", "{}")
            data: dict = json.loads(raw_data)

            # Filtrar mensajes del dron de este worker
            if str(data.get("drone_id", "")) != settings.drone_id:
                continue

            lat        = data.get("lat") or data.get("latitude")
            lng        = data.get("lng") or data.get("longitude")
            altitude_m = data.get("altitude_m")
            # El timestamp puede venir como campo explícito o inferirse del ID del stream
            ts_raw = data.get("timestamp")
            if ts_raw is not None:
                ts = float(ts_raw)
            else:
                # Inferir desde el ID del mensaje: "{ms}-{seq}"
                ts = int(str(_msg_id).split("-")[0]) / 1000.0

            if lat is None or lng is None:
                continue

            points.append(
                {
                    "lat": float(lat),
                    "lng": float(lng),
                    "altitude_m": float(altitude_m) if altitude_m is not None else None,
                    "ts": ts,
                }
            )
        except (json.JSONDecodeError, ValueError, TypeError):
            logger.error(
                "Error al parsear mensaje de telemetría: %s", fields, exc_info=True
            )
            continue

    if not points:
        return _NO_GPS

    if len(points) == 1:
        # Solo un punto: retornar sin interpolar
        p = points[0]
        return {
            "lat": p["lat"],
            "lng": p["lng"],
            "altitude_m": p["altitude_m"],
            "interpolated": False,
            "available": True,
        }

    # Ordenar por timestamp y encontrar los 2 puntos más cercanos al target_ts
    points.sort(key=lambda p: p["ts"])

    # Buscar el punto anterior y el siguiente respecto al target_ts
    before: Optional[dict] = None
    after:  Optional[dict] = None

    for p in points:
        if p["ts"] <= target_ts:
            before = p
        else:
            if after is None:
                after = p
            break

    if before is None:
        # Todos los puntos son posteriores al target; usar el más cercano
        p = min(points, key=lambda x: abs(x["ts"] - target_ts))
        return {
            "lat": p["lat"],
            "lng": p["lng"],
            "altitude_m": p["altitude_m"],
            "interpolated": False,
            "available": True,
        }

    if after is None:
        # Todos los puntos son anteriores al target; usar el más cercano
        return {
            "lat": before["lat"],
            "lng": before["lng"],
            "altitude_m": before["altitude_m"],
            "interpolated": False,
            "available": True,
        }

    # Interpolación lineal entre before y after
    dt = after["ts"] - before["ts"]
    t  = (target_ts - before["ts"]) / dt if dt > 0 else 0.0
    t  = max(0.0, min(1.0, t))  # clamp a [0, 1]

    lat_i = _lerp(before["lat"], after["lat"], t)
    lng_i = _lerp(before["lng"], after["lng"], t)

    alt_i: Optional[float] = None
    if before["altitude_m"] is not None and after["altitude_m"] is not None:
        alt_i = _lerp(before["altitude_m"], after["altitude_m"], t)

    return {
        "lat": round(lat_i, 8),
        "lng": round(lng_i, 8),
        "altitude_m": round(alt_i, 2) if alt_i is not None else None,
        "interpolated": True,
        "available": True,
    }

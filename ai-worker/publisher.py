# =============================================================================
# AEROFINDER AI Worker — Publicador de detecciones al Redis Stream
# Schema del mensaje definido en BE-5 (detection_consumer.py).
# =============================================================================

import json
import logging
from typing import Any

logger = logging.getLogger(__name__)


class RedisPublisher:
    """
    Publica mensajes de detección al Redis Stream especificado.
    El consumer BE-5 (detection_consumer.py) espera el campo "data"
    como JSON string con el schema completo de la detección.
    """

    def __init__(self, redis_client: Any, stream_name: str) -> None:
        self._redis  = redis_client
        self._stream = stream_name

    async def publish(self, detection_data: dict) -> None:
        """
        Serializa detection_data y lo publica al stream via XADD.
        El mensaje tiene un solo campo "data" con el JSON completo.
        Loguea el ID asignado por Redis tras la inserción.
        """
        try:
            payload = json.dumps(detection_data, default=str, ensure_ascii=False)
            msg_id = await self._redis.xadd(self._stream, {"data": payload})
            logger.debug(
                "Detección publicada en stream %s: id=%s tipo=%s",
                self._stream, msg_id, detection_data.get("detection_type"),
            )
        except Exception:
            logger.error(
                "Error al publicar detección en Redis Stream %s",
                self._stream, exc_info=True,
            )

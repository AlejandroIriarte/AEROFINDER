# =============================================================================
# AEROFINDER AI Worker — Deduplicador espacio-temporal de detecciones
# Evita publicar la misma detección múltiples veces dentro de una ventana
# de tiempo y un radio de pixels configurados.
# =============================================================================

import logging
import math
from collections import deque
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass
class _DetectionRecord:
    """Registro interno de una detección para comparación espacio-temporal."""
    bbox_cx: int          # centroide X de la bounding box en pixels
    bbox_cy: int          # centroide Y de la bounding box en pixels
    person_id: Optional[str]  # UUID de la persona matcheada, o None si no hubo match
    timestamp: float          # Unix timestamp del frame (segundos)


class SpatioTemporalDeduplicator:
    """
    Descarta detecciones duplicadas dentro de una ventana temporal + radio espacial.
    Criterios para considerar duplicado:
      1. El timestamp del nuevo evento está dentro de window_seconds del registro.
      2. La distancia euclidiana entre centroides es < pixel_radius.
      3. El person_id es el mismo (ambos None cuenta como igual).
    """

    def __init__(self, window_seconds: float = 8.0, pixel_radius: int = 80) -> None:
        self._window_seconds = window_seconds
        self._pixel_radius = pixel_radius
        # Deque sin límite de tamaño; la limpieza por tiempo evita crecimiento ilimitado
        self._records: deque[_DetectionRecord] = deque()

    def _purge_expired(self, now: float) -> None:
        """Elimina registros más antiguos que la ventana temporal."""
        cutoff = now - self._window_seconds
        while self._records and self._records[0].timestamp < cutoff:
            self._records.popleft()

    def is_duplicate(
        self,
        bbox_cx: int,
        bbox_cy: int,
        person_id: Optional[str],
        now: float,
    ) -> bool:
        """
        Retorna True si la detección es un duplicado de una ya registrada
        dentro de la ventana espacio-temporal.
        """
        self._purge_expired(now)

        for record in self._records:
            # Solo comparar contra registros con el mismo person_id
            # (ambos None también se considera igual — misma silueta sin match)
            if record.person_id != person_id:
                continue

            # Distancia euclidiana entre centroides
            dist = math.sqrt(
                (bbox_cx - record.bbox_cx) ** 2
                + (bbox_cy - record.bbox_cy) ** 2
            )
            if dist < self._pixel_radius:
                logger.debug(
                    "Detección duplicada descartada: person_id=%s dist=%.1f px",
                    person_id, dist,
                )
                return True

        return False

    def register(
        self,
        bbox_cx: int,
        bbox_cy: int,
        person_id: Optional[str],
        now: float,
    ) -> None:
        """Registra la detección en el historial espacio-temporal."""
        self._records.append(
            _DetectionRecord(
                bbox_cx=bbox_cx,
                bbox_cy=bbox_cy,
                person_id=person_id,
                timestamp=now,
            )
        )

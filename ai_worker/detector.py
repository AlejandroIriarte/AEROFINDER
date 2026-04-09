# =============================================================================
# AEROFINDER AI Worker — Detector de siluetas humanas con YOLOv8n
# Solo procesa clase "person" (class_id = 0).
# =============================================================================

import logging
import os
import shutil
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)

# Clase "person" en COCO dataset (usada por YOLOv8)
_PERSON_CLASS_ID = 0


class YOLODetector:
    """
    Wrapper sobre ultralytics.YOLO para detección de siluetas humanas.
    Descarga el modelo automáticamente si no existe en el path configurado.
    """

    def __init__(self, model_path: str) -> None:
        # Importación diferida: ultralytics carga CUDA al importar
        from ultralytics import YOLO

        if not os.path.exists(model_path):
            logger.warning(
                "Modelo YOLO no encontrado en %s; descargando yolov8n.pt...", model_path
            )
            try:
                # Descarga automática desde Ultralytics Hub al directorio actual
                tmp_model = YOLO("yolov8n.pt")
                os.makedirs(os.path.dirname(model_path), exist_ok=True)
                shutil.move("yolov8n.pt", model_path)
                logger.info("Modelo YOLOv8n guardado en %s", model_path)
                self._model = tmp_model
            except Exception:
                logger.error(
                    "Error al descargar modelo YOLOv8n a %s", model_path, exc_info=True
                )
                raise
        else:
            try:
                self._model = YOLO(model_path)
                logger.info("Modelo YOLOv8n cargado desde %s", model_path)
            except Exception:
                logger.error(
                    "Error al cargar modelo YOLO desde %s", model_path, exc_info=True
                )
                raise

    def detect(
        self,
        frame: np.ndarray,
        confidence_threshold: float,
    ) -> list[dict]:
        """
        Corre inferencia YOLO sobre el frame y retorna las detecciones de personas.
        Solo se incluyen detecciones de clase "person" (class_id=0) con confianza
        >= confidence_threshold.

        Retorna lista de dicts:
        {
          "bbox": {"x": int, "y": int, "w": int, "h": int,
                   "frame_w": int, "frame_h": int},
          "coverage_pct": float,   # porcentaje del frame cubierto por la bbox
          "confidence": float
        }
        """
        try:
            frame_h, frame_w = frame.shape[:2]
            frame_area = frame_h * frame_w

            # Inferencia sin verbose para no saturar los logs
            results = self._model(frame, verbose=False, conf=confidence_threshold)

            detections: list[dict] = []
            for result in results:
                if result.boxes is None:
                    continue
                for box in result.boxes:
                    class_id = int(box.cls[0].item())
                    if class_id != _PERSON_CLASS_ID:
                        continue

                    confidence = float(box.conf[0].item())
                    # Coordenadas en formato xyxy (esquina superior izquierda + inferior derecha)
                    x1, y1, x2, y2 = box.xyxy[0].tolist()
                    x, y = int(x1), int(y1)
                    w = int(x2 - x1)
                    h = int(y2 - y1)

                    bbox_area = w * h
                    coverage_pct = (bbox_area / frame_area * 100.0) if frame_area > 0 else 0.0

                    detections.append(
                        {
                            "bbox": {
                                "x": x,
                                "y": y,
                                "w": w,
                                "h": h,
                                "frame_w": frame_w,
                                "frame_h": frame_h,
                            },
                            "coverage_pct": round(coverage_pct, 4),
                            "confidence": round(confidence, 4),
                        }
                    )

            return detections
        except Exception:
            logger.error("Error durante inferencia YOLO", exc_info=True)
            return []

# =============================================================================
# AEROFINDER Backend — Servicio de análisis de fotos con OpenCV
# Detecta rostros (Haar Cascade), evalúa calidad y extrae atributos de color.
# No requiere GPU ni InsightFace — análisis ligero para feedback en tiempo real.
# =============================================================================

import logging
from typing import Optional

import cv2
import numpy as np

logger = logging.getLogger(__name__)

# Etiquetas legibles para los issues
_ISSUE_LABELS: dict[str, str] = {
    "no_face":        "No se detectó ningún rostro",
    "multiple_faces": "Se detectaron múltiples rostros",
    "blurry":         "La foto está desenfocada",
    "poor_lighting":  "Iluminación insuficiente",
    "overexposed":    "La foto está sobreexpuesta",
}


class FaceAnalyzer:
    """
    Singleton para análisis de imágenes con OpenCV.
    Carga los Haar Cascades una sola vez al primer uso.
    """

    _instance: Optional["FaceAnalyzer"] = None

    @classmethod
    def get(cls) -> "FaceAnalyzer":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def __init__(self) -> None:
        self._frontal_cascade = cv2.CascadeClassifier(
            cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        )
        self._profile_cascade = cv2.CascadeClassifier(
            cv2.data.haarcascades + "haarcascade_profileface.xml"
        )
        logger.info("FaceAnalyzer inicializado con Haar Cascades")

    def analyze(self, image_bytes: bytes) -> dict:
        """
        Analiza una imagen y retorna calidad y atributos faciales detectados.

        Returns:
            {
                "quality": {
                    "is_useful": bool,
                    "face_detected": bool,
                    "face_angle": str,
                    "blur_score": float,   # 0.0 (borroso) a 1.0 (nítido)
                    "issues": list[str],
                    "issue_labels": list[str],
                },
                "attributes": {
                    "skin_tone": str | None,
                    "hair_color": str | None,
                },
            }
        """
        try:
            nparr = np.frombuffer(image_bytes, np.uint8)
            img_bgr = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            if img_bgr is None:
                return self._error_result("Formato de imagen no reconocido")

            img_gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)

            # Detección frontal
            faces_frontal = self._frontal_cascade.detectMultiScale(
                img_gray, scaleFactor=1.1, minNeighbors=5, minSize=(60, 60)
            )
            face_angle = "frontal"
            faces = faces_frontal

            # Si no hay cara frontal, intentar perfil
            if len(faces_frontal) == 0:
                faces_profile = self._profile_cascade.detectMultiScale(
                    img_gray, scaleFactor=1.1, minNeighbors=5, minSize=(60, 60)
                )
                if len(faces_profile) > 0:
                    faces = faces_profile
                    face_angle = "profile"

            face_detected = len(faces) > 0
            multiple_faces = len(faces) > 1

            # Nitidez: varianza del Laplaciano normalizada
            lap_var = float(cv2.Laplacian(img_gray, cv2.CV_64F).var())
            blur_score = round(min(lap_var / 500.0, 1.0), 2)

            # Brillo promedio
            brightness = float(np.mean(img_gray)) / 255.0

            issues: list[str] = []
            if not face_detected:
                issues.append("no_face")
            if multiple_faces:
                issues.append("multiple_faces")
            if blur_score < 0.1:
                issues.append("blurry")
            if brightness < 0.2:
                issues.append("poor_lighting")
            elif brightness > 0.92:
                issues.append("overexposed")

            is_useful = (
                face_detected
                and not multiple_faces
                and blur_score >= 0.1
                and 0.2 <= brightness <= 0.92
            )

            attributes: dict = {}
            if face_detected and len(faces) > 0:
                x, y, w, h = max(faces, key=lambda f: int(f[2]) * int(f[3]))
                face_roi = img_bgr[int(y):int(y + h), int(x):int(x + w)]

                skin = self._detect_skin_tone(face_roi)
                if skin:
                    attributes["skin_tone"] = skin

                # Región de cabello: sobre el bounding box de la cara
                hair_y_start = max(0, int(y) - int(h) // 3)
                if hair_y_start < int(y):
                    hair_roi = img_bgr[hair_y_start:int(y), int(x):int(x + w)]
                    if hair_roi.size > 0:
                        hair = self._detect_hair_color(hair_roi)
                        if hair:
                            attributes["hair_color"] = hair

            return {
                "quality": {
                    "is_useful": is_useful,
                    "face_detected": face_detected,
                    "face_angle": face_angle if face_detected else "unknown",
                    "blur_score": blur_score,
                    "issues": issues,
                    "issue_labels": [_ISSUE_LABELS.get(i, i) for i in issues],
                },
                "attributes": attributes,
            }

        except Exception:
            logger.error("Error al analizar imagen", exc_info=True)
            return self._error_result("Error interno al procesar la imagen")

    def _detect_skin_tone(self, face_roi: np.ndarray) -> Optional[str]:
        """Clasifica el tono de piel por luminancia en espacio CIE Lab."""
        if face_roi.size == 0:
            return None
        try:
            # Máscara de piel en HSV (hue 0-35, sat moderado)
            hsv = cv2.cvtColor(face_roi, cv2.COLOR_BGR2HSV)
            lower = np.array([0, 15, 40], dtype=np.uint8)
            upper = np.array([35, 255, 255], dtype=np.uint8)
            mask = cv2.inRange(hsv, lower, upper)

            if cv2.countNonZero(mask) < 80:
                return None

            lab = cv2.cvtColor(face_roi, cv2.COLOR_BGR2Lab)
            l_channel = lab[:, :, 0]
            skin_pixels = l_channel[mask > 0]
            if len(skin_pixels) == 0:
                return None

            avg_l = float(np.mean(skin_pixels))

            if avg_l > 185:
                return "muy_claro"
            elif avg_l > 162:
                return "claro"
            elif avg_l > 132:
                return "medio"
            elif avg_l > 100:
                return "moreno"
            else:
                return "oscuro"
        except Exception:
            return None

    def _detect_hair_color(self, hair_roi: np.ndarray) -> Optional[str]:
        """Clasifica el color de cabello dominante en la región superior."""
        if hair_roi.size == 0:
            return None
        try:
            hsv = cv2.cvtColor(hair_roi, cv2.COLOR_BGR2HSV)
            avg_h = float(np.mean(hsv[:, :, 0]))
            avg_s = float(np.mean(hsv[:, :, 1]))
            avg_v = float(np.mean(hsv[:, :, 2]))

            if avg_v > 200 and avg_s < 25:
                return "blanco"
            if avg_v > 150 and avg_s < 45:
                return "canoso"
            if avg_v < 55:
                return "negro"
            if 12 <= avg_h <= 38 and avg_v > 115 and avg_s > 55:
                return "rubio"
            if avg_h < 12 and avg_s > 80:
                return "pelirrojo"
            if avg_v < 115:
                return "castaño"
            return "castaño"
        except Exception:
            return None

    @staticmethod
    def _error_result(message: str) -> dict:
        return {
            "quality": {
                "is_useful": False,
                "face_detected": False,
                "face_angle": "unknown",
                "blur_score": 0.0,
                "issues": ["error"],
                "issue_labels": [message],
            },
            "attributes": {},
        }

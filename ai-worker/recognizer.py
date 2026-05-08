# =============================================================================
# AEROFINDER AI Worker — Reconocimiento facial con InsightFace buffalo_l
# Genera embeddings de 512 dimensiones y compara por similitud coseno.
# =============================================================================

import logging
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)


class FaceRecognizer:
    """
    Wrapper sobre InsightFace FaceAnalysis (buffalo_l).
    Extrae embeddings faciales y los compara contra un caché de referencia
    usando similitud coseno (vectores ya normalizados → producto escalar).
    """

    def __init__(self, model_dir: str) -> None:
        try:
            import insightface
            from insightface.app import FaceAnalysis

            self._app = FaceAnalysis(
                name="buffalo_l",
                root=model_dir,
                providers=["CUDAExecutionProvider", "CPUExecutionProvider"],
            )
            # ctx_id=0 → GPU 0; det_size=(640,640) para mayor precisión
            self._app.prepare(ctx_id=0, det_size=(640, 640))
            logger.info("InsightFace buffalo_l inicializado desde %s", model_dir)
        except Exception:
            logger.error(
                "Error al inicializar InsightFace desde %s", model_dir, exc_info=True
            )
            raise

        # Caché de embeddings de referencia; cargados desde DB al inicio
        self._embeddings_cache: list[dict] = []

    def load_embeddings(self, embeddings_list: list[dict]) -> None:
        """
        Reemplaza el caché de embeddings de referencia con los recibidos.
        Cada dict debe tener: embedding_id, vector (numpy array), person_id, model_id.
        """
        self._embeddings_cache = embeddings_list
        logger.info(
            "Embeddings de referencia cargados: %d vectores en caché",
            len(self._embeddings_cache),
        )

    def extract_embedding(self, face_crop: np.ndarray) -> Optional[np.ndarray]:
        """
        Extrae el embedding del primer rostro detectado en el crop.
        Retorna el vector normalizado (float32, 512 dims) o None si no detecta cara.
        """
        try:
            if face_crop is None or face_crop.size == 0:
                return None

            faces = self._app.get(face_crop)
            if not faces:
                return None

            # Tomar el rostro con mayor área de bounding box (el más prominente)
            best_face = max(
                faces,
                key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]),
            )

            embedding = best_face.normed_embedding  # ya normalizado por InsightFace
            if embedding is None:
                return None

            vector = np.array(embedding, dtype=np.float32)
            # Re-normalizar por seguridad ante posibles variaciones numéricas
            norm = np.linalg.norm(vector)
            if norm > 0:
                vector = vector / norm
            return vector
        except Exception:
            logger.error("Error al extraer embedding facial", exc_info=True)
            return None

    def find_best_match(
        self,
        query_embedding: np.ndarray,
        threshold: float,
    ) -> Optional[dict]:
        """
        Busca el mejor match del query_embedding en el caché de referencia.
        Usa similitud coseno: dot(a, b) con ambos vectores normalizados.
        Retorna {"person_id": str, "similarity": float, "embedding_id": str}
        si la mejor similitud >= threshold, o None si no hay match.
        """
        if not self._embeddings_cache:
            return None

        best_similarity = -1.0
        best_entry: Optional[dict] = None

        try:
            for entry in self._embeddings_cache:
                ref_vector = entry["vector"]
                # Similitud coseno: producto escalar de vectores normalizados
                similarity = float(np.dot(query_embedding, ref_vector))
                if similarity > best_similarity:
                    best_similarity = similarity
                    best_entry = entry

            if best_similarity >= threshold and best_entry is not None:
                return {
                    "person_id": best_entry["person_id"],
                    "similarity": round(best_similarity, 4),
                    "embedding_id": best_entry["embedding_id"],
                }
            return None
        except Exception:
            logger.error("Error al buscar match de embedding", exc_info=True)
            return None

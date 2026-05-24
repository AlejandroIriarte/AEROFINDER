# =============================================================================
# AEROFINDER Backend — Router: Análisis de fotos para validación y auto-relleno
# POST /photos/analyze — recibe imagen, retorna calidad + atributos detectados.
# Stateless: no guarda nada en DB, solo procesa en memoria.
# =============================================================================

import asyncio
import logging

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from pydantic import BaseModel

from app.core.deps import CurrentUser, get_current_user
from app.services.face_analyzer import FaceAnalyzer

logger = logging.getLogger(__name__)
router = APIRouter(tags=["análisis de fotos"])

_MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB


class PhotoQualityResult(BaseModel):
    is_useful: bool
    face_detected: bool
    face_angle: str
    blur_score: float
    issues: list[str]
    issue_labels: list[str]


class PhotoAttributesResult(BaseModel):
    skin_tone: str | None = None
    hair_color: str | None = None


class PhotoAnalysisResponse(BaseModel):
    quality: PhotoQualityResult
    attributes: PhotoAttributesResult


@router.post(
    "/photos/analyze",
    response_model=PhotoAnalysisResponse,
    status_code=status.HTTP_200_OK,
)
async def analyze_photo(
    file: UploadFile = File(...),
    current_user: CurrentUser = Depends(get_current_user),
) -> PhotoAnalysisResponse:
    """
    Analiza una foto para verificar si es útil para reconocimiento facial por IA
    y extrae atributos visibles (tono de piel, color de cabello).
    No almacena nada — procesamiento en memoria.
    """
    # Validar tipo de archivo
    if file.content_type not in ("image/jpeg", "image/png", "image/webp"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Formato no válido. Se aceptan JPG, PNG o WebP.",
        )

    # Leer bytes con límite de tamaño
    try:
        image_bytes = await file.read(_MAX_UPLOAD_BYTES + 1)
    except Exception:
        logger.error("Error al leer imagen para análisis", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

    if len(image_bytes) > _MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Imagen demasiado grande. Máximo 10 MB.",
        )

    # Analizar en thread pool — OpenCV es sync y bloquea el event loop si se llama directo
    try:
        analyzer = FaceAnalyzer.get()
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, analyzer.analyze, image_bytes)
    except Exception:
        logger.error("Error en FaceAnalyzer", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error al analizar la imagen")

    return PhotoAnalysisResponse(
        quality=PhotoQualityResult(**result["quality"]),
        attributes=PhotoAttributesResult(**result.get("attributes", {})),
    )

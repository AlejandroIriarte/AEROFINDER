# =============================================================================
# AEROFINDER Backend — Router: OCR de documentos de identidad
# POST /ocr/document — recibe imagen, retorna campos extraídos
# =============================================================================

import logging

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel

from app.core.deps import get_current_user
from app.services.ocr_service import ocr_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/ocr", tags=["ocr"])

_MAX_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB
_ALLOWED_TYPES  = {"image/jpeg", "image/png", "image/webp"}


class OcrDocumentResponse(BaseModel):
    document_type:   str
    full_name:       str | None
    date_of_birth:   str | None
    gender:          str | None
    document_number: str | None
    address:         str | None


@router.post("/document", response_model=OcrDocumentResponse)
async def scan_document(
    file: UploadFile = File(...),
    _=Depends(get_current_user),
) -> OcrDocumentResponse:
    """
    Extrae campos de un documento de identidad (CI boliviana o pasaporte).
    Devuelve los campos reconocidos; los no reconocidos vienen como null.
    """
    if file.content_type not in _ALLOWED_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Tipo de archivo no soportado: {file.content_type}",
        )

    image_bytes = await file.read()
    if len(image_bytes) > _MAX_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="La imagen no puede superar 10 MB",
        )

    try:
        result = ocr_service.extract_document_fields(image_bytes)
    except Exception:
        logger.error("Error en OCR de documento", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="No se pudo procesar el documento",
        )

    return OcrDocumentResponse(
        document_type=result.document_type,
        full_name=result.full_name,
        date_of_birth=result.date_of_birth,
        gender=result.gender,
        document_number=result.document_number,
        address=result.address,
    )

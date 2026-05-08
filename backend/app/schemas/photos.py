# =============================================================================
# AEROFINDER Backend — Schemas Pydantic: Fotos de personas desaparecidas
# =============================================================================

import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel

from app.models.enums import PhotoFaceAngle


class PhotoUploadUrlRequest(BaseModel):
    """Solicitud de URL firmada para subir una foto directamente a MinIO."""
    face_angle: PhotoFaceAngle = PhotoFaceAngle.unknown


class PhotoUploadUrlResponse(BaseModel):
    """
    URL firmada de MinIO para que el cliente haga PUT directo.
    El cliente debe hacer PUT a upload_url con el binario de la imagen.
    Expira en 5 minutos (300s).
    """
    upload_url: str
    photo_id: uuid.UUID
    object_key: str
    expires_in: int = 300


class PhotoConfirmRequest(BaseModel):
    """Confirmación de subida: el backend verifica en MinIO y registra en DB."""
    photo_id: uuid.UUID


class PhotoPatchRequest(BaseModel):
    """Para que admin/ayudante apruebe o desactive una foto."""
    is_active: bool


class PhotoResponse(BaseModel):
    id: uuid.UUID
    missing_person_id: uuid.UUID
    file_id: uuid.UUID
    face_angle: PhotoFaceAngle
    quality_score: Optional[float]
    has_embedding: bool
    is_active: bool
    uploaded_by: Optional[uuid.UUID]
    created_at: datetime
    view_url: Optional[str] = None  # presigned GET URL, 1h de validez

    model_config = {"from_attributes": True}

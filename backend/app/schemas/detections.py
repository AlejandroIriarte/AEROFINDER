# =============================================================================
# AEROFINDER Backend — Schemas Pydantic: Detecciones y Revisiones
# =============================================================================

import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel

from app.models.enums import DetectionVerdict


class DetectionResponse(BaseModel):
    """
    Respuesta de detección con GPS opcional según el rol del solicitante.
    Para rol 'ayudante' y 'familiar', gps_latitude y gps_longitude serán None.
    snapshot_url: URL firmada de MinIO (1 hora de validez); None si no hay snapshot.
    """
    id: uuid.UUID
    mission_id: uuid.UUID
    drone_id: uuid.UUID
    missing_person_id: uuid.UUID
    video_recording_id: Optional[uuid.UUID]
    detection_model_id: uuid.UUID
    recognition_model_id: uuid.UUID
    frame_timestamp: datetime
    frame_number: Optional[int]
    yolo_confidence: float
    facenet_similarity: float
    bounding_box: dict
    # GPS: solo visible para admin y buscador
    gps_latitude: Optional[float]
    gps_longitude: Optional[float]
    snapshot_file_id: Optional[uuid.UUID]
    snapshot_url: Optional[str]           # URL firmada de MinIO; None si sin snapshot
    is_reviewed: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class ReviewCreate(BaseModel):
    verdict: DetectionVerdict
    notes: Optional[str] = None


class ReviewResponse(BaseModel):
    id: uuid.UUID
    detection_id: uuid.UUID
    reviewed_by: uuid.UUID
    verdict: DetectionVerdict
    notes: Optional[str]
    reviewed_at: datetime

    model_config = {"from_attributes": True}

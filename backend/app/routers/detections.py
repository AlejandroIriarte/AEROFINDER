# =============================================================================
# AEROFINDER Backend — Router: Detecciones y Revisiones
# GPS filtrado por rol: admin/buscador ven coords; ayudante/familiar no.
# Endpoints: GET /detections, GET/POST reviews
# =============================================================================

import asyncio
import logging
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import CurrentUser, get_current_user, require_role
from app.db.session import get_db
from app.models.enums import RoleName
from app.models.files import File
from app.models.pipeline import Detection, DetectionReview
from app.schemas.detections import DetectionResponse, ReviewCreate, ReviewResponse
from app.services.minio_service import minio_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/detections", tags=["detecciones"])

_readers = require_role(RoleName.admin, RoleName.buscador, RoleName.ayudante)
_reviewers = require_role(RoleName.admin, RoleName.buscador)

# Roles que pueden ver coordenadas GPS de las detecciones
_GPS_ROLES = {RoleName.admin, RoleName.buscador}


def _mask_gps(det: Detection, role: RoleName, snapshot_url: Optional[str]) -> DetectionResponse:
    """
    Construye el schema de respuesta aplicando el filtro de GPS por rol.
    ayudante y familiar: gps_latitude y gps_longitude se retornan como None.
    snapshot_url: URL firmada de MinIO generada por el caller.
    """
    show_gps = role in _GPS_ROLES
    return DetectionResponse(
        id=det.id,
        mission_id=det.mission_id,
        drone_id=det.drone_id,
        missing_person_id=det.missing_person_id,
        video_recording_id=det.video_recording_id,
        detection_model_id=det.detection_model_id,
        recognition_model_id=det.recognition_model_id,
        frame_timestamp=det.frame_timestamp,
        frame_number=det.frame_number,
        yolo_confidence=det.yolo_confidence,
        facenet_similarity=det.facenet_similarity,
        bounding_box=det.bounding_box,
        gps_latitude=det.gps_latitude if show_gps else None,
        gps_longitude=det.gps_longitude if show_gps else None,
        snapshot_file_id=det.snapshot_file_id,
        snapshot_url=snapshot_url,
        is_reviewed=det.is_reviewed,
        created_at=det.created_at,
    )


async def _get_snapshot_url(det: Detection, db: AsyncSession) -> Optional[str]:
    """
    Obtiene la URL firmada de MinIO para el snapshot de la detección.
    Retorna None si no hay snapshot_file_id o si ocurre un error.
    La llamada a MinIO (síncrona) se ejecuta en el thread pool del event loop.
    """
    if det.snapshot_file_id is None:
        return None
    try:
        result = await db.execute(
            select(File.bucket, File.object_key).where(File.id == det.snapshot_file_id)
        )
        row = result.first()
        if row is None:
            return None
        bucket, object_key = row
        # MinIO SDK es síncrono; ejecutar en thread pool para no bloquear el event loop
        url = await asyncio.get_running_loop().run_in_executor(
            None,
            lambda: minio_service.get_presigned_url(bucket, object_key, expires_seconds=3600),
        )
        return url
    except Exception:
        logger.error(
            "Error al generar URL firmada para snapshot_file_id=%s",
            det.snapshot_file_id, exc_info=True,
        )
        return None


@router.get("/", response_model=list[DetectionResponse])
async def list_detections(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=20, le=100),
    mission_id: uuid.UUID | None = Query(default=None),
    missing_person_id: uuid.UUID | None = Query(default=None),
    is_reviewed: bool | None = Query(default=None),
    current_user: CurrentUser = Depends(_readers),
    db: AsyncSession = Depends(get_db),
) -> list[DetectionResponse]:
    """
    Lista detecciones con filtros opcionales.
    GPS visible solo para admin y buscador.
    """
    try:
        query = select(Detection)
        if mission_id is not None:
            query = query.where(Detection.mission_id == mission_id)
        if missing_person_id is not None:
            query = query.where(Detection.missing_person_id == missing_person_id)
        if is_reviewed is not None:
            query = query.where(Detection.is_reviewed.is_(is_reviewed))

        query = query.order_by(Detection.created_at.desc()).offset(skip).limit(limit)
        result = await db.execute(query)
        detections = result.scalars().all()
    except Exception:
        logger.error("Error al listar detecciones", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

    # Generar URLs firmadas en paralelo para todos los snapshots
    snapshot_urls = await asyncio.gather(
        *[_get_snapshot_url(d, db) for d in detections]
    )

    return [
        _mask_gps(d, current_user.role, url)
        for d, url in zip(detections, snapshot_urls)
    ]


@router.get("/{detection_id}", response_model=DetectionResponse)
async def get_detection(
    detection_id: uuid.UUID,
    current_user: CurrentUser = Depends(_readers),
    db: AsyncSession = Depends(get_db),
) -> DetectionResponse:
    """Obtiene detalle de una detección. GPS filtrado por rol."""
    try:
        result = await db.execute(
            select(Detection).where(Detection.id == detection_id)
        )
        detection: Detection | None = result.scalar_one_or_none()
    except Exception:
        logger.error("Error al obtener detección id=%s", detection_id, exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

    if detection is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Detección no encontrada")

    snapshot_url = await _get_snapshot_url(detection, db)
    return _mask_gps(detection, current_user.role, snapshot_url)


# ── Revisiones ────────────────────────────────────────────────────────────────

@router.get("/{detection_id}/reviews", response_model=list[ReviewResponse])
async def list_reviews(
    detection_id: uuid.UUID,
    current_user: CurrentUser = Depends(_reviewers),
    db: AsyncSession = Depends(get_db),
) -> list[ReviewResponse]:
    """Lista las revisiones de una detección. Admin y buscador."""
    try:
        result = await db.execute(
            select(DetectionReview)
            .where(DetectionReview.detection_id == detection_id)
            .order_by(DetectionReview.reviewed_at.desc())
        )
        reviews = result.scalars().all()
    except Exception:
        logger.error("Error al listar revisiones detección id=%s", detection_id, exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

    return [ReviewResponse.model_validate(r) for r in reviews]


@router.post(
    "/{detection_id}/reviews",
    response_model=ReviewResponse,
    status_code=status.HTTP_201_CREATED,
)
async def submit_review(
    detection_id: uuid.UUID,
    body: ReviewCreate,
    current_user: CurrentUser = Depends(_reviewers),
    db: AsyncSession = Depends(get_db),
) -> ReviewResponse:
    """
    Envía una revisión humana de la detección.
    Inmutable: cada revisión es una fila nueva (no se actualizan).
    Marca la detección como revisada (is_reviewed=True).
    """
    # Verificar que la detección existe
    try:
        det_result = await db.execute(
            select(Detection).where(Detection.id == detection_id)
        )
        detection: Detection | None = det_result.scalar_one_or_none()
    except Exception:
        logger.error("Error al buscar detección id=%s", detection_id, exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

    if detection is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Detección no encontrada")

    try:
        review = DetectionReview(
            detection_id=detection_id,
            reviewed_by=current_user.id,
            verdict=body.verdict,
            notes=body.notes,
        )
        db.add(review)
        detection.is_reviewed = True
        await db.flush()
    except Exception:
        logger.error("Error al guardar revisión detección id=%s", detection_id, exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

    return ReviewResponse.model_validate(review)

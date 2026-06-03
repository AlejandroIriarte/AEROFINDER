# =============================================================================
# AEROFINDER Backend — Router: Alertas
# RLS en DB garantiza que cada usuario solo ve sus propias alertas.
# Endpoints: GET /alerts, GET /alerts/{id}, PATCH /alerts/{id}
# =============================================================================

import asyncio
import logging
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import CurrentUser, get_current_user
from app.db.session import get_db
from app.models.enums import AlertStatus
from app.models.files import File
from app.models.persons import MissingPerson
from app.models.pipeline import Alert, Detection
from app.schemas.alerts import AlertResponse, AlertStatusUpdate
from app.services.minio_service import minio_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/alerts", tags=["alertas"])


async def _presigned_url(file: Optional[File]) -> Optional[str]:
    """URL firmada MinIO (1 hora). Misma técnica que el router de detecciones."""
    if file is None:
        return None
    try:
        return await asyncio.get_running_loop().run_in_executor(
            None,
            lambda: minio_service.get_presigned_url(file.bucket, file.object_key, expires_seconds=3600),
        )
    except Exception:
        logger.error(
            "Error al generar URL firmada: bucket=%s key=%s", file.bucket, file.object_key, exc_info=True
        )
        return None


def _build_response(
    alert: Alert,
    det: Optional[Detection],
    snapshot_url: Optional[str],
    person: Optional[MissingPerson],
) -> AlertResponse:
    return AlertResponse(
        id=alert.id,
        detection_id=alert.detection_id,
        recipient_user_id=alert.recipient_user_id,
        content_level=alert.content_level,
        status=alert.status,
        message_text=alert.message_text,
        generated_at=alert.generated_at,
        updated_at=alert.updated_at,
        mission_id=det.mission_id if det else None,
        detection_type=det.detection_type if det else None,
        yolo_confidence=det.yolo_confidence if det else None,
        facenet_similarity=det.facenet_similarity if det else None,
        gps_latitude=det.gps_latitude if det else None,
        gps_longitude=det.gps_longitude if det else None,
        snapshot_url=snapshot_url,
        person_full_name=person.full_name if person else None,
    )


@router.get("/", response_model=list[AlertResponse])
async def list_alerts(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, le=200),
    unread_only: bool = Query(default=False),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[AlertResponse]:
    """
    Lista alertas del usuario autenticado enriquecidas con snapshot (URL firmada),
    datos de la detección y nombre de la persona buscada.
    """
    try:
        query = (
            select(Alert, Detection, File, MissingPerson)
            .outerjoin(Detection, Alert.detection_id == Detection.id)
            .outerjoin(File, Detection.snapshot_file_id == File.id)
            .outerjoin(MissingPerson, Detection.missing_person_id == MissingPerson.id)
            .order_by(Alert.generated_at.desc())
        )
        if unread_only:
            query = query.where(Alert.status == AlertStatus.generated)
        query = query.offset(skip).limit(limit)

        result = await db.execute(query)
        rows = result.all()
    except Exception:
        logger.error("Error al listar alertas user_id=%s", current_user.id, exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

    # Generar URLs firmadas en paralelo
    snapshot_urls = await asyncio.gather(*[_presigned_url(file) for _, _, file, _ in rows])

    return [
        _build_response(alert, det, url, person)
        for (alert, det, _, person), url in zip(rows, snapshot_urls)
    ]


@router.get("/{alert_id}", response_model=AlertResponse)
async def get_alert(
    alert_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AlertResponse:
    try:
        result = await db.execute(
            select(Alert, Detection, File, MissingPerson)
            .outerjoin(Detection, Alert.detection_id == Detection.id)
            .outerjoin(File, Detection.snapshot_file_id == File.id)
            .outerjoin(MissingPerson, Detection.missing_person_id == MissingPerson.id)
            .where(Alert.id == alert_id)
        )
        row = result.one_or_none()
    except Exception:
        logger.error("Error al obtener alerta id=%s", alert_id, exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alerta no encontrada")

    alert, det, file, person = row
    snapshot_url = await _presigned_url(file)
    return _build_response(alert, det, snapshot_url, person)


@router.patch("/{alert_id}", response_model=AlertResponse)
async def update_alert_status(
    alert_id: uuid.UUID,
    body: AlertStatusUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AlertResponse:
    """
    Actualiza estado de la alerta (confirmed / dismissed).
    Solo el destinatario o admin puede cambiar el estado.
    """
    _allowed = {AlertStatus.generated, AlertStatus.sent}

    try:
        result = await db.execute(
            select(Alert, Detection, File, MissingPerson)
            .outerjoin(Detection, Alert.detection_id == Detection.id)
            .outerjoin(File, Detection.snapshot_file_id == File.id)
            .outerjoin(MissingPerson, Detection.missing_person_id == MissingPerson.id)
            .where(Alert.id == alert_id)
        )
        row = result.one_or_none()
    except Exception:
        logger.error("Error al obtener alerta id=%s", alert_id, exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alerta no encontrada")

    alert, det, file, person = row

    if alert.status not in _allowed:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"No se puede actualizar una alerta en estado '{alert.status.value}'",
        )

    alert.status = body.status
    snapshot_url = await _presigned_url(file)
    return _build_response(alert, det, snapshot_url, person)

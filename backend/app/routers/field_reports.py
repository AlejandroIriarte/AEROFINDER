# =============================================================================
# AEROFINDER Backend — Router: Field Reports
# Flujo: rescatista crea solicitud → admin aprueba → rescatista sube fotos →
#        trigger AI análisis → resultado por WS + Push
# =============================================================================

import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone

import redis.asyncio as aioredis
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.core.deps import CurrentUser, get_current_user, require_role
from app.core.ws_manager import ws_manager
from app.db.session import get_db
from app.models.auth import User
from app.models.enums import RoleName
from app.models.field_reports import FieldReport, FieldReportMatch, FieldReportPhoto
from app.models.persons import MissingPerson
from app.schemas.field_reports import (
    ConfirmPhotoRequest,
    FieldReportMatchResponse,
    FieldReportPhotoResponse,
    FieldReportReject,
    FieldReportResponse,
    UploadUrlResponse,
)
from app.services.minio_service import minio_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/field-reports", tags=["field-reports"])

_admin = require_role(RoleName.admin)

MIN_PHOTOS = 3
MAX_PHOTOS = 5

# Cliente Redis lazy-init
_redis_client: aioredis.Redis | None = None


def _get_redis() -> aioredis.Redis:
    global _redis_client
    if _redis_client is None:
        _redis_client = aioredis.from_url(settings.redis_url, decode_responses=True)
    return _redis_client


def _report_to_response(report: FieldReport, rescuer_name: str) -> FieldReportResponse:
    return FieldReportResponse(
        id=report.id,
        mission_id=report.mission_id,
        rescuer_id=report.rescuer_id,
        rescuer_name=rescuer_name,
        status=report.status,
        notes=report.notes,
        location_lat=float(report.location_lat) if report.location_lat else None,
        location_lon=float(report.location_lon) if report.location_lon else None,
        approved_by=report.approved_by,
        approved_at=report.approved_at,
        completed_at=report.completed_at,
        created_at=report.created_at,
        photos=[FieldReportPhotoResponse.model_validate(p) for p in report.photos],
        matches=[
            FieldReportMatchResponse(
                person_id=m.person_id,
                person_name="",     # se llena en el caller si es necesario
                similarity_score=float(m.similarity_score),
                rank=m.rank,
            )
            for m in report.matches
        ],
    )


@router.get("/{report_id}", response_model=FieldReportResponse)
async def get_report(
    report_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> FieldReportResponse:
    """Detalle de un reporte. Admin, buscador, o el rescatista propietario."""
    try:
        result = await db.execute(
            select(FieldReport)
            .options(selectinload(FieldReport.photos), selectinload(FieldReport.matches))
            .where(FieldReport.id == report_id)
        )
        report: FieldReport | None = result.scalar_one_or_none()
    except Exception:
        logger.error("Error al obtener report id=%s", report_id, exc_info=True)
        raise HTTPException(status_code=500, detail="Error interno")

    if report is None:
        raise HTTPException(status_code=404, detail="Reporte no encontrado")

    # Solo admin/buscador o el rescatista propietario
    allowed_roles = {RoleName.admin, RoleName.buscador}
    if current_user.role.name not in allowed_roles and current_user.id != report.rescuer_id:
        raise HTTPException(status_code=403, detail="Sin acceso")

    # Cargar nombre del rescatista
    user_result = await db.execute(select(User).where(User.id == report.rescuer_id))
    rescuer = user_result.scalar_one_or_none()
    rescuer_name = rescuer.full_name if rescuer else str(report.rescuer_id)

    resp = _report_to_response(report, rescuer_name)

    # Enriquecer matches con nombres de personas
    for i, match in enumerate(report.matches):
        person_result = await db.execute(select(MissingPerson).where(MissingPerson.id == match.person_id))
        person = person_result.scalar_one_or_none()
        if person:
            resp.matches[i].person_name = person.full_name

    return resp


@router.get("/mission/{mission_id}", response_model=list[FieldReportResponse])
async def list_mission_reports(
    mission_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[FieldReportResponse]:
    """Lista todos los reportes de una misión. Admin y buscador."""
    allowed_roles = {RoleName.admin, RoleName.buscador}
    if current_user.role.name not in allowed_roles:
        raise HTTPException(status_code=403, detail="Sin acceso")

    try:
        result = await db.execute(
            select(FieldReport)
            .options(selectinload(FieldReport.photos), selectinload(FieldReport.matches))
            .where(FieldReport.mission_id == mission_id)
            .order_by(FieldReport.created_at.desc())
        )
        reports = result.scalars().all()
    except Exception:
        logger.error("Error al listar reportes misión id=%s", mission_id, exc_info=True)
        raise HTTPException(status_code=500, detail="Error interno")

    # Cargar nombres de rescatistas en batch
    rescuer_ids = list({r.rescuer_id for r in reports})
    rescuers: dict[uuid.UUID, str] = {}
    if rescuer_ids:
        users_result = await db.execute(select(User).where(User.id.in_(rescuer_ids)))
        for u in users_result.scalars():
            rescuers[u.id] = u.full_name

    return [_report_to_response(r, rescuers.get(r.rescuer_id, str(r.rescuer_id))) for r in reports]


@router.patch("/{report_id}/approve", response_model=FieldReportResponse)
async def approve_report(
    report_id: uuid.UUID,
    current_user: CurrentUser = Depends(_admin),
    db: AsyncSession = Depends(get_db),
) -> FieldReportResponse:
    """Admin aprueba el reporte. El rescatista recibe notificación WS."""
    try:
        result = await db.execute(
            select(FieldReport)
            .options(selectinload(FieldReport.photos), selectinload(FieldReport.matches))
            .where(FieldReport.id == report_id)
        )
        report: FieldReport | None = result.scalar_one_or_none()
    except Exception:
        logger.error("Error al buscar report id=%s", report_id, exc_info=True)
        raise HTTPException(status_code=500, detail="Error interno")

    if report is None:
        raise HTTPException(status_code=404, detail="Reporte no encontrado")

    if report.status != "pending":
        raise HTTPException(status_code=400, detail=f"Reporte en estado '{report.status}', no se puede aprobar")

    report.status = "approved"
    report.approved_by = current_user.id
    report.approved_at = datetime.now(timezone.utc)

    await ws_manager.broadcast(f"mission:{report.mission_id}", {
        "type": "field_report_approved",
        "report_id": str(report_id),
    })

    user_result = await db.execute(select(User).where(User.id == report.rescuer_id))
    rescuer = user_result.scalar_one_or_none()
    return _report_to_response(report, rescuer.full_name if rescuer else "")


@router.patch("/{report_id}/reject", response_model=FieldReportResponse)
async def reject_report(
    report_id: uuid.UUID,
    body: FieldReportReject,
    current_user: CurrentUser = Depends(_admin),
    db: AsyncSession = Depends(get_db),
) -> FieldReportResponse:
    """Admin rechaza el reporte con un motivo."""
    try:
        result = await db.execute(
            select(FieldReport)
            .options(selectinload(FieldReport.photos), selectinload(FieldReport.matches))
            .where(FieldReport.id == report_id)
        )
        report: FieldReport | None = result.scalar_one_or_none()
    except Exception:
        logger.error("Error al buscar report id=%s", report_id, exc_info=True)
        raise HTTPException(status_code=500, detail="Error interno")

    if report is None:
        raise HTTPException(status_code=404, detail="Reporte no encontrado")

    if report.status != "pending":
        raise HTTPException(status_code=400, detail=f"Reporte en estado '{report.status}'")

    report.status = "rejected"

    await ws_manager.broadcast(f"mission:{report.mission_id}", {
        "type": "field_report_rejected",
        "report_id": str(report_id),
        "reason": body.reason,
    })

    user_result = await db.execute(select(User).where(User.id == report.rescuer_id))
    rescuer = user_result.scalar_one_or_none()
    return _report_to_response(report, rescuer.full_name if rescuer else "")


@router.post("/{report_id}/photos/upload-url", response_model=UploadUrlResponse)
async def get_upload_url(
    report_id: uuid.UUID,
    photo_index: int = Query(ge=1, le=MAX_PHOTOS),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UploadUrlResponse:
    """Genera presigned URL para subir una foto a MinIO. Solo el rescatista propietario."""
    try:
        result = await db.execute(select(FieldReport).where(FieldReport.id == report_id))
        report: FieldReport | None = result.scalar_one_or_none()
    except Exception:
        logger.error("Error al buscar report id=%s", report_id, exc_info=True)
        raise HTTPException(status_code=500, detail="Error interno")

    if report is None:
        raise HTTPException(status_code=404, detail="Reporte no encontrado")

    if current_user.id != report.rescuer_id:
        raise HTTPException(status_code=403, detail="Solo el rescatista puede subir fotos")

    if report.status != "approved":
        raise HTTPException(status_code=400, detail="El reporte debe estar aprobado antes de subir fotos")

    object_name = f"field-reports/{report_id}/foto_{photo_index}_{uuid.uuid4().hex[:8]}.jpg"
    bucket = settings.minio_bucket_photos

    try:
        presigned_url = await asyncio.get_running_loop().run_in_executor(
            None,
            lambda: minio_service.get_presigned_put_url(
                bucket=bucket,
                object_key=object_name,
                expires_seconds=300,
            ),
        )
    except Exception:
        logger.error("Error generando presigned URL report=%s", report_id, exc_info=True)
        raise HTTPException(status_code=500, detail="Error generando URL de subida")

    return UploadUrlResponse(
        presigned_url=presigned_url,
        object_name=object_name,
        photo_index=photo_index,
    )


@router.post("/{report_id}/photos/confirm")
async def confirm_photo(
    report_id: uuid.UUID,
    body: ConfirmPhotoRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Confirma que la foto fue subida a MinIO y la registra en DB."""
    try:
        result = await db.execute(
            select(FieldReport)
            .options(selectinload(FieldReport.photos))
            .where(FieldReport.id == report_id)
        )
        report: FieldReport | None = result.scalar_one_or_none()
    except Exception:
        logger.error("Error al buscar report id=%s", report_id, exc_info=True)
        raise HTTPException(status_code=500, detail="Error interno")

    if report is None:
        raise HTTPException(status_code=404, detail="Reporte no encontrado")

    if current_user.id != report.rescuer_id:
        raise HTTPException(status_code=403, detail="Sin acceso")

    if report.status != "approved":
        raise HTTPException(status_code=400, detail="Reporte no está en estado aprobado")

    if len(report.photos) >= MAX_PHOTOS:
        raise HTTPException(status_code=400, detail=f"Máximo {MAX_PHOTOS} fotos por reporte")

    # Verificar que el objeto existe en MinIO
    exists = await asyncio.get_running_loop().run_in_executor(
        None,
        lambda: minio_service.verify_object_exists(settings.minio_bucket_photos, body.object_name),
    )
    if not exists:
        raise HTTPException(status_code=400, detail="La foto no fue encontrada en MinIO")

    photo = FieldReportPhoto(field_report_id=report_id, minio_object=body.object_name)
    db.add(photo)
    await db.flush()

    return {"ok": True, "total_photos": len(report.photos) + 1}


@router.post("/{report_id}/analyze")
async def trigger_analysis(
    report_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Dispara el análisis IA. Solo el rescatista propietario.
    Requiere status=approved y al menos 3 fotos confirmadas.
    """
    try:
        result = await db.execute(
            select(FieldReport)
            .options(selectinload(FieldReport.photos))
            .where(FieldReport.id == report_id)
        )
        report: FieldReport | None = result.scalar_one_or_none()
    except Exception:
        logger.error("Error al buscar report id=%s", report_id, exc_info=True)
        raise HTTPException(status_code=500, detail="Error interno")

    if report is None:
        raise HTTPException(status_code=404, detail="Reporte no encontrado")

    if current_user.id != report.rescuer_id:
        raise HTTPException(status_code=403, detail="Sin acceso")

    if report.status != "approved":
        raise HTTPException(status_code=400, detail="El reporte debe estar aprobado")

    if len(report.photos) < MIN_PHOTOS:
        raise HTTPException(
            status_code=400,
            detail=f"Se necesitan al menos {MIN_PHOTOS} fotos (hay {len(report.photos)})"
        )

    report.status = "analyzing"

    # Encolar análisis en Redis para que el AI worker lo procese
    try:
        await _get_redis().rpush("aerofinder:field_report_analysis", json.dumps({
            "report_id": str(report_id),
            "mission_id": str(report.mission_id),
        }))
    except Exception:
        logger.error("Error al encolar análisis report=%s", report_id, exc_info=True)
        raise HTTPException(status_code=500, detail="Error al encolar análisis")

    logger.info("Análisis encolado report_id=%s", report_id)
    return {"ok": True, "status": "analyzing"}

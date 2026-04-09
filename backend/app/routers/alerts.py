# =============================================================================
# AEROFINDER Backend — Router: Alertas
# RLS en DB garantiza que cada usuario solo ve sus propias alertas.
# Endpoints: GET /alerts, GET /alerts/{id}, PATCH /alerts/{id}
# =============================================================================

import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import CurrentUser, get_current_user
from app.db.session import get_db
from app.models.enums import AlertStatus
from app.models.pipeline import Alert
from app.schemas.alerts import AlertResponse, AlertStatusUpdate

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/alerts", tags=["alertas"])


@router.get("/", response_model=list[AlertResponse])
async def list_alerts(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=20, le=100),
    unread_only: bool = Query(default=False),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[AlertResponse]:
    """
    Lista alertas del usuario autenticado.
    RLS garantiza que solo se ven las alertas dirigidas al usuario actual
    (o todas si es admin).
    """
    try:
        query = select(Alert).order_by(Alert.generated_at.desc())
        if unread_only:
            query = query.where(Alert.status == AlertStatus.generated)
        query = query.offset(skip).limit(limit)

        result = await db.execute(query)
        alerts = result.scalars().all()
    except Exception:
        logger.error("Error al listar alertas user_id=%s", current_user.id, exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

    return [AlertResponse.model_validate(a) for a in alerts]


@router.get("/{alert_id}", response_model=AlertResponse)
async def get_alert(
    alert_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AlertResponse:
    """
    Obtiene detalle de una alerta.
    RLS bloquea el acceso si la alerta no pertenece al usuario.
    """
    try:
        result = await db.execute(select(Alert).where(Alert.id == alert_id))
        alert: Alert | None = result.scalar_one_or_none()
    except Exception:
        logger.error("Error al obtener alerta id=%s", alert_id, exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

    if alert is None:
        # 404 también si RLS lo bloqueó (no revelamos si existe pero no es del usuario)
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alerta no encontrada")

    return AlertResponse.model_validate(alert)


@router.patch("/{alert_id}", response_model=AlertResponse)
async def update_alert_status(
    alert_id: uuid.UUID,
    body: AlertStatusUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AlertResponse:
    """
    Actualiza el estado de una alerta (ej: confirmed, dismissed).
    Solo el destinatario o admin puede cambiar el estado.
    RLS garantiza que no se puede acceder a alertas de otros usuarios.
    """
    # Solo se permiten transiciones desde 'generated' o 'sent'
    _allowed_transitions = {AlertStatus.generated, AlertStatus.sent}

    try:
        result = await db.execute(select(Alert).where(Alert.id == alert_id))
        alert: Alert | None = result.scalar_one_or_none()
    except Exception:
        logger.error("Error al obtener alerta id=%s", alert_id, exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

    if alert is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alerta no encontrada")

    if alert.status not in _allowed_transitions:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"No se puede actualizar una alerta en estado '{alert.status.value}'",
        )

    alert.status = body.status

    return AlertResponse.model_validate(alert)

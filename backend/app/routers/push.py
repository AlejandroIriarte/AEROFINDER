# =============================================================================
# AEROFINDER Backend — Router: Web Push Subscriptions
# Gestiona suscripciones PWA para notificaciones push.
# =============================================================================

import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import CurrentUser, get_current_user
from app.db.session import get_db
from app.models.field_reports import PushSubscription

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/push", tags=["push"])


class PushSubscribeRequest(BaseModel):
    endpoint: str
    p256dh: str
    auth: str


class PushUnsubscribeRequest(BaseModel):
    endpoint: str


@router.post("/subscribe", status_code=status.HTTP_201_CREATED)
async def subscribe(
    body: PushSubscribeRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Registra o actualiza una suscripción Web Push para este usuario."""
    try:
        result = await db.execute(
            select(PushSubscription).where(
                PushSubscription.user_id == current_user.id,
                PushSubscription.endpoint == body.endpoint,
            )
        )
        existing = result.scalar_one_or_none()

        if existing:
            existing.p256dh = body.p256dh
            existing.auth_key = body.auth
        else:
            sub = PushSubscription(
                user_id=current_user.id,
                endpoint=body.endpoint,
                p256dh=body.p256dh,
                auth_key=body.auth,
            )
            db.add(sub)

        await db.flush()
    except Exception:
        logger.error("Error al guardar push subscription user=%s", current_user.id, exc_info=True)
        raise HTTPException(status_code=500, detail="Error interno")

    return {"ok": True}


@router.delete("/subscribe")
async def unsubscribe(
    body: PushUnsubscribeRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Elimina una suscripción Web Push."""
    try:
        await db.execute(
            delete(PushSubscription).where(
                PushSubscription.user_id == current_user.id,
                PushSubscription.endpoint == body.endpoint,
            )
        )
    except Exception:
        logger.error("Error al eliminar push subscription user=%s", current_user.id, exc_info=True)
        raise HTTPException(status_code=500, detail="Error interno")

    return {"ok": True}

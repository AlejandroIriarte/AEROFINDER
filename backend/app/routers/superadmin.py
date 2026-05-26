# =============================================================================
# AEROFINDER Backend — Router: Super Admin
# Solo accesible por super_admin.
# Endpoints: health, admins, sessions, hard delete, soft-deleted
# =============================================================================

import datetime
import logging
import time
import uuid
from typing import Optional

import httpx
import redis.asyncio as aioredis
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.deps import CurrentUser, require_role
from app.db.session import get_db
from app.models.auth import Role, User, UserSession
from app.models.enums import RoleName
from app.schemas.users import UserResponse
from app.services.minio_service import minio_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/superadmin", tags=["superadmin"])

_super_admin = require_role(RoleName.super_admin)


# ── Schemas de respuesta ──────────────────────────────────────────────────────

class ServiceHealth(BaseModel):
    status: str          # "ok" | "error" | "stale" | "unknown"
    latency_ms: Optional[float] = None
    detail: Optional[str] = None


class InfraHealth(BaseModel):
    redis:     ServiceHealth
    minio:     ServiceHealth
    mediamtx:  ServiceHealth
    ai_worker: ServiceHealth


class AdminSessionResponse(BaseModel):
    id: str
    user_id: str
    user_name: str
    user_email: str
    user_role: str
    ip_address: str
    user_agent: Optional[str]
    issued_at: str
    expires_at: str

    class Config:
        from_attributes = True


class SoftDeletedUser(BaseModel):
    id: str
    email: str
    full_name: str
    role: str
    deactivated_at: Optional[str]


# ── Helpers ───────────────────────────────────────────────────────────────────

def _build_user_response(user: User, role_name: RoleName) -> UserResponse:
    return UserResponse(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        phone=user.phone,
        role=role_name,
        is_active=user.is_active,
        created_at=user.created_at,
        last_login_at=user.last_login_at,
    )


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/health", response_model=InfraHealth)
async def get_infra_health(
    _: CurrentUser = Depends(_super_admin),
) -> InfraHealth:
    """Estado en tiempo real de Redis, MinIO, MediaMTX y AI Worker."""

    # Redis
    redis_health: ServiceHealth
    try:
        r = aioredis.from_url(settings.redis_url, decode_responses=True)
        t0 = time.monotonic()
        await r.ping()
        latency = round((time.monotonic() - t0) * 1000, 1)
        stream_names = [
            settings.redis_stream_detections,
            settings.redis_stream_telemetry,
            settings.redis_stream_notifications,
        ]
        active = 0
        for s in stream_names:
            try:
                await r.xlen(s)
                active += 1
            except Exception:
                pass
        await r.aclose()
        redis_health = ServiceHealth(
            status="ok",
            latency_ms=latency,
            detail=f"{active} streams activos",
        )
    except Exception as exc:
        logger.error("Redis health check fallido", exc_info=True)
        redis_health = ServiceHealth(status="error", detail=str(exc)[:120])

    # MinIO (cliente síncrono — rápido)
    minio_health: ServiceHealth
    try:
        t0 = time.monotonic()
        exists = minio_service._client.bucket_exists(settings.minio_bucket_photos)
        latency = round((time.monotonic() - t0) * 1000, 1)
        minio_health = ServiceHealth(
            status="ok",
            latency_ms=latency,
            detail=f"bucket {'encontrado' if exists else 'no encontrado'}",
        )
    except Exception as exc:
        logger.error("MinIO health check fallido", exc_info=True)
        minio_health = ServiceHealth(status="error", detail=str(exc)[:120])

    # MediaMTX
    mediamtx_health: ServiceHealth
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            t0 = time.monotonic()
            resp = await client.get(f"{settings.mediamtx_api_url}/v3/paths/list")
            latency = round((time.monotonic() - t0) * 1000, 1)
            paths = resp.json().get("items", [])
            mediamtx_health = ServiceHealth(
                status="ok",
                latency_ms=latency,
                detail=f"{len(paths)} streams RTMP activos",
            )
    except Exception as exc:
        logger.error("MediaMTX health check fallido", exc_info=True)
        mediamtx_health = ServiceHealth(status="error", detail=str(exc)[:120])

    # AI Worker — vía heartbeat key en Redis
    ai_health: ServiceHealth
    try:
        r = aioredis.from_url(settings.redis_url, decode_responses=True)
        heartbeat = await r.get("aerofinder:ai_worker:heartbeat")
        await r.aclose()
        if heartbeat:
            age_s = round(time.time() - float(heartbeat), 0)
            ai_health = ServiceHealth(
                status="ok" if age_s < 30 else "stale",
                detail=f"último heartbeat hace {int(age_s)} s",
            )
        else:
            ai_health = ServiceHealth(status="unknown", detail="sin heartbeat registrado")
    except Exception as exc:
        logger.error("AI Worker health check fallido", exc_info=True)
        ai_health = ServiceHealth(status="error", detail=str(exc)[:120])

    return InfraHealth(
        redis=redis_health,
        minio=minio_health,
        mediamtx=mediamtx_health,
        ai_worker=ai_health,
    )


@router.get("/admins", response_model=list[UserResponse])
async def list_admins(
    _: CurrentUser = Depends(_super_admin),
    db: AsyncSession = Depends(get_db),
) -> list[UserResponse]:
    """Lista todos los usuarios con rol admin."""
    try:
        result = await db.execute(
            select(User, Role)
            .join(Role, User.role_id == Role.id)
            .where(Role.name == RoleName.admin)
            .order_by(User.created_at.desc())
        )
        return [_build_user_response(u, r.name) for u, r in result.all()]
    except Exception:
        logger.error("Error al listar admins", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")


@router.get("/sessions", response_model=list[AdminSessionResponse])
async def list_active_sessions(
    _: CurrentUser = Depends(_super_admin),
    db: AsyncSession = Depends(get_db),
) -> list[AdminSessionResponse]:
    """Lista todas las sesiones activas del sistema (no revocadas y no expiradas)."""
    try:
        now = datetime.datetime.now(datetime.timezone.utc)
        result = await db.execute(
            select(UserSession, User, Role)
            .join(User, UserSession.user_id == User.id)
            .join(Role, User.role_id == Role.id)
            .where(
                UserSession.is_revoked.is_(False),
                UserSession.expires_at > now,
            )
            .order_by(UserSession.issued_at.desc())
            .limit(50)
        )
        rows = result.all()
    except Exception:
        logger.error("Error al listar sesiones activas", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

    return [
        AdminSessionResponse(
            id=str(sess.id),
            user_id=str(user.id),
            user_name=user.full_name,
            user_email=user.email,
            user_role=role.name.value,
            ip_address=str(sess.ip_address),
            user_agent=sess.user_agent,
            issued_at=sess.issued_at.isoformat(),
            expires_at=sess.expires_at.isoformat(),
        )
        for sess, user, role in rows
    ]


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_session(
    session_id: uuid.UUID,
    current_user: CurrentUser = Depends(_super_admin),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Revoca una sesión activa. No puede revocar la propia sesión."""
    if session_id == current_user.session_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No puedes revocar tu propia sesión activa",
        )
    try:
        result = await db.execute(
            select(UserSession).where(UserSession.id == session_id)
        )
        sess: UserSession | None = result.scalar_one_or_none()
    except Exception:
        logger.error("Error al buscar sesión id=%s", session_id, exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

    if sess is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sesión no encontrada")

    sess.is_revoked = True
    sess.revoked_at = datetime.datetime.now(datetime.timezone.utc)


@router.get("/soft-deleted", response_model=list[SoftDeletedUser])
async def list_soft_deleted(
    _: CurrentUser = Depends(_super_admin),
    db: AsyncSession = Depends(get_db),
) -> list[SoftDeletedUser]:
    """Lista usuarios desactivados (is_active=False) candidatos a borrado definitivo."""
    try:
        result = await db.execute(
            select(User, Role)
            .join(Role, User.role_id == Role.id)
            .where(User.is_active.is_(False))
            .order_by(User.updated_at.desc())
        )
        rows = result.all()
    except Exception:
        logger.error("Error al listar usuarios soft-deleted", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

    return [
        SoftDeletedUser(
            id=str(u.id),
            email=u.email,
            full_name=u.full_name,
            role=r.name.value,
            deactivated_at=u.updated_at.isoformat() if u.updated_at else None,
        )
        for u, r in rows
    ]


class HardDeleteBody(BaseModel):
    confirm: bool


@router.delete("/users/{user_id}/hard", status_code=status.HTTP_204_NO_CONTENT)
async def hard_delete_user(
    user_id: uuid.UUID,
    body: HardDeleteBody,
    _: CurrentUser = Depends(_super_admin),
    db: AsyncSession = Depends(get_db),
) -> None:
    """
    Borrado definitivo de usuario inactivo.
    Requiere body {"confirm": true}.
    Solo funciona sobre usuarios con is_active=False.
    """
    if not body.confirm:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Se requiere confirm=true para borrado definitivo",
        )
    try:
        result = await db.execute(select(User).where(User.id == user_id))
        user: User | None = result.scalar_one_or_none()
    except Exception:
        logger.error("Error al buscar usuario id=%s para hard delete", user_id, exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")

    if user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Solo se pueden borrar definitivamente usuarios desactivados",
        )

    try:
        await db.delete(user)
    except Exception:
        logger.error("Error al hacer hard delete usuario id=%s", user_id, exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

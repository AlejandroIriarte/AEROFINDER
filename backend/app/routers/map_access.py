# =============================================================================
# AEROFINDER Backend — Router: Acceso de usuarios al mapa de misión
#
# Endpoints:
#   GET    /missions/{mission_id}/map-access              — lista quién tiene acceso
#   POST   /missions/{mission_id}/map-access              — concede acceso (admin/buscador)
#   DELETE /missions/{mission_id}/map-access/{user_id}   — revoca acceso (admin/buscador)
# =============================================================================

import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.auth import User
from app.models.map_access import MissionMapAccess
from app.models.missions import Mission
from app.routers.auth import get_current_user
from app.schemas.map_access import MapAccessGrant, MapAccessGrantRequest
from app.models.enums import RoleName

logger = logging.getLogger(__name__)
router = APIRouter(tags=["map-access"])


def _require_admin_or_buscador(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role.name not in (RoleName.admin, RoleName.super_admin, RoleName.buscador):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permiso insuficiente")
    return current_user


async def _get_mission_or_404(mission_id: uuid.UUID, db: AsyncSession) -> Mission:
    result = await db.execute(select(Mission).where(Mission.id == mission_id))
    mission = result.scalar_one_or_none()
    if mission is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Misión no encontrada")
    return mission


@router.get("/missions/{mission_id}/map-access", response_model=list[MapAccessGrant])
async def list_map_access(
    mission_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(_require_admin_or_buscador),
) -> list[MapAccessGrant]:
    """Lista todos los usuarios con acceso al mapa de una misión."""
    await _get_mission_or_404(mission_id, db)

    result = await db.execute(
        select(MissionMapAccess, User)
        .join(User, MissionMapAccess.user_id == User.id)
        .where(MissionMapAccess.mission_id == mission_id)
        .order_by(MissionMapAccess.granted_at)
    )
    rows = result.all()

    return [
        MapAccessGrant(
            id=access.id,
            mission_id=access.mission_id,
            user_id=access.user_id,
            granted_by=access.granted_by,
            granted_at=access.granted_at,
            user_full_name=user.full_name,
            user_role=user.role.name,
        )
        for access, user in rows
    ]


@router.post(
    "/missions/{mission_id}/map-access",
    response_model=MapAccessGrant,
    status_code=status.HTTP_201_CREATED,
)
async def grant_map_access(
    mission_id: uuid.UUID,
    body: MapAccessGrantRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(_require_admin_or_buscador),
) -> MapAccessGrant:
    """Concede acceso al mapa de la misión a un usuario (ayudante o familiar)."""
    await _get_mission_or_404(mission_id, db)

    # Verificar que el usuario existe
    user_result = await db.execute(select(User).where(User.id == body.user_id))
    target_user = user_result.scalar_one_or_none()
    if target_user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")

    # Verificar si ya existe (retornar el existente si es así)
    existing = await db.execute(
        select(MissionMapAccess).where(
            MissionMapAccess.mission_id == mission_id,
            MissionMapAccess.user_id == body.user_id,
        )
    )
    access = existing.scalar_one_or_none()

    if access is None:
        access = MissionMapAccess(
            mission_id=mission_id,
            user_id=body.user_id,
            granted_by=current_user.id,
        )
        db.add(access)
        await db.flush()
        await db.refresh(access)
        logger.info(
            "Acceso al mapa concedido: mission=%s user=%s by=%s",
            mission_id, body.user_id, current_user.id,
        )

    return MapAccessGrant(
        id=access.id,
        mission_id=access.mission_id,
        user_id=access.user_id,
        granted_by=access.granted_by,
        granted_at=access.granted_at,
        user_full_name=target_user.full_name,
        user_role=target_user.role.name,
    )


@router.delete(
    "/missions/{mission_id}/map-access/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def revoke_map_access(
    mission_id: uuid.UUID,
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(_require_admin_or_buscador),
) -> None:
    """Revoca el acceso al mapa de la misión a un usuario."""
    await _get_mission_or_404(mission_id, db)

    result = await db.execute(
        select(MissionMapAccess).where(
            MissionMapAccess.mission_id == mission_id,
            MissionMapAccess.user_id == user_id,
        )
    )
    access = result.scalar_one_or_none()
    if access is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Acceso no encontrado")

    await db.delete(access)
    logger.info("Acceso al mapa revocado: mission=%s user=%s by=%s", mission_id, user_id, current_user.id)

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

from app.core.deps import CurrentUser, get_current_user, require_role
from app.db.session import get_db
from app.models.auth import Role, User
from app.models.map_access import MissionMapAccess
from app.models.missions import Mission
from app.schemas.map_access import MapAccessGrant, MapAccessGrantRequest
from app.models.enums import RoleName

logger = logging.getLogger(__name__)
router = APIRouter(tags=["map-access"])

_staff = require_role(RoleName.admin, RoleName.buscador)


async def _get_mission_or_404(mission_id: uuid.UUID, db: AsyncSession) -> Mission:
    try:
        result = await db.execute(select(Mission).where(Mission.id == mission_id))
        mission = result.scalar_one_or_none()
    except Exception:
        logger.error("Error al consultar misión id=%s", mission_id, exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")
    if mission is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Misión no encontrada")
    return mission


@router.get("/missions/{mission_id}/map-access", response_model=list[MapAccessGrant])
async def list_map_access(
    mission_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(_staff),
) -> list[MapAccessGrant]:
    """Lista todos los usuarios con acceso al mapa de una misión."""
    await _get_mission_or_404(mission_id, db)

    try:
        result = await db.execute(
            select(MissionMapAccess, User, Role)
            .join(User, MissionMapAccess.user_id == User.id)
            .join(Role, User.role_id == Role.id)
            .where(MissionMapAccess.mission_id == mission_id)
            .order_by(MissionMapAccess.granted_at)
        )
        rows = result.all()
    except Exception:
        logger.error("Error al listar accesos mapa mission_id=%s", mission_id, exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

    return [
        MapAccessGrant(
            id=access.id,
            mission_id=access.mission_id,
            user_id=access.user_id,
            granted_by=access.granted_by,
            granted_at=access.granted_at,
            user_full_name=user.full_name,
            user_role=role.name.value,
        )
        for access, user, role in rows
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
    current_user: CurrentUser = Depends(_staff),
) -> MapAccessGrant:
    """Concede acceso al mapa de la misión a un usuario (ayudante o familiar)."""
    await _get_mission_or_404(mission_id, db)

    # Verificar que el usuario existe y cargar su rol
    try:
        user_result = await db.execute(
            select(User, Role)
            .join(Role, User.role_id == Role.id)
            .where(User.id == body.user_id)
        )
        user_row = user_result.first()
    except Exception:
        logger.error("Error al consultar usuario id=%s", body.user_id, exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

    if user_row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")

    target_user, target_role = user_row

    # Verificar si ya existe (retornar el existente si es así)
    try:
        existing = await db.execute(
            select(MissionMapAccess).where(
                MissionMapAccess.mission_id == mission_id,
                MissionMapAccess.user_id == body.user_id,
            )
        )
        access = existing.scalar_one_or_none()
    except Exception:
        logger.error(
            "Error al verificar acceso existente mission_id=%s user_id=%s",
            mission_id, body.user_id, exc_info=True,
        )
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

    if access is None:
        try:
            access = MissionMapAccess(
                mission_id=mission_id,
                user_id=body.user_id,
                granted_by=current_user.id,
            )
            db.add(access)
            await db.flush()
            await db.refresh(access)
        except Exception:
            logger.error(
                "Error al crear acceso mapa mission_id=%s user_id=%s",
                mission_id, body.user_id, exc_info=True,
            )
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")
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
        user_role=target_role.name.value,
    )


@router.delete(
    "/missions/{mission_id}/map-access/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def revoke_map_access(
    mission_id: uuid.UUID,
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(_staff),
) -> None:
    """Revoca el acceso al mapa de la misión a un usuario."""
    await _get_mission_or_404(mission_id, db)

    try:
        result = await db.execute(
            select(MissionMapAccess).where(
                MissionMapAccess.mission_id == mission_id,
                MissionMapAccess.user_id == user_id,
            )
        )
        access = result.scalar_one_or_none()
    except Exception:
        logger.error(
            "Error al consultar acceso mapa mission_id=%s user_id=%s",
            mission_id, user_id, exc_info=True,
        )
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

    if access is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Acceso no encontrado")

    try:
        await db.delete(access)
    except Exception:
        logger.error(
            "Error al revocar acceso mapa mission_id=%s user_id=%s",
            mission_id, user_id, exc_info=True,
        )
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

    logger.info("Acceso al mapa revocado: mission=%s user=%s by=%s", mission_id, user_id, current_user.id)

# =============================================================================
# AEROFINDER Backend — Router: Drones y Mantenimiento
# Endpoints: CRUD /drones, historial de mantenimiento
# =============================================================================

import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import CurrentUser, get_current_user, require_role
from app.db.session import get_db
from app.models.drones import Drone, DroneMaintenanceLog
from app.models.enums import RoleName
from app.schemas.drones import (
    DroneCreate,
    DroneResponse,
    DroneUpdate,
    MaintenanceCreate,
    MaintenanceResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/drones", tags=["drones"])

_admin = require_role(RoleName.admin)
_readers = require_role(RoleName.admin, RoleName.buscador, RoleName.ayudante)


@router.get("/", response_model=list[DroneResponse])
async def list_drones(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=20, le=100),
    _: CurrentUser = Depends(_readers),
    db: AsyncSession = Depends(get_db),
) -> list[DroneResponse]:
    """Lista todos los drones. Admin, buscador y ayudante."""
    try:
        result = await db.execute(select(Drone).offset(skip).limit(limit))
        drones = result.scalars().all()
    except Exception:
        logger.error("Error al listar drones", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

    return [DroneResponse.model_validate(d) for d in drones]


@router.post("/", response_model=DroneResponse, status_code=status.HTTP_201_CREATED)
async def create_drone(
    body: DroneCreate,
    _: CurrentUser = Depends(_admin),
    db: AsyncSession = Depends(get_db),
) -> DroneResponse:
    """Registra un nuevo dron. Solo admin."""
    # Verificar número de serie único
    try:
        existing = await db.execute(
            select(Drone).where(Drone.serial_number == body.serial_number)
        )
        if existing.scalar_one_or_none() is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Número de serie ya registrado",
            )
    except HTTPException:
        raise
    except Exception:
        logger.error("Error al verificar serial_number=%s", body.serial_number, exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

    try:
        drone = Drone(
            serial_number=body.serial_number,
            model=body.model,
            manufacturer=body.manufacturer,
            battery_warning_pct=body.battery_warning_pct,
            max_flight_time_minutes=body.max_flight_time_minutes,
            notes=body.notes,
        )
        db.add(drone)
        await db.flush()
    except Exception:
        logger.error("Error al crear dron serial=%s", body.serial_number, exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

    return DroneResponse.model_validate(drone)


@router.get("/{drone_id}", response_model=DroneResponse)
async def get_drone(
    drone_id: uuid.UUID,
    _: CurrentUser = Depends(_readers),
    db: AsyncSession = Depends(get_db),
) -> DroneResponse:
    """Obtiene detalle de un dron. Admin, buscador y ayudante."""
    try:
        result = await db.execute(select(Drone).where(Drone.id == drone_id))
        drone: Drone | None = result.scalar_one_or_none()
    except Exception:
        logger.error("Error al obtener dron id=%s", drone_id, exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

    if drone is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dron no encontrado")

    return DroneResponse.model_validate(drone)


@router.patch("/{drone_id}", response_model=DroneResponse)
async def update_drone(
    drone_id: uuid.UUID,
    body: DroneUpdate,
    _: CurrentUser = Depends(_admin),
    db: AsyncSession = Depends(get_db),
) -> DroneResponse:
    """Actualiza un dron. Solo admin."""
    try:
        result = await db.execute(select(Drone).where(Drone.id == drone_id))
        drone: Drone | None = result.scalar_one_or_none()
    except Exception:
        logger.error("Error al buscar dron id=%s", drone_id, exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

    if drone is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dron no encontrado")

    update_fields = body.model_dump(exclude_none=True)
    for field, value in update_fields.items():
        setattr(drone, field, value)

    return DroneResponse.model_validate(drone)


# ── Mantenimiento ─────────────────────────────────────────────────────────────

@router.get("/{drone_id}/maintenance", response_model=list[MaintenanceResponse])
async def list_maintenance(
    drone_id: uuid.UUID,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=20, le=100),
    current_user: CurrentUser = Depends(_readers),
    db: AsyncSession = Depends(get_db),
) -> list[MaintenanceResponse]:
    """Lista el historial de mantenimiento de un dron. Admin y buscador."""
    # Verificar que el dron existe
    try:
        drone_result = await db.execute(select(Drone.id).where(Drone.id == drone_id))
        if drone_result.scalar_one_or_none() is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dron no encontrado")
    except HTTPException:
        raise
    except Exception:
        logger.error("Error al verificar dron id=%s", drone_id, exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

    try:
        result = await db.execute(
            select(DroneMaintenanceLog)
            .where(DroneMaintenanceLog.drone_id == drone_id)
            .order_by(DroneMaintenanceLog.performed_at.desc())
            .offset(skip)
            .limit(limit)
        )
        logs = result.scalars().all()
    except Exception:
        logger.error("Error al listar mantenimiento dron_id=%s", drone_id, exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

    return [MaintenanceResponse.model_validate(log) for log in logs]


@router.post(
    "/{drone_id}/maintenance",
    response_model=MaintenanceResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_maintenance(
    drone_id: uuid.UUID,
    body: MaintenanceCreate,
    current_user: CurrentUser = Depends(_admin),
    db: AsyncSession = Depends(get_db),
) -> MaintenanceResponse:
    """Registra un mantenimiento. Solo admin."""
    # Verificar que el dron existe
    try:
        drone_result = await db.execute(select(Drone.id).where(Drone.id == drone_id))
        if drone_result.scalar_one_or_none() is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dron no encontrado")
    except HTTPException:
        raise
    except Exception:
        logger.error("Error al verificar dron id=%s", drone_id, exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

    try:
        log = DroneMaintenanceLog(
            drone_id=drone_id,
            maintenance_type=body.maintenance_type,
            performed_by=current_user.id,
            performed_at=body.performed_at,
            flight_hours_at_maintenance=body.flight_hours_at_maintenance,
            notes=body.notes,
            next_due_at=body.next_due_at,
        )
        db.add(log)
        await db.flush()
    except Exception:
        logger.error("Error al registrar mantenimiento dron_id=%s", drone_id, exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

    return MaintenanceResponse.model_validate(log)

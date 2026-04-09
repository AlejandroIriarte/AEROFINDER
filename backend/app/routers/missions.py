# =============================================================================
# AEROFINDER Backend — Router: Misiones y Operaciones de Campo
# Endpoints: CRUD /missions, drones asignados, waypoints, eventos, cobertura
# =============================================================================

import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from geoalchemy2.shape import to_shape
from shapely.geometry import mapping
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import CurrentUser, get_current_user, require_role
from app.db.session import get_db
from app.models.enums import RoleName
from app.models.missions import (
    Mission,
    MissionCoverageZone,
    MissionDrone,
    MissionEvent,
    MissionWaypoint,
)
from app.schemas.missions import (
    AssignDroneRequest,
    CoverageZoneResponse,
    MissionCreate,
    MissionDroneResponse,
    MissionEventResponse,
    MissionResponse,
    MissionUpdate,
    WaypointCreate,
    WaypointResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/missions", tags=["misiones"])

_staff   = require_role(RoleName.admin, RoleName.buscador)
# Ayudante solo puede ver listados y detalle de misión (get_current_user)
# No tiene acceso a eventos ni zonas de cobertura (datos operacionales)
_readers = require_role(RoleName.admin, RoleName.buscador)


def _mission_to_response(m: Mission) -> MissionResponse:
    """Convierte un ORM Mission a MissionResponse, serializando la geometría a WKT."""
    wkt: str | None = None
    if m.search_area is not None:
        try:
            wkt = to_shape(m.search_area).wkt
        except Exception:
            logger.error("Error al convertir search_area a WKT misión id=%s", m.id, exc_info=True)

    return MissionResponse(
        id=m.id,
        name=m.name,
        description=m.description,
        missing_person_id=m.missing_person_id,
        status=m.status,
        lead_user_id=m.lead_user_id,
        planned_at=m.planned_at,
        started_at=m.started_at,
        completed_at=m.completed_at,
        notes=m.notes,
        search_area_wkt=wkt,
        created_at=m.created_at,
        updated_at=m.updated_at,
    )


def _zone_to_response(z: MissionCoverageZone) -> CoverageZoneResponse:
    wkt: str | None = None
    if z.zone_polygon is not None:
        try:
            wkt = to_shape(z.zone_polygon).wkt
        except Exception:
            logger.error("Error al convertir zone_polygon a WKT zona id=%s", z.id, exc_info=True)

    return CoverageZoneResponse(
        id=z.id,
        mission_id=z.mission_id,
        status=z.status,
        drone_id=z.drone_id,
        started_at=z.started_at,
        completed_at=z.completed_at,
        zone_polygon_wkt=wkt,
        created_at=z.created_at,
        updated_at=z.updated_at,
    )


@router.get("/", response_model=list[MissionResponse])
async def list_missions(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=20, le=100),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[MissionResponse]:
    """
    Lista misiones. Todos los roles autenticados.
    Familiar: solo puede ver misiones relacionadas con su persona vinculada
    (filtro a nivel aplicación, además de RLS en missing_persons).
    """
    try:
        if current_user.role == RoleName.familiar:
            # Familiar solo ve misiones de sus personas vinculadas
            from app.models.persons import PersonRelative
            result = await db.execute(
                select(Mission)
                .join(
                    PersonRelative,
                    Mission.missing_person_id == PersonRelative.missing_person_id,
                )
                .where(PersonRelative.user_id == current_user.id)
                .offset(skip)
                .limit(limit)
            )
        else:
            result = await db.execute(select(Mission).offset(skip).limit(limit))

        missions = result.scalars().all()
    except Exception:
        logger.error("Error al listar misiones", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

    return [_mission_to_response(m) for m in missions]


@router.post("/", response_model=MissionResponse, status_code=status.HTTP_201_CREATED)
async def create_mission(
    body: MissionCreate,
    current_user: CurrentUser = Depends(_staff),
    db: AsyncSession = Depends(get_db),
) -> MissionResponse:
    """Crea una nueva misión. Admin o buscador."""
    search_area_geom = None
    if body.search_area is not None:
        try:
            from geoalchemy2.shape import from_shape
            from shapely.geometry import shape
            search_area_geom = from_shape(shape(body.search_area), srid=4326)
        except Exception:
            logger.error("Error al convertir search_area GeoJSON", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="search_area debe ser un GeoJSON Polygon válido",
            )

    try:
        mission = Mission(
            name=body.name,
            description=body.description,
            missing_person_id=body.missing_person_id,
            lead_user_id=body.lead_user_id,
            planned_at=body.planned_at,
            notes=body.notes,
            search_area=search_area_geom,
        )
        db.add(mission)
        await db.flush()
    except Exception:
        logger.error("Error al crear misión", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

    return _mission_to_response(mission)


@router.get("/{mission_id}", response_model=MissionResponse)
async def get_mission(
    mission_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MissionResponse:
    """Obtiene detalle de una misión. Todos los roles."""
    try:
        result = await db.execute(select(Mission).where(Mission.id == mission_id))
        mission: Mission | None = result.scalar_one_or_none()
    except Exception:
        logger.error("Error al obtener misión id=%s", mission_id, exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

    if mission is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Misión no encontrada")

    return _mission_to_response(mission)


@router.patch("/{mission_id}", response_model=MissionResponse)
async def update_mission(
    mission_id: uuid.UUID,
    body: MissionUpdate,
    current_user: CurrentUser = Depends(_staff),
    db: AsyncSession = Depends(get_db),
) -> MissionResponse:
    """Actualiza una misión. Admin o buscador."""
    try:
        result = await db.execute(select(Mission).where(Mission.id == mission_id))
        mission: Mission | None = result.scalar_one_or_none()
    except Exception:
        logger.error("Error al buscar misión id=%s", mission_id, exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

    if mission is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Misión no encontrada")

    update_data = body.model_dump(exclude_none=True)
    search_area_raw = update_data.pop("search_area", None)

    for field, value in update_data.items():
        setattr(mission, field, value)

    if search_area_raw is not None:
        try:
            from geoalchemy2.shape import from_shape
            from shapely.geometry import shape
            mission.search_area = from_shape(shape(search_area_raw), srid=4326)
        except Exception:
            logger.error("Error al convertir search_area GeoJSON", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="search_area debe ser un GeoJSON Polygon válido",
            )

    return _mission_to_response(mission)


# ── Drones asignados ──────────────────────────────────────────────────────────

@router.get("/{mission_id}/drones", response_model=list[MissionDroneResponse])
async def list_mission_drones(
    mission_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[MissionDroneResponse]:
    """Lista los drones asignados a la misión."""
    try:
        result = await db.execute(
            select(MissionDrone).where(MissionDrone.mission_id == mission_id)
        )
        assignments = result.scalars().all()
    except Exception:
        logger.error("Error al listar drones misión id=%s", mission_id, exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

    return [MissionDroneResponse.model_validate(a) for a in assignments]


@router.post(
    "/{mission_id}/drones",
    response_model=MissionDroneResponse,
    status_code=status.HTTP_201_CREATED,
)
async def assign_drone(
    mission_id: uuid.UUID,
    body: AssignDroneRequest,
    current_user: CurrentUser = Depends(_staff),
    db: AsyncSession = Depends(get_db),
) -> MissionDroneResponse:
    """Asigna un dron a la misión. Admin o buscador."""
    # Verificar que no está ya asignado (sin left_at)
    try:
        existing = await db.execute(
            select(MissionDrone).where(
                MissionDrone.mission_id == mission_id,
                MissionDrone.drone_id == body.drone_id,
                MissionDrone.left_at.is_(None),
            )
        )
        if existing.scalar_one_or_none() is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="El dron ya está asignado a esta misión",
            )
    except HTTPException:
        raise
    except Exception:
        logger.error("Error al verificar asignación misión", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

    try:
        assignment = MissionDrone(mission_id=mission_id, drone_id=body.drone_id)
        db.add(assignment)
        await db.flush()
    except Exception:
        logger.error("Error al asignar dron a misión", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

    return MissionDroneResponse.model_validate(assignment)


@router.delete("/{mission_id}/drones/{drone_id}", status_code=status.HTTP_204_NO_CONTENT)
async def unassign_drone(
    mission_id: uuid.UUID,
    drone_id: uuid.UUID,
    current_user: CurrentUser = Depends(_staff),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Desasigna un dron de la misión (registra left_at). Admin o buscador."""
    try:
        result = await db.execute(
            select(MissionDrone).where(
                MissionDrone.mission_id == mission_id,
                MissionDrone.drone_id == drone_id,
                MissionDrone.left_at.is_(None),
            )
        )
        assignment: MissionDrone | None = result.scalar_one_or_none()
    except Exception:
        logger.error("Error al buscar asignación misión/dron", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

    if assignment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asignación no encontrada")

    assignment.left_at = datetime.now(timezone.utc)


# ── Waypoints ─────────────────────────────────────────────────────────────────

@router.get("/{mission_id}/waypoints", response_model=list[WaypointResponse])
async def list_waypoints(
    mission_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[WaypointResponse]:
    """Lista waypoints de la misión ordenados por sequence_number."""
    try:
        result = await db.execute(
            select(MissionWaypoint)
            .where(MissionWaypoint.mission_id == mission_id)
            .order_by(MissionWaypoint.sequence_number)
        )
        waypoints = result.scalars().all()
    except Exception:
        logger.error("Error al listar waypoints misión id=%s", mission_id, exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

    return [WaypointResponse.model_validate(w) for w in waypoints]


@router.put(
    "/{mission_id}/waypoints",
    response_model=list[WaypointResponse],
    status_code=status.HTTP_200_OK,
)
async def set_waypoints(
    mission_id: uuid.UUID,
    body: list[WaypointCreate],
    current_user: CurrentUser = Depends(_staff),
    db: AsyncSession = Depends(get_db),
) -> list[WaypointResponse]:
    """
    Reemplaza TODOS los waypoints de la misión.
    PUT semántico: el cuerpo representa la lista completa.
    Admin o buscador.
    """
    try:
        # Eliminar waypoints existentes
        await db.execute(
            delete(MissionWaypoint).where(MissionWaypoint.mission_id == mission_id)
        )
        # Insertar los nuevos
        new_waypoints = [
            MissionWaypoint(
                mission_id=mission_id,
                sequence_number=wp.sequence_number,
                latitude=wp.latitude,
                longitude=wp.longitude,
                altitude_m=wp.altitude_m,
            )
            for wp in body
        ]
        for wp in new_waypoints:
            db.add(wp)
        await db.flush()
    except Exception:
        logger.error("Error al establecer waypoints misión id=%s", mission_id, exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

    return [WaypointResponse.model_validate(w) for w in new_waypoints]


# ── Eventos ───────────────────────────────────────────────────────────────────

@router.get("/{mission_id}/events", response_model=list[MissionEventResponse])
async def list_events(
    mission_id: uuid.UUID,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, le=200),
    current_user: CurrentUser = Depends(_readers),
    db: AsyncSession = Depends(get_db),
) -> list[MissionEventResponse]:
    """Lista eventos de la misión en orden cronológico. Admin, buscador, ayudante."""
    try:
        result = await db.execute(
            select(MissionEvent)
            .where(MissionEvent.mission_id == mission_id)
            .order_by(MissionEvent.occurred_at)
            .offset(skip)
            .limit(limit)
        )
        events = result.scalars().all()
    except Exception:
        logger.error("Error al listar eventos misión id=%s", mission_id, exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

    return [MissionEventResponse.model_validate(e) for e in events]


# ── Zonas de cobertura ────────────────────────────────────────────────────────

@router.get("/{mission_id}/coverage", response_model=list[CoverageZoneResponse])
async def list_coverage_zones(
    mission_id: uuid.UUID,
    current_user: CurrentUser = Depends(_readers),
    db: AsyncSession = Depends(get_db),
) -> list[CoverageZoneResponse]:
    """Lista las zonas de cobertura de la misión. Admin, buscador, ayudante."""
    try:
        result = await db.execute(
            select(MissionCoverageZone)
            .where(MissionCoverageZone.mission_id == mission_id)
        )
        zones = result.scalars().all()
    except Exception:
        logger.error("Error al listar cobertura misión id=%s", mission_id, exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

    return [_zone_to_response(z) for z in zones]

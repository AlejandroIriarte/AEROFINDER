# =============================================================================
# AEROFINDER Backend — Router: Misiones y Operaciones de Campo
# Endpoints: CRUD /missions, drones asignados, waypoints, eventos, cobertura
# =============================================================================

import base64
import hashlib
import io
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from geoalchemy2.shape import to_shape
from shapely.geometry import mapping
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from sqlalchemy import func

from app.core.deps import CurrentUser, get_current_user, require_role
from app.core.ws_manager import ws_manager
from app.db.session import AsyncWorkerSessionLocal, get_db
from app.models.enums import AlertContentLevel, AlertStatus, RoleName
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
    RecognitionToggleRequest,
    WaypointCreate,
    WaypointResponse,
)
from app.schemas.field_reports import FieldReportCreate

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
        recognition_active=m.recognition_active,
        face_recognition_active=m.face_recognition_active,
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

    prev_status = mission.status
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

    response = _mission_to_response(mission)

    # Al completar la misión: notificar a los familiares y broadcast WS
    new_status = update_data.get("status")
    if new_status == "completed" and prev_status != "completed":
        import asyncio as _asyncio
        _asyncio.ensure_future(_notify_mission_completed(mission))

    return response


async def _notify_mission_completed(mission: Mission) -> None:
    """
    Crea alertas de finalización para los familiares de la persona buscada
    y emite un WS mission_update al canal de la misión.
    Usa AsyncWorkerSessionLocal (rolbypassrls=true) para el INSERT en alerts.
    """
    from app.models.persons import MissingPerson, PersonRelative
    from app.models.pipeline import Alert

    try:
        # Obtener nombre de la persona y lista de familiares
        async with AsyncWorkerSessionLocal() as session:
            person_row = await session.execute(
                select(MissingPerson.full_name).where(MissingPerson.id == mission.missing_person_id)
            )
            person_name = person_row.scalar_one_or_none() or "la persona buscada"

            rel_rows = await session.execute(
                select(PersonRelative.user_id).where(
                    PersonRelative.missing_person_id == mission.missing_person_id
                )
            )
            familiar_ids = [r for (r,) in rel_rows.all()]

        if not familiar_ids:
            logger.info("Misión completada sin familiares vinculados: mission=%s", mission.id)
        else:
            msg = (
                f"La misión '{mission.name}' ha finalizado. "
                f"Búsqueda de {person_name} completada."
            )
            async with AsyncWorkerSessionLocal() as session:
                async with session.begin():
                    for fam_id in familiar_ids:
                        session.add(Alert(
                            id=uuid.uuid4(),
                            detection_id=None,          # alerta de sistema, no de detección
                            recipient_user_id=fam_id,
                            content_level=AlertContentLevel.confirmation_only,
                            status=AlertStatus.generated,
                            message_text=msg,
                        ))
            logger.info(
                "Alertas de finalización creadas: mission=%s familiares=%d",
                mission.id, len(familiar_ids),
            )

        # Broadcast WS a la sala de la misión
        await ws_manager.broadcast(
            f"mission:{mission.id}",
            {"type": "mission_update", "mission_id": str(mission.id), "status": "completed"},
        )
        # Broadcast al canal de alertas globales
        await ws_manager.broadcast(
            "alerts",
            {"type": "mission_completed", "mission_id": str(mission.id), "mission_name": mission.name},
        )

    except Exception:
        logger.error("Error al notificar finalización de misión=%s", mission.id, exc_info=True)


# ── Reconocimiento facial ─────────────────────────────────────────────────────

@router.post("/{mission_id}/recognition", response_model=MissionResponse)
async def toggle_recognition(
    mission_id: uuid.UUID,
    body: RecognitionToggleRequest,
    current_user: CurrentUser = Depends(_staff),
    db: AsyncSession = Depends(get_db),
) -> MissionResponse:
    """
    Activa o desactiva el reconocimiento facial del AI worker para esta misión.
    Solo se puede activar cuando la misión está en estado 'active'.
    Admin o buscador.
    """
    try:
        result = await db.execute(select(Mission).where(Mission.id == mission_id))
        mission: Mission | None = result.scalar_one_or_none()
    except Exception:
        logger.error("Error al buscar misión id=%s", mission_id, exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

    if mission is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Misión no encontrada")

    if (body.person_detection or body.face_recognition) and mission.status != "active":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="El reconocimiento solo se puede activar en misiones con estado 'active'",
        )

    mission.recognition_active = body.person_detection
    mission.face_recognition_active = body.face_recognition
    logger.info(
        "Reconocimiento actualizado — persona=%s facial=%s misión id=%s user=%s",
        body.person_detection,
        body.face_recognition,
        mission_id,
        current_user.id,
    )

    # Broadcast a todos los conectados a esta misión
    from app.core.ws_manager import ws_manager
    await ws_manager.broadcast(f"mission:{mission_id}", {
        "type": "mission_recognition",
        "person_detection": body.person_detection,
        "face_recognition": body.face_recognition,
    })

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
    """Lista eventos de la misión en orden cronológico. Solo admin y buscador."""
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
    """Lista las zonas de cobertura de la misión. Solo admin y buscador."""
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


# ── Field Reports ─────────────────────────────────────────────────────────────

@router.post("/{mission_id}/field-reports", status_code=status.HTTP_201_CREATED)
async def create_field_report(
    mission_id: uuid.UUID,
    body: FieldReportCreate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Rescatista crea una solicitud de análisis. Notifica a admins por WS."""
    from decimal import Decimal
    from app.models.field_reports import FieldReport as FR

    try:
        result = await db.execute(select(Mission).where(Mission.id == mission_id))
        mission: Mission | None = result.scalar_one_or_none()
    except Exception:
        logger.error("Error al buscar misión id=%s", mission_id, exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

    if mission is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Misión no encontrada")

    if mission.status != "active":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="La misión no está activa")

    report = FR(
        mission_id=mission_id,
        rescuer_id=current_user.id,
        notes=body.notes,
        location_lat=Decimal(str(body.location_lat)) if body.location_lat else None,
        location_lon=Decimal(str(body.location_lon)) if body.location_lon else None,
    )
    db.add(report)
    await db.flush()

    # Notificar a todos los conectados a la misión
    from app.core.ws_manager import ws_manager
    await ws_manager.broadcast(f"mission:{mission_id}", {
        "type": "field_report_request",
        "report_id": str(report.id),
        "rescuer_name": current_user.full_name,
        "location_lat": body.location_lat,
        "location_lon": body.location_lon,
    })

    return {"id": str(report.id), "status": "pending"}


# ── Snapshot manual ───────────────────────────────────────────────────────────

class ManualSnapshotRequest(BaseModel):
    drone_id: str
    image_b64: str                          # JPEG en base64 — frame capturado en frontend
    detections: Optional[list[dict]] = []  # [{bbox, detection_type, confidence}]


class ManualSnapshotResponse(BaseModel):
    detection_id: str
    snapshot_url: str


@router.post("/{mission_id}/snapshots/manual", response_model=ManualSnapshotResponse, status_code=status.HTTP_201_CREATED)
async def capture_manual_snapshot(
    mission_id: uuid.UUID,
    body: ManualSnapshotRequest,
    current_user: CurrentUser = Depends(_staff),
    db: AsyncSession = Depends(get_db),
) -> ManualSnapshotResponse:
    """
    Guarda un snapshot manual capturado desde el frontend.
    El cliente envía el frame (JPEG base64) con los recuadros ya dibujados.
    Se crea un registro de detección con snapshot para mostrarlo en la misión.
    """
    from app.models.enums import FileRetentionPolicy, FileUploadStatus, AIModelType
    from app.models.files import File
    from app.models.pipeline import Detection
    from app.models.ai import AIModel
    from app.services.minio_service import minio_service
    from app.config import settings as _settings
    from sqlalchemy import select

    # Validar misión
    result = await db.execute(select(Mission).where(Mission.id == mission_id))
    mission: Mission | None = result.scalar_one_or_none()
    if mission is None:
        raise HTTPException(status_code=404, detail="Misión no encontrada")

    # Decodificar imagen
    try:
        header, _, b64data = body.image_b64.partition(",")
        image_bytes = base64.b64decode(b64data if b64data else body.image_b64)
    except Exception:
        raise HTTPException(status_code=400, detail="Imagen base64 inválida")

    sha256_hash = hashlib.sha256(image_bytes).hexdigest()
    file_id     = uuid.uuid4()
    object_key  = f"missions/{mission_id}/snapshots/manual/{file_id}.jpg"

    # Subir a MinIO
    try:
        minio_service.upload_file(
            bucket=_settings.minio_bucket_snapshots,
            object_key=object_key,
            data=image_bytes,
            mime_type="image/jpeg",
            sha256_hash=sha256_hash,
            size_bytes=len(image_bytes),
        )
    except Exception:
        logger.error("Error al subir snapshot manual a MinIO", exc_info=True)
        raise HTTPException(status_code=500, detail="Error al guardar el snapshot")

    snapshot_url = minio_service.build_public_url(_settings.minio_bucket_snapshots, object_key)

    # Registrar en tabla files
    file_record = File(
        id=file_id,
        bucket=_settings.minio_bucket_snapshots,
        object_key=object_key,
        sha256_hash=sha256_hash,
        size_bytes=len(image_bytes),
        mime_type="image/jpeg",
        upload_status=FileUploadStatus.uploaded,
        retention_policy=FileRetentionPolicy.permanent,
        uploaded_by=current_user.id,
    )
    db.add(file_record)
    await db.flush()

    # Resolver IDs de modelos activos
    det_result = await db.execute(
        select(AIModel.id).where(AIModel.model_type == AIModelType.object_detection, AIModel.is_active.is_(True)).limit(1)
    )
    rec_result = await db.execute(
        select(AIModel.id).where(AIModel.model_type == AIModelType.face_recognition, AIModel.is_active.is_(True)).limit(1)
    )
    detection_model_id   = det_result.scalar_one_or_none()
    recognition_model_id = rec_result.scalar_one_or_none()

    if detection_model_id is None or recognition_model_id is None:
        raise HTTPException(status_code=500, detail="Modelos IA no configurados")

    # Extraer datos de la primera detección si existe
    drone_id_parsed = uuid.UUID(body.drone_id)
    first_det = body.detections[0] if body.detections else {}
    bbox       = first_det.get("bbox", {})
    yolo_conf  = float(first_det.get("confidence", 0.0))
    face_sim   = float(first_det.get("similarity", 0.0))

    detection_id = uuid.uuid4()
    detection = Detection(
        id=detection_id,
        mission_id=mission_id,
        drone_id=drone_id_parsed,
        missing_person_id=mission.missing_person_id,
        detection_model_id=detection_model_id,
        recognition_model_id=recognition_model_id,
        frame_timestamp=datetime.now(timezone.utc),
        yolo_confidence=yolo_conf if yolo_conf > 0 else 0.01,
        facenet_similarity=face_sim,
        bounding_box=bbox,
        snapshot_file_id=file_id,
    )
    db.add(detection)
    await db.flush()

    # Broadcast WS a la sala de la misión
    from app.core.ws_manager import ws_manager
    await ws_manager.broadcast(f"mission:{mission_id}", {
        "type": "detection",
        "detection_id": str(detection_id),
        "mission_id": str(mission_id),
        "drone_id": body.drone_id,
        "detection_type": first_det.get("detection_type", "manual_snapshot"),
        "yolo_confidence": yolo_conf,
        "similarity_score": face_sim,
        "bbox": bbox,
        "snapshot_url": snapshot_url,
        "frame_timestamp": datetime.now(timezone.utc).isoformat(),
    })

    return ManualSnapshotResponse(
        detection_id=str(detection_id),
        snapshot_url=snapshot_url,
    )


# ── Resumen de misión completada ──────────────────────────────────────────────

class MissionSummaryResponse(BaseModel):
    mission_id: uuid.UUID
    mission_name: str
    status: str
    missing_person_id: Optional[uuid.UUID]
    person_full_name: Optional[str]
    person_status: Optional[str]
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    duration_minutes: Optional[int]
    total_detections: int
    face_matches: int
    confirmed_alerts: int
    dismissed_alerts: int
    drones_used: int


@router.get("/{mission_id}/summary", response_model=MissionSummaryResponse)
async def get_mission_summary(
    mission_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MissionSummaryResponse:
    """Estadísticas de cierre de una misión (cualquier estado)."""
    from app.models.enums import AlertStatus
    from app.models.persons import MissingPerson
    from app.models.pipeline import Alert, Detection

    try:
        result = await db.execute(select(Mission).where(Mission.id == mission_id))
        mission: Mission | None = result.scalar_one_or_none()
    except Exception:
        logger.error("Error al buscar misión id=%s", mission_id, exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

    if mission is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Misión no encontrada")

    # Nombre y estado de la persona
    person_name: Optional[str] = None
    person_status: Optional[str] = None
    try:
        pr = await db.execute(
            select(MissingPerson.full_name, MissingPerson.status)
            .where(MissingPerson.id == mission.missing_person_id)
        )
        row = pr.first()
        if row:
            person_name = row[0]
            person_status = row[1].value if hasattr(row[1], "value") else str(row[1])
    except Exception:
        pass

    # Conteos
    total_det = (await db.execute(
        select(func.count()).select_from(Detection).where(Detection.mission_id == mission_id)
    )).scalar_one()

    face_matches = (await db.execute(
        select(func.count()).select_from(Detection).where(
            Detection.mission_id == mission_id,
            Detection.facenet_similarity >= 0.55,
        )
    )).scalar_one()

    confirmed = (await db.execute(
        select(func.count()).select_from(Alert).where(
            Alert.status == AlertStatus.confirmed,
            Alert.detection_id.in_(
                select(Detection.id).where(Detection.mission_id == mission_id)
            ),
        )
    )).scalar_one()

    dismissed = (await db.execute(
        select(func.count()).select_from(Alert).where(
            Alert.status == AlertStatus.dismissed,
            Alert.detection_id.in_(
                select(Detection.id).where(Detection.mission_id == mission_id)
            ),
        )
    )).scalar_one()

    drones = (await db.execute(
        select(func.count(func.distinct(MissionDrone.drone_id))).where(
            MissionDrone.mission_id == mission_id
        )
    )).scalar_one()

    duration: Optional[int] = None
    if mission.started_at and mission.completed_at:
        delta = mission.completed_at - mission.started_at
        duration = int(delta.total_seconds() / 60)

    return MissionSummaryResponse(
        mission_id=mission.id,
        mission_name=mission.name,
        status=mission.status.value if hasattr(mission.status, "value") else str(mission.status),
        missing_person_id=mission.missing_person_id,
        person_full_name=person_name,
        person_status=person_status,
        started_at=mission.started_at,
        completed_at=mission.completed_at,
        duration_minutes=duration,
        total_detections=total_det,
        face_matches=face_matches,
        confirmed_alerts=confirmed,
        dismissed_alerts=dismissed,
        drones_used=drones,
    )

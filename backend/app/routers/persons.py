# =============================================================================
# AEROFINDER Backend — Router: Personas Desaparecidas
#
# Permisos:
#   - familiar (opcional, cuenta creada desde formulario público):
#       lee solo su/s persona/s vinculada/s y las misiones asociadas
#   - ayudante: ve todos los estados y aprueba casos pending_review
#   - buscador/admin: CRUD completo
#   - anónimo: usa POST /public/rescue-requests (router aparte)
#
# RLS en DB filtra filas según rol; se añade filtro a nivel app para familiar.
# =============================================================================

import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import CurrentUser, get_current_user, require_role
from app.db.session import get_db
from app.models.enums import MissingPersonStatus, RoleName
from app.models.persons import MissingPerson, PersonPhoto, PersonRelative
from app.schemas.persons import (
    PersonCreate,
    PersonResponse,
    PersonUpdate,
    PhotoResponse,
    RelativeCreate,
    RelativeResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/persons", tags=["personas"])

_staff     = require_role(RoleName.admin, RoleName.buscador)
_approvers = require_role(RoleName.admin, RoleName.ayudante)


@router.get("/", response_model=list[PersonResponse])
async def list_persons(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=20, le=100),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[PersonResponse]:
    """
    Lista personas desaparecidas.
    - familiar: solo sus personas vinculadas (filtro app + RLS).
    - ayudante: todas, incluidas las pending_review.
    - admin/buscador: todas.
    """
    try:
        if current_user.role == RoleName.familiar:
            result = await db.execute(
                select(MissingPerson)
                .join(PersonRelative, MissingPerson.id == PersonRelative.missing_person_id)
                .where(PersonRelative.user_id == current_user.id)
                .offset(skip)
                .limit(limit)
            )
        else:
            result = await db.execute(select(MissingPerson).offset(skip).limit(limit))
        persons = result.scalars().all()
    except Exception:
        logger.error("Error al listar personas", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

    return [PersonResponse.model_validate(p) for p in persons]


@router.post("/", response_model=PersonResponse, status_code=status.HTTP_201_CREATED)
async def create_person(
    body: PersonCreate,
    current_user: CurrentUser = Depends(_staff),
    db: AsyncSession = Depends(get_db),
) -> PersonResponse:
    """
    Registra una persona desaparecida directamente (sin revisión).
    Solo admin o buscador. El caso arranca en active.
    Para solicitudes de familias sin cuenta → POST /public/rescue-requests.
    """
    try:
        person = MissingPerson(
            full_name=body.full_name,
            disappeared_at=body.disappeared_at,
            date_of_birth=body.date_of_birth,
            age_at_disappearance=body.age_at_disappearance,
            gender=body.gender,
            physical_description=body.physical_description,
            last_known_location=body.last_known_location,
            last_seen_at=body.last_seen_at,
            status=MissingPersonStatus.active,
            reported_by_user_id=current_user.id,
            reporter_name=body.reporter_name,
            reporter_contact=body.reporter_contact,
        )
        db.add(person)
        await db.flush()
    except Exception:
        logger.error("Error al crear persona", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

    return PersonResponse.model_validate(person)


@router.get("/{person_id}", response_model=PersonResponse)
async def get_person(
    person_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PersonResponse:
    """
    Obtiene detalle de una persona.
    RLS bloquea el acceso de familiar a personas que no son las suyas.
    """
    try:
        result = await db.execute(
            select(MissingPerson).where(MissingPerson.id == person_id)
        )
        person: MissingPerson | None = result.scalar_one_or_none()
    except Exception:
        logger.error("Error al obtener persona id=%s", person_id, exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

    if person is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Persona no encontrada")

    return PersonResponse.model_validate(person)


@router.post("/{person_id}/approve", response_model=PersonResponse)
async def approve_person(
    person_id: uuid.UUID,
    current_user: CurrentUser = Depends(_approvers),
    db: AsyncSession = Depends(get_db),
) -> PersonResponse:
    """
    Aprueba una solicitud pública (pending_review → active).
    Solo admin o ayudante. Activa el caso en el pipeline de IA.
    """
    try:
        result = await db.execute(
            select(MissingPerson).where(MissingPerson.id == person_id)
        )
        person: MissingPerson | None = result.scalar_one_or_none()
    except Exception:
        logger.error("Error al buscar persona id=%s para aprobar", person_id, exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

    if person is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Persona no encontrada")

    if person.status != MissingPersonStatus.pending_review:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"El caso no está en pending_review (estado actual: {person.status})",
        )

    person.status = MissingPersonStatus.active
    return PersonResponse.model_validate(person)


@router.patch("/{person_id}", response_model=PersonResponse)
async def update_person(
    person_id: uuid.UUID,
    body: PersonUpdate,
    current_user: CurrentUser = Depends(_staff),
    db: AsyncSession = Depends(get_db),
) -> PersonResponse:
    """Actualiza datos o estado de una persona. Solo admin o buscador."""
    try:
        result = await db.execute(
            select(MissingPerson).where(MissingPerson.id == person_id)
        )
        person: MissingPerson | None = result.scalar_one_or_none()
    except Exception:
        logger.error("Error al buscar persona id=%s", person_id, exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

    if person is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Persona no encontrada")

    update_fields = body.model_dump(exclude_none=True)
    for field, value in update_fields.items():
        setattr(person, field, value)

    return PersonResponse.model_validate(person)


# ── Fotos ─────────────────────────────────────────────────────────────────────

@router.get("/{person_id}/photos", response_model=list[PhotoResponse])
async def list_person_photos(
    person_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[PhotoResponse]:
    """Lista fotos activas de la persona. Todos los roles autenticados."""
    try:
        person_result = await db.execute(
            select(MissingPerson.id).where(MissingPerson.id == person_id)
        )
        if person_result.scalar_one_or_none() is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Persona no encontrada")
    except HTTPException:
        raise
    except Exception:
        logger.error("Error al verificar persona id=%s", person_id, exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

    try:
        result = await db.execute(
            select(PersonPhoto)
            .where(
                PersonPhoto.missing_person_id == person_id,
                PersonPhoto.is_active.is_(True),
            )
        )
        photos = result.scalars().all()
    except Exception:
        logger.error("Error al listar fotos persona_id=%s", person_id, exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

    return [PhotoResponse.model_validate(p) for p in photos]


# ── Familiares ────────────────────────────────────────────────────────────────

@router.get("/{person_id}/relatives", response_model=list[RelativeResponse])
async def list_relatives(
    person_id: uuid.UUID,
    current_user: CurrentUser = Depends(_staff),
    db: AsyncSession = Depends(get_db),
) -> list[RelativeResponse]:
    """Lista familiares vinculados a una persona. Admin o buscador."""
    try:
        result = await db.execute(
            select(PersonRelative).where(PersonRelative.missing_person_id == person_id)
        )
        relatives = result.scalars().all()
    except Exception:
        logger.error("Error al listar familiares persona_id=%s", person_id, exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

    return [RelativeResponse.model_validate(r) for r in relatives]


@router.post(
    "/{person_id}/relatives",
    response_model=RelativeResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_relative(
    person_id: uuid.UUID,
    body: RelativeCreate,
    current_user: CurrentUser = Depends(_staff),
    db: AsyncSession = Depends(get_db),
) -> RelativeResponse:
    """Vincula un usuario (familiar) a una persona. Admin o buscador."""
    try:
        existing = await db.execute(
            select(PersonRelative).where(
                PersonRelative.missing_person_id == person_id,
                PersonRelative.user_id == body.user_id,
            )
        )
        if existing.scalar_one_or_none() is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Familiar ya vinculado")
    except HTTPException:
        raise
    except Exception:
        logger.error("Error al verificar vínculo familiar", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

    try:
        relative = PersonRelative(
            user_id=body.user_id,
            missing_person_id=person_id,
            relation=body.relation,
        )
        db.add(relative)
        await db.flush()
    except Exception:
        logger.error("Error al crear vínculo familiar", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

    return RelativeResponse.model_validate(relative)


@router.delete("/{person_id}/relatives/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_relative(
    person_id: uuid.UUID,
    user_id: uuid.UUID,
    current_user: CurrentUser = Depends(_staff),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Desvincula un familiar de una persona. Admin o buscador."""
    try:
        result = await db.execute(
            select(PersonRelative).where(
                PersonRelative.missing_person_id == person_id,
                PersonRelative.user_id == user_id,
            )
        )
        relative: PersonRelative | None = result.scalar_one_or_none()
    except Exception:
        logger.error("Error al buscar vínculo familiar", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

    if relative is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vínculo no encontrado")

    try:
        await db.delete(relative)
    except Exception:
        logger.error("Error al eliminar vínculo familiar", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

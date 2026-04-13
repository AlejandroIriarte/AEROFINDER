# =============================================================================
# AEROFINDER Backend — Router: Endpoints públicos (sin autenticación)
#
# POST /public/rescue-requests
#   Formulario para que familiares soliciten la búsqueda de un desaparecido.
#   No requiere cuenta. Crea un caso en pending_review que un admin o ayudante
#   debe aprobar antes de que entre al pipeline de misiones.
#   Opcionalmente crea cuenta de familiar para hacer seguimiento del caso.
# =============================================================================

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.db.session import get_db
from app.models.auth import Role, User
from app.models.enums import MissingPersonStatus, RoleName
from app.models.persons import MissingPerson, PersonRelative
from app.schemas.public import RescueRequestCreate, RescueRequestResponse

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/public", tags=["público"])


@router.post(
    "/rescue-requests",
    response_model=RescueRequestResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Solicitar búsqueda de persona desaparecida",
    description=(
        "Endpoint sin autenticación para que familiares reporten un desaparecido. "
        "El caso queda en pending_review hasta que un admin o ayudante lo apruebe. "
        "Si se proveen account_email y account_password se crea una cuenta familiar "
        "para hacer seguimiento del caso."
    ),
)
async def create_rescue_request(
    body: RescueRequestCreate,
    db: AsyncSession = Depends(get_db),
) -> RescueRequestResponse:
    """
    Flujo:
    1. Crear MissingPerson con status=pending_review.
    2. Si se proporcionan credenciales → crear usuario con rol familiar y
       vincular automáticamente como PersonRelative.
    3. Si no hay credenciales → guardar reporter_name/contact en la persona.
    """
    # ── 1. Crear la persona desaparecida en pending_review ────────────────────
    try:
        person = MissingPerson(
            full_name=body.full_name,
            disappeared_at=body.disappeared_at,
            date_of_birth=body.date_of_birth,
            age_at_disappearance=body.age_at_disappearance,
            gender=body.gender,
            physical_description=body.physical_description,
            height_cm=body.height_cm,
            last_known_clothing=body.last_known_clothing,
            last_known_location=body.last_known_location,
            last_seen_at=body.last_seen_at,
            status=MissingPersonStatus.pending_review,
            source="public_form",
            reporter_name=body.reporter_name,
            reporter_contact=body.reporter_contact,
        )
        db.add(person)
        await db.flush()  # obtener person.id antes de seguir
    except Exception:
        logger.error("Error al crear solicitud de rescate", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

    account_created = False

    # ── 2. Crear cuenta familiar si se proporcionaron credenciales ────────────
    if body.account_email and body.account_password:
        # Verificar que el email no esté en uso
        try:
            existing_user = await db.execute(
                select(User).where(User.email == body.account_email)
            )
            if existing_user.scalar_one_or_none() is not None:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="El correo ya está registrado. Inicia sesión para vincular el caso.",
                )
        except HTTPException:
            raise
        except Exception:
            logger.error("Error al verificar email para cuenta familiar", exc_info=True)
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

        # Obtener el role_id del rol familiar
        try:
            role_result = await db.execute(
                select(Role).where(Role.name == RoleName.familiar)
            )
            familiar_role: Role | None = role_result.scalar_one_or_none()
            if familiar_role is None:
                logger.error("Rol familiar no encontrado en la tabla roles")
                raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")
        except HTTPException:
            raise
        except Exception:
            logger.error("Error al buscar rol familiar", exc_info=True)
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

        try:
            new_user = User(
                email=body.account_email,
                password_hash=hash_password(body.account_password),
                full_name=body.account_full_name or body.reporter_name,
                role_id=familiar_role.id,
            )
            db.add(new_user)
            await db.flush()

            # Vincular el usuario recién creado con la persona
            relative = PersonRelative(
                user_id=new_user.id,
                missing_person_id=person.id,
                relation=body.relation,
                verified=False,
            )
            db.add(relative)
            await db.flush()

            # Registrar el usuario como reportante del caso
            person.reported_by_user_id = new_user.id
            account_created = True
        except Exception:
            logger.error("Error al crear cuenta familiar para rescue request", exc_info=True)
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

    return RescueRequestResponse(
        person_id=person.id,
        status=person.status,
        account_created=account_created,
        message=(
            "Solicitud recibida. Un operador revisará el caso pronto. "
            + ("Puedes iniciar sesión para hacer seguimiento." if account_created else
               "Para hacer seguimiento, regístrate con el mismo correo.")
        ),
    )

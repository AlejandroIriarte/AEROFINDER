# =============================================================================
# AEROFINDER Backend — Router: Usuarios
# Solo accesible por rol admin
# Endpoints: GET/POST /users, GET/PATCH/DELETE /users/{id}
# =============================================================================

import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import CurrentUser, require_role
from app.core.security import hash_password
from app.db.session import get_db
from app.models.auth import Role, User
from app.models.enums import RoleName
from app.schemas.users import UserCreate, UserResponse, UserUpdate

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/users", tags=["usuarios"])

_admin = require_role(RoleName.admin)


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


@router.get("/", response_model=list[UserResponse])
async def list_users(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=20, le=100),
    _: CurrentUser = Depends(_admin),
    db: AsyncSession = Depends(get_db),
) -> list[UserResponse]:
    """Lista todos los usuarios del sistema. Solo admin."""
    try:
        result = await db.execute(
            select(User, Role)
            .join(Role, User.role_id == Role.id)
            .offset(skip)
            .limit(limit)
        )
        rows = result.all()
    except Exception:
        logger.error("Error al listar usuarios", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

    return [_build_user_response(u, r.name) for u, r in rows]


@router.post("/", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    body: UserCreate,
    current_user: CurrentUser = Depends(_admin),
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    """Crea un nuevo usuario. Solo admin."""
    # Verificar que el role_id existe
    try:
        role_result = await db.execute(select(Role).where(Role.id == body.role_id))
        role: Role | None = role_result.scalar_one_or_none()
    except Exception:
        logger.error("Error al verificar role_id=%s", body.role_id, exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

    if role is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rol no encontrado")

    # Verificar email único
    try:
        existing = await db.execute(select(User).where(User.email == body.email))
        if existing.scalar_one_or_none() is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email ya registrado")
    except HTTPException:
        raise
    except Exception:
        logger.error("Error al verificar email=%s", body.email, exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

    try:
        new_user = User(
            email=body.email,
            password_hash=hash_password(body.password),
            full_name=body.full_name,
            phone=body.phone,
            role_id=body.role_id,
        )
        db.add(new_user)
        await db.flush()  # Obtener el id generado por PostgreSQL
    except Exception:
        logger.error("Error al crear usuario email=%s", body.email, exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

    return _build_user_response(new_user, role.name)


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: uuid.UUID,
    current_user: CurrentUser = Depends(_admin),
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    """Obtiene un usuario por ID. Solo admin."""
    try:
        result = await db.execute(
            select(User, Role)
            .join(Role, User.role_id == Role.id)
            .where(User.id == user_id)
        )
        row = result.first()
    except Exception:
        logger.error("Error al obtener usuario id=%s", user_id, exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")

    return _build_user_response(row[0], row[1].name)


@router.patch("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: uuid.UUID,
    body: UserUpdate,
    current_user: CurrentUser = Depends(_admin),
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    """Actualiza un usuario. Solo admin."""
    try:
        result = await db.execute(
            select(User, Role)
            .join(Role, User.role_id == Role.id)
            .where(User.id == user_id)
        )
        row = result.first()
    except Exception:
        logger.error("Error al buscar usuario id=%s", user_id, exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")

    user, current_role = row

    # Aplicar solo los campos presentes en el body
    if body.full_name is not None:
        user.full_name = body.full_name
    if body.phone is not None:
        user.phone = body.phone
    if body.is_active is not None:
        user.is_active = body.is_active
    if body.role_id is not None:
        # Verificar que el nuevo rol existe
        try:
            new_role_result = await db.execute(select(Role).where(Role.id == body.role_id))
            new_role: Role | None = new_role_result.scalar_one_or_none()
        except Exception:
            logger.error("Error al verificar nuevo role_id=%s", body.role_id, exc_info=True)
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

        if new_role is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rol no encontrado")
        user.role_id = body.role_id
        current_role = new_role

    return _build_user_response(user, current_role.name)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def deactivate_user(
    user_id: uuid.UUID,
    current_user: CurrentUser = Depends(_admin),
    db: AsyncSession = Depends(get_db),
) -> None:
    """
    Desactiva un usuario (soft delete: is_active=False).
    No elimina el registro para preservar integridad referencial y auditoría.
    """
    if user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No puedes desactivar tu propia cuenta",
        )

    try:
        result = await db.execute(select(User).where(User.id == user_id))
        user: User | None = result.scalar_one_or_none()
    except Exception:
        logger.error("Error al buscar usuario id=%s", user_id, exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")

    user.is_active = False

# =============================================================================
# AEROFINDER Backend — Dependencias FastAPI: autenticación y RBAC
# =============================================================================

import logging
import uuid
from collections.abc import Callable

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_access_token
from app.db.session import get_db, set_db_session_context
from app.models.auth import User, UserSession
from app.models.enums import RoleName

logger = logging.getLogger(__name__)

_bearer = HTTPBearer(auto_error=True)


class CurrentUser(BaseModel):
    """
    Usuario autenticado disponible en cada endpoint.
    Construida a partir del JWT + validación en DB.
    role y session_id se usan para RLS y auditoría respectivamente.
    """
    id: uuid.UUID
    email: str
    full_name: str
    role: RoleName
    session_id: uuid.UUID  # PK de user_sessions (para audit_log)
    jti: uuid.UUID          # para revocación en logout


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
    db: AsyncSession = Depends(get_db),
) -> CurrentUser:
    """
    1. Decodifica JWT → extrae user_id, jti, role.
    2. Fija GUCs (SET LOCAL) ANTES de consultar tablas con RLS.
    3. Valida en DB que la sesión esté activa y el usuario activo.

    Lanza 401 en cualquier fallo; nunca expone el motivo exacto.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="No autenticado",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_access_token(credentials.credentials)
        user_id_str: str | None = payload.get("sub")
        jti_str: str | None = payload.get("jti")
        role_str: str | None = payload.get("role")
        if not user_id_str or not jti_str or not role_str:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    except HTTPException:
        raise
    except Exception:
        logger.error("Error al procesar JWT", exc_info=True)
        raise credentials_exception

    try:
        user_id = uuid.UUID(user_id_str)
        jti = uuid.UUID(jti_str)
        role = RoleName(role_str)
    except ValueError:
        raise credentials_exception

    # ── Fijar GUCs antes de cualquier consulta con RLS ────────────────────────
    # Usamos un UUID temporal; se actualizará con el session_id real tras la consulta.
    # El rol ya es conocido desde el JWT.
    try:
        await set_db_session_context(db, user_id, role_str)
    except Exception:
        logger.error("Error al fijar contexto de sesión", exc_info=True)
        raise credentials_exception

    # ── Validar sesión activa + usuario activo (un solo round-trip) ───────────
    try:
        result = await db.execute(
            select(UserSession, User)
            .join(User, UserSession.user_id == User.id)
            .where(
                UserSession.jti == jti,
                UserSession.is_revoked.is_(False),
                User.id == user_id,
                User.is_active.is_(True),
            )
        )
        row = result.first()
    except Exception:
        logger.error("Error al validar sesión en DB", exc_info=True)
        raise credentials_exception

    if row is None:
        raise credentials_exception

    session_orm: UserSession = row[0]
    user_orm: User = row[1]

    # ── Actualizar GUC con session_id real para auditoría ─────────────────────
    try:
        await set_db_session_context(db, user_id, role_str, session_orm.id)
    except Exception:
        logger.error("Error al actualizar session_id en GUC", exc_info=True)
        raise credentials_exception

    return CurrentUser(
        id=user_orm.id,
        email=user_orm.email,
        full_name=user_orm.full_name,
        role=role,
        session_id=session_orm.id,
        jti=session_orm.jti,
    )


def require_role(*roles: RoleName) -> Callable:
    """
    Fábrica de dependencias para RBAC.

    Uso como dependencia en decorator:
        @router.get("/ruta", dependencies=[Depends(require_role(RoleName.admin))])

    Uso como parámetro tipado (también da acceso al CurrentUser):
        async def endpoint(user: CurrentUser = Depends(require_role(RoleName.admin)))
    """
    async def _check(
        current_user: CurrentUser = Depends(get_current_user),
    ) -> CurrentUser:
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Permiso insuficiente",
            )
        return current_user
    return _check

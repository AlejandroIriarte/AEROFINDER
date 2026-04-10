# =============================================================================
# AEROFINDER Backend — Router: Autenticación
# Endpoints: POST /auth/login, POST /auth/logout, GET /auth/me
# =============================================================================

import logging
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.deps import CurrentUser, get_current_user
from app.core.security import create_access_token, create_refresh_token, decode_access_token, verify_password
from app.db.session import AsyncSessionLocal, get_db, set_db_session_context
from app.models.auth import LoginAttempt, Role, User, UserSession
from app.schemas.auth import LoginRequest, RefreshTokenRequest, TokenResponse, UserMeResponse

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])


def _get_client_ip(request: Request) -> str:
    """
    Extrae la IP real del cliente.
    X-Forwarded-For se usa cuando hay un reverse-proxy (nginx, traefik).
    """
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "0.0.0.0"


async def _record_login_attempt(
    user_id: uuid.UUID | None,
    email: str,
    ip: str,
    user_agent: str | None,
    success: bool,
    failure_reason: str | None = None,
) -> None:
    """
    Registra el intento de login en una sesión INDEPENDIENTE que hace commit
    inmediatamente. Esto garantiza que el registro persiste incluso si la
    transacción principal del request falla o hace rollback (ej: credenciales
    incorrectas → 401, conexión cerrada, etc.).

    NOTA: rate-limiting por IP se implementará en BE-5 usando Redis Streams,
    donde el volumen y la latencia son más adecuados que consultar login_attempts
    bajo RLS sin usuario autenticado.
    """
    async with AsyncSessionLocal() as log_session:
        try:
            async with log_session.begin():
                log_session.add(LoginAttempt(
                    user_id=user_id,
                    email_attempted=email,
                    ip_address=ip,
                    user_agent=user_agent,
                    success=success,
                    failure_reason=failure_reason,
                ))
        except Exception:
            logger.error(
                "Error al registrar LoginAttempt email=%s ip=%s", email, ip,
                exc_info=True,
            )


@router.post("/login", response_model=TokenResponse, status_code=status.HTTP_200_OK)
async def login(
    body: LoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """
    Autentica un usuario y emite un JWT.
    - Busca usuario por email y verifica contraseña.
    - Crea registro en user_sessions con el jti del JWT.
    - Registra el intento (éxito o fallo) en una sesión DB independiente.
    - Fija SET LOCAL GUCs antes de toda escritura (cumplimiento RLS + auditoría).
    """
    ip = _get_client_ip(request)
    user_agent = request.headers.get("User-Agent")
    auth_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Credenciales incorrectas",
    )

    # ── Buscar usuario (tabla users sin RLS) ──────────────────────────────────
    try:
        result = await db.execute(
            select(User).where(User.email == body.email)
        )
        user: User | None = result.scalar_one_or_none()
    except Exception:
        logger.error("Error al buscar usuario email=%s", body.email, exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

    # ── Verificar contraseña (siempre verificar para evitar timing attacks) ───
    password_ok = (
        verify_password(body.password, user.password_hash)
        if user is not None
        else False
    )

    if not password_ok or user is None:
        await _record_login_attempt(
            user_id=user.id if user else None,
            email=body.email,
            ip=ip,
            user_agent=user_agent,
            success=False,
            failure_reason="credenciales incorrectas" if user else "usuario no encontrado",
        )
        raise auth_error

    if not user.is_active:
        await _record_login_attempt(
            user_id=user.id,
            email=body.email,
            ip=ip,
            user_agent=user_agent,
            success=False,
            failure_reason="cuenta desactivada",
        )
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cuenta desactivada")

    # ── Cargar nombre del rol para el JWT ─────────────────────────────────────
    try:
        role_result = await db.execute(select(Role).where(Role.id == user.role_id))
        role: Role | None = role_result.scalar_one_or_none()
    except Exception:
        logger.error("Error al cargar rol user_id=%s", user.id, exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

    if role is None:
        logger.error("Rol no encontrado para user_id=%s role_id=%s", user.id, user.role_id)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

    # ── Fijar GUCs antes de las escrituras (RLS + auditoría) ─────────────────
    try:
        await set_db_session_context(db, user.id, role.name.value)
    except Exception:
        logger.error("Error al fijar contexto DB user_id=%s", user.id, exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

    # ── Crear sesión y JWT ────────────────────────────────────────────────────
    jti = uuid.uuid4()
    expires_delta = timedelta(minutes=settings.access_token_expire_minutes)
    expires_at = datetime.now(timezone.utc) + expires_delta

    try:
        new_session = UserSession(
            user_id=user.id,
            jti=jti,
            ip_address=ip,
            user_agent=user_agent,
            expires_at=expires_at,
        )
        db.add(new_session)
        user.last_login_at = datetime.now(timezone.utc)
        # El commit lo hace get_db al final del request
    except Exception:
        logger.error("Error al preparar sesión user_id=%s", user.id, exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

    # Registro del intento exitoso (sesión independiente, persiste siempre)
    await _record_login_attempt(
        user_id=user.id,
        email=body.email,
        ip=ip,
        user_agent=user_agent,
        success=True,
    )

    access_token = create_access_token(
        user_id=user.id,
        jti=jti,
        role=role.name.value,
        expires_delta=expires_delta,
    )
    refresh_token = create_refresh_token(
        user_id=user.id,
        jti=jti,
    )

    return TokenResponse(
        access_token=access_token,
        expires_in=int(expires_delta.total_seconds()),
        refresh_token=refresh_token,
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """
    Revoca la sesión actual. El JWT queda inválido aunque no haya expirado.
    Es idempotente: no falla si la sesión ya estaba revocada.
    Los GUCs ya están fijados por get_current_user.
    """
    try:
        result = await db.execute(
            select(UserSession).where(UserSession.jti == current_user.jti)
        )
        session_orm: UserSession | None = result.scalar_one_or_none()
    except Exception:
        logger.error("Error al buscar sesión jti=%s", current_user.jti, exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

    if session_orm is None or session_orm.is_revoked:
        return  # Idempotente

    try:
        session_orm.is_revoked = True
        session_orm.revoked_at = datetime.now(timezone.utc)
        # El commit lo hace get_db al final del request
    except Exception:
        logger.error("Error al revocar sesión id=%s", session_orm.id, exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")


@router.post("/refresh", response_model=TokenResponse, status_code=status.HTTP_200_OK)
async def refresh_token_endpoint(
    body: RefreshTokenRequest,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """
    Emite un nuevo access token a partir de un refresh token válido.
    - Decodifica el JWT de refresco y verifica que su tipo sea "refresh".
    - Verifica que la sesión (jti) siga activa en la DB y no esté revocada.
    - El access token anterior queda reemplazado; el refresh token no cambia.
    Lanza 401 en cualquier fallo de validación.
    """
    invalid_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Refresh token inválido o expirado",
    )

    # ── Decodificar y validar el refresh token ────────────────────────────────
    try:
        payload = decode_access_token(body.refresh_token)
    except Exception:
        raise invalid_exc

    token_type = payload.get("type")
    if token_type != "refresh":
        raise invalid_exc

    try:
        user_id = uuid.UUID(payload["sub"])
        jti     = uuid.UUID(payload["jti"])
    except (KeyError, ValueError):
        raise invalid_exc

    # ── Verificar sesión activa en DB ─────────────────────────────────────────
    try:
        await set_db_session_context(db, user_id, "system")
        result = await db.execute(
            select(UserSession, User)
            .join(User, UserSession.user_id == User.id)
            .where(
                UserSession.jti     == jti,
                UserSession.is_revoked.is_(False),
                User.id             == user_id,
                User.is_active.is_(True),
            )
        )
        row = result.first()
    except Exception:
        logger.error("Error al validar sesión en refresh user_id=%s", user_id, exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

    if row is None:
        raise invalid_exc

    session_orm: UserSession = row[0]
    user_orm:    User        = row[1]

    # ── Cargar rol del usuario ─────────────────────────────────────────────────
    try:
        role_result = await db.execute(select(Role).where(Role.id == user_orm.role_id))
        role: Role | None = role_result.scalar_one_or_none()
    except Exception:
        logger.error("Error al cargar rol en refresh user_id=%s", user_id, exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

    if role is None:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

    # ── Emitir nuevo access token (mismo jti, sesión no cambia) ───────────────
    expires_delta = timedelta(minutes=settings.access_token_expire_minutes)
    new_access_token = create_access_token(
        user_id=user_orm.id,
        jti=session_orm.jti,
        role=role.name.value,
        expires_delta=expires_delta,
    )

    logger.info("Access token renovado para user_id=%s", user_id)

    return TokenResponse(
        access_token=new_access_token,
        expires_in=int(expires_delta.total_seconds()),
        # No retornar refresh_token en la respuesta de /refresh (cliente reutiliza el mismo)
    )


@router.get("/me", response_model=UserMeResponse)
async def me(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserMeResponse:
    """
    Devuelve datos frescos del usuario autenticado.
    Los GUCs ya están fijados por get_current_user.
    """
    try:
        result = await db.execute(select(User).where(User.id == current_user.id))
        user: User | None = result.scalar_one_or_none()
    except Exception:
        logger.error("Error al obtener usuario id=%s", current_user.id, exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")

    return UserMeResponse(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=current_user.role,
        is_active=user.is_active,
    )

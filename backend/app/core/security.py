# =============================================================================
# AEROFINDER Backend — Utilidades de seguridad: hashing y JWT
# =============================================================================

import logging
import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
from jose import JWTError, jwt

from app.config import settings

logger = logging.getLogger(__name__)


def hash_password(plain: str) -> str:
    """Genera el hash bcrypt de una contraseña en texto plano."""
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    """Verifica que plain coincide con el hash almacenado."""
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        logger.error("Error al verificar contraseña", exc_info=True)
        return False


# ── JWT ───────────────────────────────────────────────────────────────────────

def create_access_token(
    user_id: uuid.UUID,
    jti: uuid.UUID,
    role: str,
    expires_delta: timedelta | None = None,
) -> str:
    """
    Genera un JWT firmado con HS256.
    Payload:
      sub  — user_id como string
      jti  — ID único de sesión (permite revocación individual)
      role — nombre del rol (evita JOIN en cada request)
      exp  — timestamp de expiración
      iat  — timestamp de emisión
    """
    now = datetime.now(timezone.utc)
    expire = now + (
        expires_delta
        if expires_delta is not None
        else timedelta(minutes=settings.access_token_expire_minutes)
    )
    payload = {
        "sub": str(user_id),
        "jti": str(jti),
        "role": role,
        "iat": now,
        "exp": expire,
    }
    try:
        return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)
    except Exception:
        logger.error("Error al generar JWT", exc_info=True)
        raise


def create_refresh_token(
    user_id: uuid.UUID,
    jti: uuid.UUID,
) -> str:
    """
    Genera un JWT de refresco firmado con HS256.
    Payload:
      sub  — user_id como string
      jti  — mismo ID de sesión que el access token (permite revocación unificada)
      type — literal "refresh" (distingue del access token)
      exp  — 7 días desde emisión
      iat  — timestamp de emisión
    """
    now = datetime.now(timezone.utc)
    expire = now + timedelta(days=7)
    payload = {
        "sub":  str(user_id),
        "jti":  str(jti),
        "type": "refresh",
        "iat":  now,
        "exp":  expire,
    }
    try:
        return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)
    except Exception:
        logger.error("Error al generar refresh token", exc_info=True)
        raise


def decode_access_token(token: str) -> dict:
    """
    Decodifica y valida la firma y expiración del JWT.
    Lanza JWTError si el token es inválido o expiró.
    La validación de revocación se hace en deps.py (requiere DB).
    """
    try:
        return jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
    except JWTError:
        raise
    except Exception:
        logger.error("Error inesperado al decodificar JWT", exc_info=True)
        raise

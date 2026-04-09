# =============================================================================
# AEROFINDER Backend — Motor async y sesión SQLAlchemy 2.0
# Patrón: una transacción por request (transaction-per-request).
# get_db abre la transacción al inicio del request y la cierra (commit/rollback)
# al final. Los GUCs SET LOCAL son válidos durante toda esa transacción.
# =============================================================================

import logging
import uuid
from collections.abc import AsyncGenerator

from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.config import settings

logger = logging.getLogger(__name__)

# ── Motor async ───────────────────────────────────────────────────────────────
engine = create_async_engine(
    settings.database_url,
    echo=settings.environment == "development",
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
)

# ── Fábrica de sesiones async ─────────────────────────────────────────────────
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    Dependencia FastAPI: una sesión + una transacción por request completo.
    - session.begin() inicia la transacción explícita.
    - Al salir del bloque (éxito): commit automático.
    - Al salir con excepción (incluyendo HTTPException): rollback automático.
    Los GUCs fijados con SET LOCAL dentro del request son válidos durante
    toda la transacción, ya que es la misma conexión de principio a fin.
    """
    async with AsyncSessionLocal() as session:
        try:
            async with session.begin():
                yield session
        except Exception:
            # session.begin() ya hace rollback; solo logueamos si es inesperado
            logger.error("Transacción abortada en request", exc_info=True)
            raise


async def get_db_no_transaction() -> AsyncGenerator[AsyncSession, None]:
    """
    Sesión sin transacción automática.
    Usada en contextos donde la transacción se gestiona manualmente,
    por ejemplo en el endpoint de login para registrar intentos en sesiones
    independientes que deben persistir incluso si el request falla.
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise


async def set_db_session_context(
    session: AsyncSession,
    user_id: uuid.UUID,
    role: str,
    session_id: uuid.UUID | None = None,
) -> None:
    """
    Fija los tres GUCs de sesión que usan las políticas RLS y los triggers
    de auditoría. DEBE llamarse dentro de la transacción activa (SET LOCAL).

    GUCs:
      aerofinder.current_user_id      → fn_current_app_user_id()
      aerofinder.current_user_role    → fn_current_app_user_role()
      aerofinder.current_session_id   → correlación en data_access_log
    """
    try:
        # SET LOCAL no soporta parámetros en asyncpg; los valores vienen del
        # sistema de auth (UUID validado y role del enum), no de entrada de usuario
        await session.execute(
            text(f"SET LOCAL aerofinder.current_user_id = '{str(user_id)}'")
        )
        await session.execute(
            text(f"SET LOCAL aerofinder.current_user_role = '{role}'")
        )
        if session_id is not None:
            await session.execute(
                text(f"SET LOCAL aerofinder.current_session_id = '{str(session_id)}'")
            )
    except Exception:
        logger.error(
            "Error al fijar contexto de sesión DB (user=%s role=%s)",
            user_id, role,
            exc_info=True,
        )
        raise


# Alias de compatibilidad con código existente (BE-2)
async def set_db_user_context(session: AsyncSession, user_id: uuid.UUID) -> None:
    """Deprecado: usar set_db_session_context (sin rol ni session_id)."""
    await set_db_session_context(session, user_id, role="")

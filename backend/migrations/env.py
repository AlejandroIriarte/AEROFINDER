# =============================================================================
# AEROFINDER — Alembic env.py
# Configura el motor async (asyncpg) para autogenerate y migraciones online/offline
# =============================================================================

import asyncio
import logging
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

# Importar todos los modelos para que Base.metadata los registre
from app.models import Base  # noqa: F401 — registra metadata de todos los modelos
from app.config import settings

# ── Configuración de logging desde alembic.ini ────────────────────────────────
config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

logger = logging.getLogger("alembic.env")

# ── Metadata objetivo para autogenerate ──────────────────────────────────────
target_metadata = Base.metadata

# ── URL de la DB desde settings (no desde alembic.ini) ───────────────────────
config.set_main_option("sqlalchemy.url", settings.database_url)


def run_migrations_offline() -> None:
    """
    Modo offline: genera SQL sin conectar a la base de datos.
    Útil para revisar el SQL antes de aplicarlo o para entornos sin acceso a la DB.
    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        # Incluir schemas opcionales si se usan
        include_schemas=False,
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        # Comparar tipos de columna para detectar cambios de tipo en autogenerate
        compare_type=True,
        include_schemas=False,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """Modo online con motor async (asyncpg)."""
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    try:
        async with connectable.connect() as connection:
            await connection.run_sync(do_run_migrations)
    except Exception:
        logger.error("Error al ejecutar migraciones", exc_info=True)
        raise
    finally:
        await connectable.dispose()


def run_migrations_online() -> None:
    """Punto de entrada para modo online: ejecuta el loop async."""
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()

"""
Entorno de Alembic para AEROFINDER.
Configura la conexión async con PostgreSQL vía SQLAlchemy 2.0.

Modo de uso:
    alembic upgrade head          — aplica todas las migraciones pendientes
    alembic downgrade -1          — revierte la última migración
    alembic revision --autogenerate -m "descripción"  — genera nueva migración

Variables de entorno requeridas:
    DATABASE_URL — ej: postgresql+asyncpg://user:pass@localhost:5432/aerofinder
"""

import asyncio
from logging.config import fileConfig

from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from alembic import context

# Importar metadata de los modelos SQLAlchemy cuando BE-1 esté implementado
# from app.db.base import Base  # descomentar en BE-1
# target_metadata = Base.metadata
target_metadata = None  # reemplazar en BE-1

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)


def run_migrations_offline() -> None:
    """Genera SQL sin conexión activa a la DB (modo --sql)."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """Ejecuta migraciones con motor async (asyncpg)."""
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()

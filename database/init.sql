-- =============================================================================
-- AEROFINDER — Extensiones PostgreSQL 16
-- Ejecutado automáticamente en el primer arranque del contenedor.
-- El schema real (tablas, ENUMs, índices, RLS) lo aplica Alembic al arrancar
-- el backend (alembic upgrade head en entrypoint.sh).
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgvector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS unaccent;

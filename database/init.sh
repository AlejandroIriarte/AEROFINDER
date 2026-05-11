#!/usr/bin/env bash
# =============================================================================
# AEROFINDER — Roles y permisos iniciales
# Ejecutado automáticamente en el primer arranque del contenedor.
# Las variables de entorno las inyecta docker-compose.
# =============================================================================
set -euo pipefail

# Función para ejecutar SQL como superusuario sobre la DB de la app
pg() {
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" "$@"
}

echo ">>> Creando roles de aplicación..."

pg <<-EOSQL
  -- aerofinder_app: backend FastAPI (DML + DDL para Alembic, RLS activo)
  DO \$\$
  BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'aerofinder_app') THEN
      CREATE ROLE aerofinder_app LOGIN PASSWORD '${POSTGRES_APP_PASSWORD}';
    ELSE
      ALTER ROLE aerofinder_app PASSWORD '${POSTGRES_APP_PASSWORD}';
    END IF;
  END;
  \$\$;

  -- aerofinder_worker: AI worker (SELECT restringido, sin RLS)
  DO \$\$
  BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'aerofinder_worker') THEN
      CREATE ROLE aerofinder_worker LOGIN PASSWORD '${POSTGRES_WORKER_PASSWORD}';
    ELSE
      ALTER ROLE aerofinder_worker PASSWORD '${POSTGRES_WORKER_PASSWORD}';
    END IF;
  END;
  \$\$;

  -- aerofinder_audit: solo lectura para auditoría
  DO \$\$
  BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'aerofinder_audit') THEN
      CREATE ROLE aerofinder_audit LOGIN PASSWORD '${POSTGRES_AUDIT_PASSWORD}';
    ELSE
      ALTER ROLE aerofinder_audit PASSWORD '${POSTGRES_AUDIT_PASSWORD}';
    END IF;
  END;
  \$\$;

  -- Permisos de schema
  GRANT USAGE  ON SCHEMA public TO aerofinder_app, aerofinder_worker, aerofinder_audit;
  GRANT CREATE ON SCHEMA public TO aerofinder_app;

  -- Permisos por defecto para tablas futuras (creadas por Alembic)
  ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO aerofinder_app;

  ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT ON TABLES TO aerofinder_worker;

  ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT ON TABLES TO aerofinder_audit;

  ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO aerofinder_app;

  ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO aerofinder_worker;
EOSQL

echo ">>> Roles y permisos configurados."

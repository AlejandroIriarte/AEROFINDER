#!/usr/bin/env bash
# =============================================================================
# AEROFINDER — Asignación de contraseñas a roles de aplicación
# Las contraseñas vienen de variables de entorno, nunca hardcodeadas
# =============================================================================
set -euo pipefail

echo "Configurando contraseñas de roles de PostgreSQL..."

psql -v ON_ERROR_STOP=1 \
     --username "$POSTGRES_USER" \
     --dbname   "$POSTGRES_DB" << SQL
ALTER ROLE aerofinder_app    WITH PASSWORD '${POSTGRES_APP_PASSWORD}';
ALTER ROLE aerofinder_worker WITH PASSWORD '${POSTGRES_WORKER_PASSWORD}';
ALTER ROLE aerofinder_audit  WITH PASSWORD '${POSTGRES_AUDIT_PASSWORD}';
SQL

echo "Contraseñas configuradas correctamente."

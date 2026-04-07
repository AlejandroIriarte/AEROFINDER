#!/usr/bin/env bash
# =============================================================================
# AEROFINDER — Inicialización del schema en el primer arranque
# Ejecutado automáticamente por el entrypoint de PostgreSQL
# =============================================================================
set -euo pipefail

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " AEROFINDER: aplicando schema inicial"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

SCHEMA_DIR="/schema"
FILES=(
    "01_extensions.sql"
    "02_enums.sql"
    "03_tables.sql"
    "04_indexes.sql"
    "05_triggers.sql"
    "06_security.sql"
    "07_views.sql"
    "08_seeds.sql"
)

for file in "${FILES[@]}"; do
    echo "  → $file"
    psql -v ON_ERROR_STOP=1 \
         --username "$POSTGRES_USER" \
         --dbname   "$POSTGRES_DB" \
         -f "$SCHEMA_DIR/$file"
done

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " Schema aplicado exitosamente."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

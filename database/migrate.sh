#!/usr/bin/env bash
# =============================================================================
# AEROFINDER — Script de migración directa (sin Alembic)
# Uso: ./database/migrate.sh [--reset]
#
# Requiere variables de entorno:
#   POSTGRES_HOST, POSTGRES_PORT, POSTGRES_DB
#   POSTGRES_SUPERUSER, POSTGRES_SUPERUSER_PASSWORD
#
# --reset: elimina y recrea la base de datos (solo desarrollo)
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCHEMA_DIR="$SCRIPT_DIR/schema"

: "${POSTGRES_HOST:=localhost}"
: "${POSTGRES_PORT:=5432}"
: "${POSTGRES_DB:=aerofinder}"
: "${POSTGRES_SUPERUSER:=postgres}"

PSQL="psql -h $POSTGRES_HOST -p $POSTGRES_PORT -U $POSTGRES_SUPERUSER"

# Orden de ejecución estricto
SQL_FILES=(
    "01_extensions.sql"
    "02_enums.sql"
    "03_tables.sql"
    "04_indexes.sql"
    "05_triggers.sql"
    "06_security.sql"
    "07_views.sql"
    "08_seeds.sql"
)

if [[ "${1:-}" == "--reset" ]]; then
    echo "⚠️  Eliminando base de datos '$POSTGRES_DB'..."
    $PSQL -c "DROP DATABASE IF EXISTS $POSTGRES_DB;" postgres
    echo "Creando base de datos '$POSTGRES_DB'..."
    $PSQL -c "CREATE DATABASE $POSTGRES_DB;" postgres
fi

echo "Aplicando schema en $POSTGRES_DB..."
for file in "${SQL_FILES[@]}"; do
    echo "  → $file"
    $PSQL -d "$POSTGRES_DB" -f "$SCHEMA_DIR/$file"
done

echo "Schema aplicado exitosamente."

# =============================================================================
# AEROFINDER — PostgreSQL 16 + PostGIS + pgvector
# Extensiones requeridas:
#   - postgis       : columnas geográficas (search_area, gps_location)
#   - pgvector      : embeddings de rostros (InsightFace buffalo_l, dim=512)
#   - pg_trgm       : búsqueda por similitud de texto en nombres
#   - btree_gist    : índices GiST sobre tipos escalares (rangos de fechas)
#   - unaccent      : búsqueda sin acentos
# =============================================================================

FROM postgis/postgis:16-3.4

# pgvector — vectores para embeddings de reconocimiento facial
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
    postgresql-16-pgvector \
 && rm -rf /var/lib/apt/lists/*

# Scripts de inicialización — ejecutados en orden en el primer arranque:
#   01_extensions.sql : crea extensiones (postgis, pgvector, etc.)
#   02_roles.sh       : crea roles y permisos con passwords de env vars
COPY init.sql /docker-entrypoint-initdb.d/01_extensions.sql
COPY init.sh  /docker-entrypoint-initdb.d/02_roles.sh
RUN chmod +x /docker-entrypoint-initdb.d/02_roles.sh

EXPOSE 5432

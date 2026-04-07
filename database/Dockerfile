# =============================================================================
# AEROFINDER — Imagen de PostgreSQL
# Base: postgis/postgis:16-3.4 + pgvector 0.8+
# Se auto-inicializa con el schema completo en el primer arranque
# =============================================================================

FROM postgis/postgis:16-3.4

# Instalar pgvector desde los repositorios oficiales de PostgreSQL
RUN apt-get update -qq \
 && apt-get install -y -qq postgresql-16-pgvector \
 && rm -rf /var/lib/apt/lists/*

# Copiar archivos SQL del schema al contenedor
# Se referencian desde los scripts de init
COPY schema/ /schema/

# Scripts de inicialización — PostgreSQL los ejecuta automáticamente
# en el primer arranque (cuando /var/lib/postgresql/data está vacío),
# en orden alfabético.
COPY init/ /docker-entrypoint-initdb.d/
RUN chmod +x /docker-entrypoint-initdb.d/*.sh

EXPOSE 5432

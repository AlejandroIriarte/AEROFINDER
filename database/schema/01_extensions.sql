-- =============================================================================
-- AEROFINDER — Extensiones PostgreSQL
-- Ejecutar como superusuario ANTES del resto del schema
-- Orden de ejecución: 01 → 02 → 03
-- =============================================================================

-- Tipos geoespaciales: GEOMETRY(Polygon), GEOMETRY(Point), funciones ST_*
CREATE EXTENSION IF NOT EXISTS postgis;

-- pgvector: columnas vector(512) y búsqueda por similitud coseno (embeddings faciales)
CREATE EXTENSION IF NOT EXISTS vector;

-- Búsqueda aproximada de texto: útil para nombres de personas con errores tipográficos
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Índices GiST sobre tipos escalares: necesario para restricciones de exclusión temporal
CREATE EXTENSION IF NOT EXISTS btree_gist;

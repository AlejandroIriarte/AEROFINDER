# =============================================================================
# AEROFINDER — Imagen del Backend (FastAPI + SQLAlchemy 2.0 async)
# Multi-stage: builder separa dependencias del runtime final
# Requiere: backend/requirements.txt y backend/app/ (creados en BE-1)
# =============================================================================

# ── Etapa 1: instalación de dependencias ─────────────────────────────────────
FROM python:3.12-slim AS builder

# Dependencias del sistema necesarias para compilar paquetes con extensiones C
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /build

# Copiar e instalar dependencias en un virtualenv aislado
# Se hace en capa separada para aprovechar caché de Docker
COPY requirements.txt .
RUN python -m venv /venv \
 && /venv/bin/pip install --no-cache-dir --upgrade pip \
 && /venv/bin/pip install --no-cache-dir -r requirements.txt


# ── Etapa 2: imagen final de runtime ─────────────────────────────────────────
FROM python:3.12-slim AS runtime

# Dependencias de runtime (solo libpq, sin compiladores)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    curl \
 && rm -rf /var/lib/apt/lists/*

# Usuario sin privilegios para ejecutar la aplicación
RUN useradd -m -u 1000 -s /bin/bash appuser

WORKDIR /app

# Copiar el virtualenv desde el builder
COPY --from=builder /venv /venv
ENV PATH="/venv/bin:$PATH"

# Copiar el código de la aplicación (creado en BE-1)
COPY --chown=appuser:appuser . .

USER appuser

EXPOSE 8000

# Health check: valida que la API responde antes de marcar el servicio healthy
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# uvicorn con loop asyncio y 1 worker por contenedor
# Para escalar: múltiples réplicas con un load balancer por delante
CMD ["uvicorn", "app.main:app", \
     "--host", "0.0.0.0", \
     "--port", "8000", \
     "--loop", "asyncio", \
     "--no-access-log"]

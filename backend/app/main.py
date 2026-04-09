# =============================================================================
# AEROFINDER Backend — Punto de entrada de la aplicación FastAPI
# =============================================================================

import asyncio
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import (
    alerts as alerts_router,
    auth as auth_router,
    detections as detections_router,
    drones as drones_router,
    missions as missions_router,
    persons as persons_router,
    public as public_router,
    system as system_router,
    telemetry as telemetry_router,
    users as users_router,
    ws as ws_router,
)

# Configuración de logging estándar; el nivel se puede ajustar vía variable de entorno
logging.basicConfig(
    level=logging.DEBUG if settings.environment == "development" else logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)

# ── Aplicación ────────────────────────────────────────────────────────────────
app = FastAPI(
    title="AEROFINDER API",
    description="Sistema de búsqueda de personas desaparecidas con drones e IA",
    version="1.0.0",
    # Deshabilitar docs en producción para reducir superficie de ataque
    docs_url="/docs" if settings.environment != "production" else None,
    redoc_url="/redoc" if settings.environment != "production" else None,
)

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Eventos de ciclo de vida ──────────────────────────────────────────────────
@app.on_event("startup")
async def on_startup() -> None:
    """Verificaciones iniciales y tareas de fondo al arrancar el servidor."""
    from app.services.detection_consumer import run_detection_consumer

    from app.services.notification_worker import run_notification_worker

    logger.info("AEROFINDER backend iniciando (entorno: %s)", settings.environment)
    asyncio.create_task(run_detection_consumer())
    logger.info("Consumer de detecciones iniciado")
    asyncio.create_task(run_notification_worker())
    logger.info("Worker de notificaciones iniciado")


@app.on_event("shutdown")
async def on_shutdown() -> None:
    """Limpieza de recursos al detener el servidor."""
    logger.info("AEROFINDER backend detenido correctamente")


# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(public_router.router)   # sin auth — primero para claridad
app.include_router(auth_router.router)
app.include_router(users_router.router)
app.include_router(persons_router.router)
app.include_router(drones_router.router)
app.include_router(missions_router.router)
app.include_router(detections_router.router)
app.include_router(alerts_router.router)
app.include_router(system_router.router)
app.include_router(telemetry_router.router)
app.include_router(ws_router.router)       # WebSockets al final


# ── Health check ──────────────────────────────────────────────────────────────
@app.get("/health", tags=["sistema"])
async def health_check() -> dict:
    """Endpoint de salud para Docker health check y load balancer."""
    return {"status": "ok"}

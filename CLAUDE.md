



[200~# AEROFINDER

Sistema de búsqueda de personas desaparecidas con drones,
IA (YOLO + FaceNet) y telemetría GPS en tiempo real.

## Stack
- Ubuntu 24.04, GPU NVIDIA, Docker Compose v2
- PostgreSQL 16 + PostGIS + pgvector
- FastAPI + SQLAlchemy 2.0 async + Alembic
- Redis 7 Streams, MinIO
- YOLOv8n + InsightFace buffalo_l
- Next.js 14 App Router + Leaflet.js + hls.js
- Kotlin + DJI Mobile SDK v5 (Android)

## Reglas de código
- Comentarios en español, nombres de variables/funciones en inglés
- Nunca hardcodear credenciales, siempre .env
- Todo I/O con try/except y logger.error con exc_info=True
- SET LOCAL aerofinder.current_user_id antes de toda escritura en DB
- Umbrales de IA desde tabla system_config, no desde os.getenv()

## Estado de sesiones
- [ ] DB-1: análisis de dominios
- [ ] DB-2: tablas núcleo y ENUMs
- [ ] DB-3: índices, triggers, seguridad
- [ ] DB-4: vistas, seeds, Alembic
- [ ] BE-1: estructura proyecto y modelos ORM
- [ ] BE-2: auth JWT y RBAC
- [ ] BE-3: API REST
- [ ] BE-4: WebSockets
- [ ] BE-5: Redis consumer y MinIO
- [ ] AI-1: worker YOLO + FaceNet
- [ ] AI-2: DJI telemetría
- [ ] AI-3: notification worker
- [ ] FE-1: estructura frontend y auth
- [ ] FE-2: mapa Leaflet
- [ ] FE-3: panel video HLS
- [ ] FE-4: vistas por rol
- [ ] INF-1: Dockerfiles
- [ ] INF-2: docker-compose.yml
- [ ] INF-3: setup.sh Ubuntu~




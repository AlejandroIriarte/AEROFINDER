# AEROFINDER

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
- SET LOCAL aerofinder.current_user_id antes de toda escritura en DB (usar f-string, no parámetros — asyncpg no soporta parámetros en SET LOCAL)
- Umbrales de IA desde tabla system_config, no desde os.getenv()

## Estado de sesiones
- [x] DB-1: análisis de dominios
- [x] DB-2: tablas núcleo y ENUMs
- [x] DB-3: índices, triggers, seguridad
- [x] DB-4: vistas, seeds, Alembic
- [x] BE-1: estructura proyecto y modelos ORM
- [x] BE-2: auth JWT y RBAC
- [x] BE-3: API REST
- [x] BE-4: WebSockets
- [x] BE-5: Redis consumer y MinIO
- [x] AI-1: worker YOLO + FaceNet
- [x] AI-2: DJI telemetría
- [x] AI-3: notification worker
- [x] FE-1: estructura frontend y auth
- [x] FE-2: mapa Leaflet
- [x] FE-3: panel video HLS
- [x] FE-4: vistas por rol
- [x] INF-1: Dockerfiles
- [x] INF-2: docker-compose.yml
- [x] INF-3: setup.sh Ubuntu
- [x] DEP-1: despliegue completo en Ubuntu 24.04 (sistema operativo)

## Notas de despliegue (DEP-1)

### Fixes aplicados al código
- `backend/app/core/security.py`: reemplazado `passlib` por `bcrypt` directo (passlib 1.7.4 incompatible con bcrypt 5.x)
- `backend/app/db/session.py` y `routers/telemetry.py`: SET LOCAL usa f-string en lugar de parámetros `:uid` (asyncpg no soporta parámetros en SET LOCAL)
- `backend/requirements.txt`: añadidos `shapely==2.0.6` y `pydantic[email]`
- `ai_worker/Dockerfile`: CMD corregido a `python main.py` (estructura plana, sin subdirectorio `app/`)
- `docker-compose.yml`: añadido `DRONE_ID` (UUID) al ai-worker; `healthcheck: disable: true` en mediamtx; depends_on mediamtx usa `service_started`

### Fixes de base de datos (ejecutados manualmente como superusuario)
- `GRANT CREATE ON SCHEMA public TO aerofinder_app;` — PostgreSQL 15+ revocó CREATE por defecto
- `GRANT SELECT ON ALL TABLES IN SCHEMA public TO aerofinder_worker;`
- Transfer de ownership de todos los ENUMs a aerofinder_app (DO $$ loop ALTER TYPE)
- Seed del usuario admin: `INSERT INTO users (email, password_hash, full_name, role_id, is_active)`

### Credenciales admin por defecto
- Email: `admin@aerofinder.local`
- Password: `AeroAdmin2024!`
- Hash generado con: `bcrypt.hashpw(password.encode(), bcrypt.gensalt())`

### Modelos IA
- YOLOv8n: descargar en host con `curl -L` y copiar al volumen `aerofinder_ai_models` con permisos 1001:1001
- InsightFace buffalo_l: se descarga automáticamente en el primer arranque (~500MB)

# Changelog

Todos los cambios notables del proyecto se documentan aquí.

Formato basado en [Keep a Changelog](https://keepachangelog.com/es/1.0.0/).
Versiones siguen [Semantic Versioning](https://semver.org/lang/es/): `MAJOR.MINOR.PATCH`.

- **MAJOR** — cambios incompatibles (migración de DB destructiva, ruptura de API pública)
- **MINOR** — nueva funcionalidad retrocompatible
- **PATCH** — correcciones de bugs retrocompatibles

> El proyecto está en fase `0.x` hasta el primer despliegue estable en producción real.

---

## [0.9.1] — 2026-05-11

### Fixed
- `GET /drones/` devolvía 500 — `DroneResponse(**model_dump(), rtmp_url=...)` pasaba `rtmp_url`/`hls_url` dos veces; corregido con `model_copy(update=...)`
- `GET /detections/?limit=200` devolvía 422 — límite del backend era `le=100`; subido a `le=500`
- Ambos rompían el `Promise.all()` del dashboard y panel de control en cascada
- Contraseña de `aerofinder_app` en PostgreSQL desincronizada con `.env` — causa original del error 500 en login

---

## [0.9.0] — 2026-05-10

### Changed (FE redesign completo)
- Rediseño visual **Modern Clean** en todos los dashboards, login y registro
- Sidebar colapsable con íconos + labels, nav por rol
- `Topbar` con breadcrumb dinámico, rol chip, campana de notificaciones, avatar
- Dashboard principal con KPIs reales (misiones, drones, alertas, detecciones del día, field reports, usuarios)
- `LiveFeed` con WebSocket de misión activa

### Added
- Componentes reutilizables: `KpiCard`, `SectionCard`, `PageHeader`, `MissionRow`, `AlertRow`, `DetectionRow`, `DroneStatusRow`, `FieldReportRow`
- Breadcrumb dinámico para rutas `[id]` (misiones, personas)
- Link `/connect` en sidebar footer para admin y buscador
- Login pre-llena email desde query param `?email=` (flujo post-registro)

---

## [0.8.0] — 2026-04-30

### Added (INF-1/2/3 + DEP-1)
- `Dockerfile` para backend, frontend y AI worker
- `docker-compose.yml` completo con health checks, depends_on, redes internas
- `aerofinder.sh` — script de gestión: `start`, `status`, `logs`, `ip <nueva_ip>`
- `setup.sh` para Ubuntu 24.04: Docker, NVIDIA drivers, PostGIS, pgvector
- `infra/mediamtx.yml` — configuración RTMP/HLS/RTSP/API para MediaMTX
- `database/Dockerfile` con PostgreSQL 16 + PostGIS + pgvector
- `.gitignore` para `.env`, `.next/`, `node_modules/`, modelos IA

### Fixed (DEP-1)
- `security.py`: reemplazado `passlib` por `bcrypt` directo (incompatibilidad passlib 1.7.4 + bcrypt 5.x)
- `session.py` y `telemetry.py`: SET LOCAL con f-string en lugar de parámetros `:uid` (asyncpg)
- `requirements.txt`: añadidos `shapely==2.0.6` y `pydantic[email]`
- AI worker `CMD` corregido a `python main.py`
- Permisos de DB: `GRANT CREATE ON SCHEMA public TO aerofinder_app`

---

## [0.7.0] — 2026-04-28

### Added (FE-9/10/11)
- **PWA rescatistas**: `/app/mission`, `/app/report`, `/app/report/photos`, `/app/report/result`
- Service Worker + `manifest.json` + push notification handler
- `DroneVideoMosaic` — grid dinámico 1/2/4 drones
- `DroneStreamCard` — video HLS + controles de reconocimiento facial
- `FieldReportPanel` — lista solicitudes con aprobar/rechazar/ver resultado
- `FieldReportResultModal` — top-3 matches con barras de similitud
- Página de drones: RTMP URL siempre visible, badge `auto-created`, modal edición
- Misión detalle: mosaico multi-dron + field reports panel + eventos WS

---

## [0.6.0] — 2026-04-25

### Added (FE-6/7/8)
- Página detecciones: lista con filtros, paginación, GPS condicional por rol
- Página alertas: lista con nav a misión al hacer click
- Controles de misión: cambio de status, asignación de drones
- Video polish: snapshot, Picture-in-Picture
- Flujo de roles completo: página detalle persona con acceso por rol
- Nav buscador a alertas

---

## [0.5.0] — 2026-04-22

### Added (FE-1/2/3/4/5)
- Estructura frontend Next.js 14 App Router con Zustand auth store
- Login/registro con JWT, refresh automático, interceptor Axios
- Mapa Leaflet con marcadores GPS de detecciones
- Panel de video HLS con `hls.js`
- Vistas por rol: admin, buscador, ayudante, familiar
- Notificaciones globales: campana + toasts + WS provider
- `useWebSocket` hook con auto-reconnect y backoff exponencial
- `RoleGuard` component

---

## [0.4.0] — 2026-04-20

### Added (AI-4/5 + BE-7)
- AI worker refactorizado: descubrimiento dinámico de misiones cada 10s, toggle `recognition_active` en caliente
- Supervisor loop multi-dron: procesa N streams RTSP simultáneos
- `field_report_analyzer`: BLPOP → FaceNet → pgvector → WS broadcast
- Backend `field_reports`: router, schemas, modelos, migración 0007/0008
- Push notifications con `pywebpush` (Web Push API)
- Endpoint `POST /missions/{id}/recognition` para activar/desactivar reconocimiento

---

## [0.3.0] — 2026-04-17

### Added (BE-5/6 + AI-1/2/3)
- Redis Streams: `aerofinder:telemetry`, `aerofinder:detections`, `aerofinder:notifications`
- Consumer groups con ACK explícito; dead letter stream
- MinIO: buckets `aerofinder-snapshots`, `aerofinder-photos`, `aerofinder-videos`
- Presigned URL flow: upload-url → PUT directo → confirm
- Importación CSV de personas desaparecidas desde registros gov
- AI worker: YOLOv8n + InsightFace buffalo_l
- DJI telemetría: RTMP → MediaMTX → RTSP → AI worker
- Notification worker: push/email/SMS desde `notification_queue`
- Migración 0005/0006: `face_embedding` pgvector, `recognition_active`

---

## [0.2.0] — 2026-04-14

### Added (BE-1/2/3/4)
- Estructura FastAPI + SQLAlchemy 2.0 async + Alembic
- Auth JWT: login, refresh, logout, registro, sesiones en DB (`user_sessions`)
- RBAC con RLS PostgreSQL: roles admin/buscador/ayudante/familiar
- API REST completa: misiones, drones, personas, detecciones, alertas, usuarios, config, audit log
- WebSockets: `/ws/missions/{id}`, `/ws/telemetry/{drone_id}`, `/ws/alerts`
- `WsManager` con grupos por rol y fan-out de alertas
- `detection_consumer`: lee Redis stream → INSERT detections → broadcast alerts

---

## [0.1.0] — 2026-04-09

### Added (DB-1/2/3/4)
- Esquema PostgreSQL 16 + PostGIS + pgvector
- Tablas núcleo: `users`, `roles`, `missions`, `drones`, `persons`, `detections`, `alerts`, `notification_queue`, `field_reports`, `system_config`
- ENUMs: `mission_status`, `drone_status`, `alert_level`, `role_name`, `person_status`, etc.
- Índices GiST (PostGIS), GIN, BRIN para telemetría y embeddings
- Triggers: `updated_at` automático, audit log
- Row-Level Security (RLS): políticas por rol con `fn_current_app_user_id()`
- Vistas: `v_active_missions`, `v_person_search`
- Seed inicial: roles, usuario admin, `system_config` con umbrales IA
- Migraciones Alembic 0001–0006

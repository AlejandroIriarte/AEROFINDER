# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# AEROFINDER

Sistema de búsqueda de personas desaparecidas con drones, IA (YOLO + FaceNet) y telemetría GPS en tiempo real.

## Stack
- Ubuntu 24.04, GPU NVIDIA, Docker Compose v2
- PostgreSQL 16 + PostGIS + pgvector
- FastAPI + SQLAlchemy 2.0 async + Alembic
- Redis 7 Streams, MinIO
- YOLOv8n + InsightFace buffalo_l
- Next.js 14 App Router + Leaflet.js + hls.js
- Kotlin + DJI Mobile SDK v5 (Android)

---

## Comandos de desarrollo

### Docker (forma normal de correr todo)
```bash
./aerofinder.sh start              # levanta todo, espera health, muestra URLs
./aerofinder.sh start --rebuild    # igual pero reconstruye imágenes
./aerofinder.sh status             # estado de contenedores + endpoints
./aerofinder.sh logs -f            # sigue logs de backend + ai-worker
./aerofinder.sh logs backend -f    # logs de un servicio específico
./aerofinder.sh ip 192.168.1.50   # cambia IP pública en .env + DB + rebuild frontend
```

### Backend (desarrollo local sin Docker)
```bash
cd backend
pip install -r requirements.txt
alembic upgrade head               # aplicar migraciones
uvicorn app.main:app --reload --port 8000

# Migraciones Alembic
alembic revision --autogenerate -m "descripcion"
alembic upgrade head
alembic downgrade -1
```

### Frontend (desarrollo local sin Docker)
```bash
cd frontend
npm ci
npm run dev        # http://localhost:3000
npm run build      # build de producción
npm run lint       # ESLint
```

### AI Worker (desarrollo local)
```bash
cd ai_worker
pip install -r requirements.txt
python main.py
```

---

## Reglas de código
- Comentarios en español, nombres de variables/funciones en inglés
- Nunca hardcodear credenciales, siempre `.env`
- Todo I/O con `try/except` y `logger.error(..., exc_info=True)`
- `SET LOCAL aerofinder.current_user_id` usa f-string, **no parámetros** — asyncpg no los soporta en SET LOCAL
- Umbrales de IA desde tabla `system_config`, no desde `os.getenv()`

---

## Arquitectura

### Flujo de request backend
1. Request llega → middleware CORS → router FastAPI
2. Dependency `get_db()` abre transacción (`async with session.begin()`)
3. Dependency `get_current_user()` decodifica JWT → verifica `user_sessions` activa → llama `set_db_session_context()`:
   - `SET LOCAL aerofinder.current_user_id = '{uuid}'` (f-string, no parámetros)
   - `SET LOCAL aerofinder.current_user_role = '{role}'`
   - `SET LOCAL aerofinder.current_session_id = '{uuid}'`
4. Las políticas RLS de PostgreSQL usan `fn_current_app_user_id()` para filtrar automáticamente
5. Al salir: commit en éxito, rollback en excepción

### Pipeline de detección IA
```
Dron DJI → RTMP rtmp://host:1935/{serial}
  → MediaMTX → RTSP rtsp://mediamtx:8554/{serial}
  → AI Worker (OpenCV + YOLO + FaceNet)
  → Redis Stream aerofinder:detections
  → detection_consumer (backend) → INSERT detections + fan-out alerts
  → WebSocket broadcast a clientes
```

### Arquitectura de WebSockets
- `WS /ws/missions/{id}?token=<jwt>` — familiar + staff; mensajes: detection, alert, mission_update, ping
- `WS /ws/telemetry/{drone_id}?token=<jwt>` — admin/buscador; mensajes: telemetry con GPS
- `WS /ws/alerts?token=<jwt>` — admin/buscador/ayudante; familiar usa el WS de misión
- JWT siempre como query param (WebSockets no soportan headers Bearer)

### Roles y niveles de acceso
| Rol | Acceso | Nivel alerta |
|-----|--------|--------------|
| admin | Todo | full (con GPS) |
| buscador | Operaciones | full (con GPS) |
| ayudante | Soporte + revisión | partial (sin GPS) |
| familiar | Sus casos + notificaciones | confirmation_only |

### Presigned URL (fotos)
1. `POST /persons/{id}/photos/upload-url` → URL firmada MinIO (5 min) + `photo_id`
2. Cliente hace `PUT {presigned_url}` directo a MinIO
3. `POST /persons/{id}/photos/confirm` → backend llama `stat_object()` → crea `File` + `PersonPhoto`

### Redis Streams (no Pub/Sub)
- `aerofinder:telemetry` — GPS desde drones (telemetry router → WebSocket broadcast)
- `aerofinder:detections` — outputs de YOLO (AI worker → detection_consumer backend)
- `aerofinder:notifications` — jobs de entrega (push/email/SMS)
- Consumer groups con ACK explícito; fallos van a `aerofinder:detections:dead_letter`

### AI Worker — descubrimiento dinámico
- Cada 10s busca misión con `status='active' AND recognition_active=TRUE`
- Si no hay misión: sleep y reintenta
- Conecta RTSP: `rtsp://mediamtx:8554/{drone.serial_number}`
- Cada 60s recarga umbrales desde `system_config` (hot-reload sin restart)
- `POST /missions/{id}/recognition {"active": true/false}` activa/desactiva en caliente

### Migraciones de base de datos
- `backend/migrations/` — scripts Alembic
- El `entrypoint.sh` del contenedor corre `alembic upgrade head` al arrancar
- ENUMs: usar `SAEnum(PythonEnum, name='db_type_name', create_type=False)` para no re-crear tipos PostgreSQL

---

## Frontend — rutas por rol

| Ruta | admin | buscador | ayudante | familiar |
|------|-------|----------|----------|---------|
| `/dashboard` | Misiones activas | Misiones activas | Alertas recientes | Panel notificaciones |
| `/dashboard/missions` | ✓ | ✓ | ✓ | — |
| `/dashboard/missions/[id]` | ✓ controls | ✓ controls | ✓ view | — |
| `/dashboard/persons` | ✓ CRUD | ✓ read | — | — |
| `/dashboard/persons/[id]` | ✓ full | ✓ full | ✓ fotos | ✓ su caso |
| `/dashboard/detections` | ✓ GPS | ✓ GPS | ✓ sin GPS | — |
| `/dashboard/alerts` | ✓ | ✓ | ✓ | — |
| `/dashboard/admin/pending-review` | ✓ | — | ✓ | — |
| `/dashboard/familiar` | — | — | — | ✓ mis casos |
| `/dashboard/familiar/report` | — | — | — | ✓ |
| `/dashboard/notifications` | — | — | — | ✓ WS face_match |

### Patrones frontend
- **Auth store** (Zustand): access token en memoria, refresh token en cookie `aerofinder_refresh`
- **Axios interceptor**: en 401 hace refresh automático, encola requests concurrentes
- **useWebSocket hook**: auto-reconnect con backoff [1s→2s→4s→8s→30s], ping cada 30s
- **RoleGuard component**: `<RoleGuard roles={["admin","buscador"]}>` para proteger secciones
- **API namespaces**: `authApi`, `missionsApi`, `personsApi`, `photosApi`, `detectionsApi`, `alertsApi`, `systemApi`, `usersApi`

---

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
- [x] BE-6: fotos personas (presigned URL), importación CSV gov, correcciones críticas
- [x] AI-1: worker YOLO + FaceNet
- [x] AI-2: DJI telemetría
- [x] AI-3: notification worker
- [x] AI-4: AI worker refactorizado — descubrimiento dinámico, recognition_active toggle, migraciones 0005/0006
- [x] FE-1: estructura frontend y auth
- [x] FE-2: mapa Leaflet
- [x] FE-3: panel video HLS
- [x] FE-4: vistas por rol
- [x] FE-5: notificaciones globales (bell + toasts + WS provider)
- [x] FE-6: detecciones (lista con filtros, paginación)
- [x] FE-7: controles de misión (status, asignación drones) + video polish (snapshot, PiP)
- [x] FE-8: flujo de roles — página detalle persona + nav buscador alertas
- [x] BE-7: field_reports — routers, schemas, modelos, migración 0007/0008, push notifications (pywebpush)
- [x] AI-5: supervisor loop multi-dron + field_report_analyzer (BLPOP → FaceNet → pgvector → WS broadcast)
- [x] FE-9: mosaico multi-dron (DroneVideoMosaic + DroneStreamCard) + FieldReportPanel + FieldReportResultModal
- [x] FE-10: PWA rescatistas — /app/mission + /app/report + /app/report/photos + /app/report/result + SW + manifest
- [x] FE-11: drones page — RTMP URL visible, badge auto-created, modal edición; types auto_created/rtmp_url/hls_url/face_recognition_active
- [x] INF-1: Dockerfiles
- [x] INF-2: docker-compose.yml
- [x] INF-3: setup.sh Ubuntu
- [x] DEP-1: despliegue completo en Ubuntu 24.04 (sistema operativo)

---

## Notas de despliegue (DEP-1)

### Fixes aplicados al código
- `backend/app/core/security.py`: reemplazado `passlib` por `bcrypt` directo (passlib 1.7.4 incompatible con bcrypt 5.x)
- `backend/app/db/session.py` y `routers/telemetry.py`: SET LOCAL usa f-string en lugar de parámetros `:uid`
- `backend/requirements.txt`: añadidos `shapely==2.0.6` y `pydantic[email]`
- `ai_worker/Dockerfile`: CMD corregido a `python main.py` (estructura plana)
- `docker-compose.yml`: `healthcheck: disable: true` en mediamtx; depends_on mediamtx usa `service_started`; DRONE_ID eliminado del ai-worker

### Fixes de base de datos (ejecutados manualmente como superusuario)
- `GRANT CREATE ON SCHEMA public TO aerofinder_app;`
- `GRANT SELECT ON ALL TABLES IN SCHEMA public TO aerofinder_worker;`
- Transfer de ownership de todos los ENUMs a aerofinder_app
- Seed del usuario admin: `INSERT INTO users (email, password_hash, full_name, role_id, is_active)`

### Credenciales admin por defecto
- Email: `admin@aerofinder.local`
- Password: `AeroAdmin2024!`

### Modelos IA
- YOLOv8n: descargar y copiar al volumen `aerofinder_ai_models` con permisos 1001:1001
- InsightFace buffalo_l: se descarga automáticamente en el primer arranque (~500MB)

### IP dinámica (implementado)
- `SERVER_HOST` en `.env` es la única fuente de verdad para la IP del servidor
- `GET /config/network-info` (admin) devuelve `server_ip`, `rtmp_url_template`, `hls_url_template`, `rtsp_url_template`
- El panel admin muestra estas URLs con botón Copiar (para configurar DJI fácilmente)
- `./aerofinder.sh ip <nueva_ip>` actualiza TODAS las vars: `NEXT_PUBLIC_*`, `BACKEND_CORS_ORIGINS`, `SERVER_HOST` y `system_config.rtmp.base_url` en DB

### Misiones remotas (PENDIENTE — no implementado)
Cuando el servidor está en casa y la misión es en otro lugar con internet de por medio:
- **Opción A — Tailscale (recomendado para proyecto de grado)**: instalar en servidor + celular piloto DJI. Crea VPN mesh privada con IPs estables (`100.x.x.x`). Resuelve CGNAT sin port forwarding. Free tier hasta 100 dispositivos.
- **Opción B — DDNS + port forwarding**: DuckDNS/No-IP da hostname estable. Router expone puertos 1935 (RTMP), 8888 (HLS), 8000 (API), 3000 (frontend). Falla si el ISP usa CGNAT.
- **Opción C — VPS relay (~$5/mes)**: VPS con IP pública actúa de entrada. Túnel reverso al servidor de casa. Más robusto para producción real.
- Para cualquier opción remota: agregar HTTPS (Let's Encrypt via Caddy/nginx) y cambiar WS a `wss://`.

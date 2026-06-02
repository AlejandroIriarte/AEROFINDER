# AEROFINDER

Sistema de búsqueda de personas desaparecidas con drones, IA y GPS en tiempo real.

Desarrollado como proyecto de grado — Universidad Franz Tamayo (Unifranz), Bolivia.

---

## ¿Qué hace?

Un operador lanza un dron compatible con RTMP (DJI, Autel, Skydio u otros) que transmite video en vivo al servidor. El AI Worker analiza cada frame con YOLOv8 (detección de personas) y FaceNet (reconocimiento facial contra la base de datos de desaparecidos). Cuando hay una coincidencia, el sistema notifica en tiempo real a los familiares vía WebSocket y Web Push.

Los rescatistas en campo pueden usar la PWA desde su celular para fotografiar a una persona encontrada y recibir el resultado del análisis facial en segundos.

---

## Arquitectura

```
Dron (RTMP) ──────▶ MediaMTX ──RTSP──▶ AI Worker (YOLO + FaceNet)
                        │                        │
                   HLS (8888)           Redis Stream detecciones
                        │                        │
                   Frontend              Backend FastAPI
                   hls.js               WebSocket broadcast
                                                 │
GPS piloto ─────────────────────────▶ Redis HSET last_gps
(PWA watchPosition)                      AI Worker lee coords
                                         al momento de la detección
```

### Compatibilidad de drones

Cualquier dron o app de piloto que soporte transmisión RTMP:

| Marca / App | Protocolo | Notas |
|-------------|-----------|-------|
| DJI (Go 4, Fly, Pilot) | RTMP | Configurar URL RTMP en ajustes de transmisión en vivo |
| Autel EVO / Lite | RTMP | Live streaming → Custom RTMP |
| Skydio | RTMP | Via integración SDK |
| Parrot | RTMP | Media Streaming SDK |
| Apps Android genéricas | RTMP | Larix Broadcaster, StreamLabs, etc. |

URL del servidor: `rtmp://IP_SERVIDOR:1935/SERIAL_DRON`

---

## Stack

| Capa | Tecnología |
|------|-----------|
| Base de datos | PostgreSQL 16 + PostGIS + pgvector |
| Backend | FastAPI + SQLAlchemy 2.0 async + Alembic |
| Cola / Caché | Redis 7 Streams |
| Almacenamiento | MinIO |
| IA | YOLOv8n + InsightFace buffalo_l |
| Frontend | Next.js 14 App Router + Leaflet.js + hls.js |
| Video | MediaMTX (RTMP → HLS/RTSP) |
| Infraestructura | Docker Compose v2, Ubuntu 24.04 |

---

## Levantar el proyecto

### Requisitos

- Ubuntu 24.04 (recomendado)
- Docker + Docker Compose v2 (`docker compose`, no `docker-compose`)
- GPU NVIDIA con drivers + `nvidia-container-toolkit` (opcional, recomendado para IA)

### Inicio rápido

```bash
# 1. Clonar
git clone git@github.com:AlejandroIriarte/AEROFINDER.git
cd AEROFINDER

# 2. Configurar variables de entorno
cp .env.example .env
# Editar .env: SERVER_HOST, SECRET_KEY, contraseñas

# 3. Levantar todo
./scripts/aerofinder.sh start

# 4. Ver estado y URLs
./scripts/aerofinder.sh status
```

El script verifica prerequisitos (Docker, GPU), crea/actualiza `.env` si falta, aplica migraciones, inicializa MinIO y espera a que todos los servicios estén healthy antes de imprimir las URLs.

### Comandos disponibles

```bash
./scripts/aerofinder.sh start              # levanta todo
./scripts/aerofinder.sh start --rebuild    # reconstruye imágenes antes de levantar
./scripts/aerofinder.sh stop               # apaga (conserva datos)
./scripts/aerofinder.sh stop --volumes     # apaga y elimina volúmenes (borra datos)
./scripts/aerofinder.sh restart            # reinicia todos los servicios
./scripts/aerofinder.sh restart backend    # reinicia un servicio específico
./scripts/aerofinder.sh status             # estado de contenedores + endpoints
./scripts/aerofinder.sh logs -f            # logs de backend + ai-worker
./scripts/aerofinder.sh logs backend -f    # logs de un servicio específico
./scripts/aerofinder.sh ip 192.168.1.50    # actualiza la IP pública en .env + DB + rebuild
```

### Variables de entorno clave

Copiar `.env.example` a `.env` y completar:

```env
# IP del servidor (para URLs de streaming)
SERVER_HOST=192.168.1.X

# JWT
SECRET_KEY=<mínimo 32 caracteres aleatorios>
# Generar con: python -c "import secrets; print(secrets.token_hex(32))"

# PostgreSQL
POSTGRES_PASSWORD=<contraseña segura>
POSTGRES_APP_PASSWORD=<contraseña app>

# MinIO
MINIO_ROOT_PASSWORD=<contraseña segura>
MINIO_SECRET_KEY=<clave secreta app>
```

### Modelos de IA

```bash
# YOLOv8n — descargar yolov8n.pt y copiar al volumen con permisos 1001:1001
docker volume create aerofinder_ai_models

# InsightFace buffalo_l — se descarga automáticamente al primer arranque (~500 MB)
```

### Acceso en campo (Tailscale — recomendado)

Para operar cuando el servidor está en un lugar distinto al área de búsqueda:

```bash
# En el servidor
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up

# En el celular del piloto: instalar Tailscale app
# Navegar a http://<tailscale-ip>:3000/app/mission
```

### Desarrollo local sin Docker

```bash
# Backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload --port 8000

# Frontend
cd frontend
npm ci
npm run dev  # http://localhost:3000

# AI Worker
cd ai_worker
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python main.py
```

---

## Servicios Docker

| Servicio | Puerto(s) | Descripción |
|---------|-----------|-------------|
| `postgres` | 5433 (host) | PostgreSQL 16 + PostGIS + pgvector |
| `redis` | — (interno) | Redis 7 Streams |
| `minio` | 9000, 9001 | Almacenamiento de archivos |
| `mediamtx` | 1935 (RTMP), 8888 (HLS), 8554 (RTSP) | Servidor de video |
| `backend` | 8000 | FastAPI + WebSockets |
| `frontend` | 3000 | Next.js 14 |
| `ai-worker` | — (interno) | YOLO + FaceNet + Redis consumer |

---

## Endpoints principales

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/auth/login` | Login → JWT + refresh token |
| `GET` | `/missions/` | Listar misiones |
| `POST` | `/missions/{id}/recognition` | Activar reconocimiento facial |
| `GET` | `/drones/streams` | Streams RTMP activos |
| `GET` | `/detections/` | Detecciones con filtros |
| `POST` | `/detections/{id}/reviews` | Revisar detección (admin/buscador) |
| `GET` | `/alerts/` | Alertas del usuario autenticado |
| `POST` | `/persons/report` | Reportar persona desaparecida (familiar) |
| `POST` | `/field-reports/{id}/analyze` | Disparar análisis FaceNet |
| `GET` | `/config/network-info` | URLs de streaming (admin) |
| `WS` | `/ws/missions/{id}` | Actualizaciones en tiempo real |
| `WS` | `/ws/alerts` | Alertas en tiempo real |

Documentación interactiva: `http://localhost:8000/docs`

---

## Roles y acceso

| Rol | Panel | Descripción |
|-----|-------|-------------|
| `super_admin` | `/dashboard/superadmin` | Control total del sistema: gestión de admins, infraestructura, auditoría profunda, borrados definitivos |
| `admin` | `/dashboard/admin` | Operaciones: misiones, personal de campo, drones, detecciones, aprobaciones |
| `buscador` | `/dashboard` | Operaciones de misión + GPS |
| `ayudante` | `/dashboard` | Revisión de detecciones (sin GPS) |
| `familiar` | `/dashboard/familiar` | Solo sus casos + notificaciones |

Credenciales por defecto (desarrollo): `admin@aerofinder.local` / `AeroAdmin2024!`

---

## Seguridad

- Autenticación JWT con refresh tokens y revocación por sesión
- Row-Level Security (RLS) en PostgreSQL — cada rol solo accede a sus datos
- Presigned URLs para archivos (expiran en 1 hora)
- Variables de entorno para todas las credenciales (nunca hardcodeadas)
- Middleware Next.js protege `/dashboard/*` y `/app/*` en Edge Runtime

---

## Estructura del proyecto

```
AEROFINDER/
├── backend/              # FastAPI — routers, modelos, migraciones
│   ├── app/
│   │   ├── routers/      # auth, missions, persons, drones, detections, alerts...
│   │   ├── models/       # ORM SQLAlchemy
│   │   └── schemas/      # Pydantic schemas
│   └── migrations/       # Migraciones Alembic
├── frontend/             # Next.js 14 App Router
│   └── src/
│       ├── app/
│       │   ├── dashboard/   # Panel de control por rol
│       │   └── app/         # PWA rescatistas (/app/mission, /app/report/*)
│       ├── lib/             # api.ts, types.ts
│       └── middleware.ts    # Protección de rutas en Edge Runtime
├── ai_worker/            # YOLO + FaceNet + Redis consumer
├── infra/                # mediamtx.yml
├── database/             # Scripts SQL de inicialización
├── scripts/              # aerofinder.sh — script operacional
├── docker-compose.yml
└── .env.example
```

---

## Licencia

Proyecto de grado — uso académico. Universidad Franz Tamayo (Unifranz), Bolivia.

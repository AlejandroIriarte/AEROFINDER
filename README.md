# AEROFINDER

Sistema de búsqueda de personas desaparecidas con drones, IA y GPS en tiempo real.

Desarrollado como proyecto de grado — Universidad Mayor de San Simón (UMSS), Bolivia.

---

## ¿Qué hace?

Un operador lanza un dron capaz de transmitir video RTMP en vivo al servidor. El AI worker analiza cada frame con YOLOv8 (detección de personas) y FaceNet (reconocimiento facial contra la base de datos de desaparecidos). Cuando hay una coincidencia, el sistema notifica en tiempo real a los familiares via WebSocket y Web Push.

Los rescatistas en campo pueden usar la PWA desde su celular para fotografiar a una persona encontrada y recibir el resultado del análisis facial en segundos.

---

## Stack

## Levantar el proyecto

### Requisitos

- Ubuntu 24.04 (recomendado) con GPU NVIDIA si va a usar aceleración
- Docker y Docker Compose v2 (comando: `docker compose`)
- `nvidia-container-toolkit` y drivers NVIDIA si usa GPU

### Flujo recomendado — Primera vez (arranque completo)

1. Clonar e inicializar `.env`:

```
Dron (RTMP) ──RTMP──▶ MediaMTX ──RTSP──▶ AI Worker (YOLO + FaceNet)
					│                       │
				HLS (8888)           Redis Stream detecciones
					│                       │
				Frontend             Backend FastAPI
				hls.js               WebSocket broadcast
									    │
				GPS piloto ──────────▶ Redis HSET last_gps
				(PWA watchPosition)          │
								 AI Worker lee coords
								 al momento de la detección
```
El script hace comprobaciones (prerequisitos, .env), crea/actualiza .env si falta, sincroniza contraseñas de DB, aplica migraciones, inicializa MinIO y espera a que el backend quede healthy. Al terminar imprime URLs útiles (panel, API, HLS, RTMP).

### Comandos de uso diario / reinicios

- Levantar sin reconstruir (arranque rápido o reinicio de sistema):

```bash
./scripts/aerofinder.sh start
```

- Apagar (y opcionalmente borrar volúmenes de datos):

```bash
./scripts/aerofinder.sh stop        # apaga y conserva datos
./scripts/aerofinder.sh stop --volumes  # apaga y elimina volúmenes (datos)
```

- Reiniciar servicios (todo o por nombre):

```bash
./scripts/aerofinder.sh restart           # reinicia todos
./scripts/aerofinder.sh restart backend ai-worker  # reinicia servicios concretos
```

- Ver estado y salud: `./scripts/aerofinder.sh status`
- Ver logs (tail): `./scripts/aerofinder.sh logs -f` (por defecto muestra backend + ai-worker)
- Actualizar IP pública (reconstruye frontend/backend y actualiza DB):

```bash
./scripts/aerofinder.sh ip 192.168.1.50
```

### Comandos alternativos / debugging (sin script)

- Levantar solo con Docker Compose (útil para debugging):

```bash
docker compose build --parallel
docker compose up -d
docker compose logs -f backend
```

- Forzar migraciones manualmente (si algo falla):

```bash
docker compose exec -T backend alembic upgrade head
```

- Inicializar MinIO manualmente (si es necesario):

```bash
docker compose run --rm minio-init
```

### Desarrollo local sin Docker

- Backend (desarrollo):

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

- Frontend (desarrollo):

```bash
cd frontend
npm ci
npm run dev  # http://localhost:3000
```

- AI Worker (desarrollo):

```bash
cd ai-worker
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python main.py
```

### Variables de entorno clave

Copiar `.env.example` a `.env` y completar las variables sensibles antes del primer arranque:

```env
# PostgreSQL
POSTGRES_PASSWORD=<contraseña segura>
POSTGRES_APP_PASSWORD=<contraseña app>

# JWT
SECRET_KEY=<mínimo 32 caracteres aleatorios>
# Generar: python -c "import secrets; print(secrets.token_hex(32))"

# MinIO
MINIO_ROOT_PASSWORD=<contraseña segura>
MINIO_SECRET_KEY=<clave secreta app>

# IP del servidor (para URLs de streaming)
SERVER_HOST=192.168.1.X
```

### Credenciales por defecto (desarrollo)

Admin: `admin@aerofinder.local` / `AeroAdmin2024!`

5. PWA hace polling hasta que el resultado esté listo (≤ 30s)
6. Muestra top-3 coincidencias con porcentaje de similitud

---

## Levantar el proyecto

### Requisitos

- Ubuntu 24.04 con GPU NVIDIA
- Docker + Docker Compose v2
- Drivers NVIDIA + nvidia-container-toolkit

### Inicio rápido

```bash
# 1. Clonar y configurar variables de entorno
git clone git@github.com:AlejandroIriarte/AEROFINDER.git
cd AEROFINDER
cp .env.example .env
# Editar .env con tus valores (ver sección Variables de entorno)

# 2. Levantar todo
./aerofinder.sh start

# 3. Ver estado y URLs
./aerofinder.sh status
```

El script espera que todos los servicios estén healthy antes de mostrar las URLs.

### Comandos disponibles

```bash
./aerofinder.sh start              # levanta todo
./aerofinder.sh start --rebuild    # reconstruye imágenes antes de levantar
./aerofinder.sh status             # estado de contenedores + endpoints
./aerofinder.sh logs -f            # logs de backend + ai-worker
./aerofinder.sh logs backend -f    # logs de un servicio específico
./aerofinder.sh ip 192.168.1.50    # actualiza la IP pública en .env + BD + rebuild frontend
```

### Variables de entorno clave

Copiar `.env.example` a `.env` y completar:

```env
# PostgreSQL
POSTGRES_PASSWORD=<contraseña segura>
POSTGRES_APP_PASSWORD=<contraseña app>

# JWT
SECRET_KEY=<mínimo 32 caracteres aleatorios>
# Generar con: python -c "import secrets; print(secrets.token_hex(32))"

# MinIO
MINIO_ROOT_PASSWORD=<contraseña segura>
MINIO_SECRET_KEY=<clave secreta app>

# IP del servidor (para URLs de streaming)
SERVER_HOST=192.168.1.X
```

### Modelos de IA

```bash
# YOLOv8n — descargar y copiar al volumen
docker volume create aerofinder_ai_models
# copiar yolov8n.pt al volumen con permisos 1001:1001

# InsightFace buffalo_l — se descarga automáticamente al primer arranque (~500 MB)
```

### Acceso en campo (Tailscale — recomendado)

```bash
# En el servidor
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up

# En el celular del piloto: instalar Tailscale app
# Luego navegar a http://<tailscale-ip>:3000/app/mission
```

---

## Endpoints principales

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/auth/login` | Login → JWT + refresh token |
| `GET` | `/missions/` | Listar misiones |
| `POST` | `/missions/{id}/recognition` | Activar reconocimiento facial |
| `GET` | `/drones/streams` | Streams RTMP activos (consulta MediaMTX) |
| `GET` | `/detections/` | Detecciones con filtros |
| `POST` | `/detections/{id}/reviews` | Revisar detección (admin/buscador) |
| `GET` | `/alerts/` | Alertas del usuario autenticado |
| `POST` | `/field-reports/{id}/analyze` | Disparar análisis FaceNet |
| `GET` | `/config/network-info` | URLs de streaming (admin) |
| `WS` | `/ws/missions/{id}` | Actualizaciones en tiempo real |
| `WS` | `/ws/alerts` | Alertas en tiempo real |

Documentación interactiva disponible en `http://localhost:8000/docs` (Swagger UI).

---

## Servicios Docker

| Servicio | Puerto(s) | Descripción |
|---------|-----------|-------------|
| `postgres` | 5433 (host) | PostgreSQL 16 + PostGIS + pgvector |
| `redis` | — (interno) | Redis 7 Streams |
| `minio` | 9000, 9001 | Almacenamiento de archivos |
| `mediamtx` | 1935 (RTMP), 8888 (HLS), 8554 (RTSP), 9997 (API) | Servidor de video |
| `backend` | 8000 | FastAPI |
| `frontend` | 3000 | Next.js |
| `ai-worker` | — (interno) | YOLO + FaceNet |

---

## Seguridad

- Autenticación JWT con refresh tokens y revocación por sesión
- Row-Level Security (RLS) en PostgreSQL — cada rol solo ve sus datos
- Presigned URLs para acceso a archivos (expiran en 1 hora)
- Variables de entorno para todas las credenciales (nunca hardcodeadas)
- Middleware Next.js protege `/dashboard/*` y `/app/*` en Edge Runtime

---

## Estructura del proyecto

```
AEROFINDER/
├── backend/          # FastAPI — routers, modelos, migraciones
│   ├── app/
│   │   ├── routers/  # auth, missions, persons, drones, detections, alerts...
│   │   ├── models/   # ORM SQLAlchemy (32 modelos)
│   │   └── schemas/  # Pydantic schemas
│   └── migrations/   # 8 migraciones Alembic
├── frontend/         # Next.js 14 App Router
│   └── src/
│       ├── app/
│       │   ├── dashboard/   # Panel de control por rol
│       │   └── app/         # PWA rescatistas (/app/mission, /app/report/*)
│       ├── lib/             # api.ts, types.ts
│       └── middleware.ts    # Protección de rutas en Edge Runtime
├── ai-worker/        # YOLO + FaceNet + Redis consumer
├── infra/            # mediamtx.yml
├── database/         # Scripts SQL de inicialización
├── docker-compose.yml
├── .env.example
└── aerofinder.sh     # Script operacional
```

---

## Licencia

Proyecto de grado — uso académico.

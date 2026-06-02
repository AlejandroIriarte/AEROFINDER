# AEROFINDER — Spec: Flujo completo drones RTMP + PWA rescatistas

**Fecha:** 2026-05-07  
**Estado:** Aprobado  
**Autor:** Wizkas + Claude Code

---

## 1. Alcance

Este spec cubre tres subsistemas nuevos que se integran al sistema existente:

1. **Multi-dron con mosaico** — misión puede tener N drones con video simultáneo y controles de IA por misión
2. **Field Reports** — flujo de reporte de campo rescatista → admin → IA → resultado
3. **PWA rescatista** — interfaz mobile-optimized sin APK nativo

No cubre: SDKs específicos (p. ej. DJI Fly), streaming continuo desde celular ni control granular por dron (documentado como Opción A para expansión futura).

---

## 2. Decisiones de diseño

| Decisión | Elección | Alternativa descartada |
|----------|----------|----------------------|
| Video multi-dron | Mosaico simultáneo (grid) | Switch entre drones |
| Controles reconocimiento | Nivel misión (un toggle para todos los drones) | Por dron (Opción A — ver sección 9) |
| Análisis rescatista | Fotos (3-5) + FaceNet promediado | Video streaming |
| App móvil | PWA Next.js | APK nativo Kotlin |
| Integración SDK | DJI Fly u otros clientes RTMP | DJI Mobile SDK v5 (u otros SDK que expongan RTMP) |
| Auto-discovery drones | MediaMTX webhook + polling fallback | Solo registro manual |

---

## 3. Base de datos

### 3.1 Modificaciones a tablas existentes

```sql
-- Reconocimiento facial a nivel misión (detección personas ya existe como recognition_active)
ALTER TABLE missions
  ADD COLUMN face_recognition_active BOOLEAN NOT NULL DEFAULT FALSE;

-- Flag para drones creados automáticamente por auto-discovery
ALTER TABLE drones
  ADD COLUMN auto_created BOOLEAN NOT NULL DEFAULT FALSE;
```

### 3.2 Tablas nuevas

```sql
-- Ciclo de vida: pending → approved/rejected → analyzing → completed
CREATE TABLE field_reports (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mission_id       UUID NOT NULL REFERENCES missions(id),
    rescuer_id       UUID NOT NULL REFERENCES users(id),
    status           VARCHAR NOT NULL DEFAULT 'pending',
    notes            TEXT,
    location_lat     DECIMAL(10,8),
    location_lon     DECIMAL(11,8),
    approved_by      UUID REFERENCES users(id),
    approved_at      TIMESTAMPTZ,
    completed_at     TIMESTAMPTZ,
    created_at       TIMESTAMPTZ DEFAULT now()
);

-- Fotos tomadas por el rescatista (3 mínimo, 5 máximo)
CREATE TABLE field_report_photos (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    field_report_id  UUID NOT NULL REFERENCES field_reports(id),
    minio_object     VARCHAR NOT NULL,
    uploaded_at      TIMESTAMPTZ DEFAULT now()
);

-- Top-3 coincidencias del análisis FaceNet
CREATE TABLE field_report_matches (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    field_report_id  UUID NOT NULL REFERENCES field_reports(id),
    person_id        UUID NOT NULL REFERENCES persons(id),
    similarity_score DECIMAL(5,4) NOT NULL,
    rank             INTEGER NOT NULL,
    created_at       TIMESTAMPTZ DEFAULT now()
);

-- Suscripciones Web Push para notificaciones PWA
CREATE TABLE push_subscriptions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id),
    endpoint    TEXT NOT NULL,
    p256dh      TEXT NOT NULL,
    auth_key    TEXT NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, endpoint)
);
```

---

## 4. Backend — endpoints

### 4.1 Misiones (modificado)

```
PATCH /missions/{id}/recognition
Body: { "person_detection": bool, "face_recognition": bool }
Roles: admin, buscador
```
Reemplaza el endpoint actual `{ "active": bool }`. Controla `recognition_active` y `face_recognition_active` en la tabla `missions`.

### 4.2 Drones (nuevos/modificados)

```
GET  /drones/                          # agrega rtmp_url y hls_url en respuesta
POST /drones/stream-event              # webhook MediaMTX (sin auth, IP whitelist)
     ?serial={serial}&event={connect|disconnect}
```

El endpoint `stream-event` crea el dron automáticamente si el serial no existe:
- `model`: `"Dron {serial[:8]}"`
- `manufacturer`: `"Sin configurar"`
- `auto_created`: `True`
- Broadcast WS a admins: evento `drone_discovered`

### 4.3 Field Reports (nuevos)

```
POST   /missions/{id}/field-reports
       Body: { notes, location_lat, location_lon }
       Roles: buscador, ayudante

GET    /missions/{id}/field-reports
       Roles: admin, buscador

GET    /field-reports/{id}
       Roles: admin, buscador, el rescatista propietario

PATCH  /field-reports/{id}/approve
       Roles: admin

PATCH  /field-reports/{id}/reject
       Body: { reason }
       Roles: admin

POST   /field-reports/{id}/photos/upload-url
       Body: { photo_index: 1..5 }
       Returns: { presigned_url, object_name }
       Roles: el rescatista propietario

POST   /field-reports/{id}/photos/confirm
       Body: { object_name }
       Roles: el rescatista propietario

POST   /field-reports/{id}/analyze
       Dispara tarea AI. Solo si status=approved y fotos >= 3.
       Roles: el rescatista propietario
```

### 4.4 Push notifications (nuevos)

```
POST   /push/subscribe
       Body: { endpoint, p256dh, auth }
       Roles: cualquier usuario autenticado

DELETE /push/subscribe
       Body: { endpoint }
       Roles: cualquier usuario autenticado
```

---

## 5. WebSocket — eventos nuevos

Todos van por el canal existente `/ws/missions/{id}`:

| Evento | Destinatario | Payload |
|--------|-------------|---------|
| `field_report_request` | admin | `{ report_id, rescuer_name, location }` |
| `field_report_approved` | rescatista | `{ report_id }` |
| `field_report_rejected` | rescatista | `{ report_id, reason }` |
| `field_report_result` | admin + rescatista | `{ report_id, matches: [{person, score, rank}] }` |
| `mission_recognition` | todos | `{ person_detection, face_recognition }` |
| `drone_discovered` | admin | `{ serial, model }` |

---

## 6. AI Worker

### 6.1 Multi-dron (supervisor loop)

```python
async def supervisor_loop():
    active_tasks: dict[str, asyncio.Task] = {}

    while True:
        active_streams = await get_active_mission_streams()
        # arrancar tasks nuevas
        for serial in active_streams:
            if serial not in active_tasks or active_tasks[serial].done():
                active_tasks[serial] = asyncio.create_task(process_stream(serial))
        # cancelar tasks obsoletas
        for serial in list(active_tasks):
            if serial not in active_streams:
                active_tasks.pop(serial).cancel()
        await asyncio.sleep(10)
```

Cada `process_stream(serial)` respeta `mission.recognition_active` y `mission.face_recognition_active` recargados cada 60s.

### 6.2 Análisis field report

```python
async def analyze_field_report(report_id: UUID):
    fotos    = cargar_fotos_minio(report_id)          # N fotos
    embeddings = [facenet.embed(foto) for foto in fotos]
    embedding  = np.mean(embeddings, axis=0)           # promedio
    matches  = pgvector_search(embedding, mission_id, top_k=3)
    insert_field_report_matches(report_id, matches)
    update_status(report_id, "completed")
    broadcast_ws(report_id, matches)
    send_push_notifications(report_id, matches)        # rescatista + admin
```

**Por qué promediar:** N embeddings de distintos ángulos → embedding más robusto → menos falsos negativos que usar una sola foto.

---

## 7. Frontend web

### 7.1 Drones page — auto-discovery

- Cada drone card muestra siempre su `rtmp_url` con botón Copiar
- Drones con `auto_created=true` muestran badge "Sin configurar" y botón Editar
- Modal de edición: modelo, fabricante, tiempo vuelo máx., alerta batería
- Poll de streams cada 10s (ya implementado) — sin cambios

### 7.2 Mission detail — mosaico multi-dron

- Grid dinámico: 1 dron = full width, 2 = 50/50, 3-4 = 2×2
- Cada tarjeta: player HLS + nombre dron + badge En vivo/Sin señal
- Controles de misión (aplican a todos los drones):
  - `[👤 Detección personas: ON/OFF]`
  - `[🔍 Reconocimiento facial: ON/OFF]`
- Los botones muestran el mismo estado en todos los cards (nivel misión)

### 7.3 Mission detail — panel field reports

- Nueva sección en panel derecho, debajo de drones asignados
- Lista reportes pendientes con acciones Aprobar / Rechazar
- Lista reportes completados con botón Ver resultado
- Modal de resultado: fotos tomadas + top-3 matches con barra de similitud

---

## 8. PWA rescatista

### 8.1 Configuración PWA

- `manifest.json`: nombre "Aerofinder", iconos, `display: standalone`
- Service Worker: cache de assets estáticos, intercepta Web Push
- Las rutas `/app/*` son mobile-optimized (sin sidebar, sin navbar desktop)

### 8.2 Rutas nuevas

```
/app/mission           → misión activa del rescatista
/app/report            → iniciar reporte (captura ubicación GPS)
/app/report/photos     → captura 3-5 fotos (CameraX via <input capture>)
/app/report/result     → resultado con top-3 matches y fichas
```

### 8.3 Flujo completo en el celular

```
[Botón: Reportar persona encontrada]
         ↓
[Solicitud enviada — esperando admin]
         ↓ WS: field_report_approved
[¡Aprobado! Tome las fotos]
  Instrucciones: frente, perfil, 3/4, cuerpo entero
  [📷 x3 mínimo, x5 máximo]
  [Enviar para análisis]
         ↓ ~15 segundos
[Resultado]
  #1 Juan Pérez    ████████░░ 94.2%
  #2 Carlos Mamani ██████░░░░ 61.3%
  #3 Luis Quispe   █████░░░░░ 48.7%
  [Ver ficha →]
```

### 8.4 Push notifications

- Al instalar la PWA: solicitar permiso de notificaciones
- Registrar suscripción Web Push en `/push/subscribe`
- Notificación push al recibir resultado aunque la app esté en background:
  ```
  AEROFINDER — Análisis completado
  Alta coincidencia: Juan Pérez (94.2%)
  Toca para ver el reporte completo
  ```

---

## 9. Opción A — Expansión futura: controles por dron

Cuando el sistema escale a 5+ drones o hardware con múltiples GPU:

```sql
ALTER TABLE mission_drones
  ADD COLUMN person_detection_active BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN face_recognition_active BOOLEAN NOT NULL DEFAULT FALSE;
```

El AI worker leería los flags por dron en lugar de los de la misión. Cada `process_stream(serial)` consulta su propia fila en `mission_drones`. Los botones en el mosaico controlarían individualmente cada stream.

**Prerequisito antes de implementar:** benchmark de throughput GPU con N streams simultáneos para determinar el límite práctico.

---

## 10. MediaMTX — configuración

```yaml
# docker-compose.yml — mediamtx env vars
RTSP_RUNONPUBLISH: >
  curl -sf -X POST
  "http://backend:8000/drones/stream-event?serial=$$MTX_PATH&event=connect"
RTSP_RUNONUNPUBLISH: >
  curl -sf -X POST
  "http://backend:8000/drones/stream-event?serial=$$MTX_PATH&event=disconnect"
```

El backend valida que la request venga de la red interna Docker (no requiere JWT).

---

## 11. Sesiones de implementación sugeridas

| Sesión | Contenido |
|--------|-----------|
| DB-5 | Migraciones Alembic: face_recognition_active, auto_created, field_reports, push_subscriptions |
| BE-7 | Auto-discovery drones, endpoint stream-event, PATCH /missions/recognition |
| BE-8 | Field reports CRUD + presigned URLs + trigger AI |
| AI-5 | Supervisor multi-dron + analyze_field_report |
| FE-9 | Mosaico multi-dron + controles misión |
| FE-10 | Panel field reports admin + modal resultado |
| FE-11 | PWA: manifest + service worker + rutas /app/* |
| FE-12 | Flujo fotos rescatista + push notifications |

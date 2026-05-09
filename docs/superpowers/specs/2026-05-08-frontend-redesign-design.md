# AEROFINDER Frontend Redesign — Design Spec
**Date:** 2026-05-08  
**Status:** Approved

---

## Overview

Rediseño completo del frontend de AEROFINDER con estilo **Modern Clean** (claro, aireado, profesional), sidebar colapsable + topbar fija, y todos los datos consumidos exclusivamente del backend real — sin datos hardcodeados.

---

## Visual Direction

- **Paleta**: Blanco/slate para fondos, `#2563eb` (blue-600) como color primario, status colors semánticos (green=activo, amber=alerta, red=urgente, purple=admin).
- **Tipografía**: Inter (ya disponible vía Next.js). Escala: 10px labels, 12-13px body, 19-22px títulos.
- **Componentes**: Tarjetas con `border border-slate-200 rounded-xl shadow-sm`, íconos SVG inline (Lucide-style, sin dependencia externa).
- **Sin librerías de componentes externas**: Tailwind CSS puro, sin shadcn/ui ni Radix.

---

## Layout Shell

### Topbar (52px, fija)
- Izquierda: botón logo (toggle sidebar) + divider + breadcrumb dinámico
- Derecha: rol chip del usuario, botón búsqueda, campana de alertas con badge (unreadCount del store), avatar con iniciales
- Datos: `useAuthStore` (rol, nombre), `useNotificationsStore` (unreadCount)

### Sidebar colapsable
- **Colapsado (52px)**: solo íconos SVG, tooltip en hover con el label
- **Expandido (216px)**: íconos + labels + nav-pills con contadores en tiempo real
- **Secciones**: agrupa nav items con labels de sección (Operaciones / Admin)
- **Toggle**: botón circular flotante en borde del sidebar
- **Badges en tiempo real**: misiones activas, alertas generadas, field reports pendientes — todos desde el store/API
- **Logout** al fondo del sidebar

### Main content
- `overflow-y: auto`, padding `20px 22px`
- Fondo `bg-slate-100` (#f1f5f9)

---

## Páginas a rediseñar

### 1. Dashboard (`/dashboard`) — diferenciado por rol

**Admin / Buscador:**
- **Topbar** + breadcrumb "Dashboard / Panel de administración"
- **KPI row** (6 tarjetas para admin, 4 para buscador):
  - Misiones activas → `missionsApi.list()` filtrado por `status === 'active'`
  - Drones volando → `dronesApi.list()` filtrado por `status === 'flying'`
  - Alertas generadas → `alertsApi.list()` filtrado por `status === 'generated'`
  - Detecciones hoy → `detectionsApi.list()` filtrado por fecha actual
  - Field reports pendientes (solo admin) → `fieldReportsApi` por misión activa
  - Usuarios activos (solo admin) → `usersApi.list()` filtrado por `is_active`
- **Grid principal**:
  - Misiones: lista con `recognition_active` + `face_recognition_active` visibles como badge IA
  - Feed WS en vivo: mensajes `detection` / `alert` / `telemetry` del WebSocket de misión
  - Detecciones: `yolo_confidence` + `facenet_similarity` con barra de progreso visual
  - Alertas: diferenciadas por `content_level` (full=rojo/partial=amarillo/confirmation_only=azul)
  - Flota drones: `status` con dot animado, batería desde telemetría WS, link `hls_url`
  - Field reports pendientes (solo admin): inline approve/reject con `fieldReportsApi.approve/reject`

**Ayudante:**
- KPI: alertas pendientes + total alertas
- Lista de alertas recientes

**Familiar:**
- Redirige a `/dashboard/familiar` (sin cambio de lógica)

---

### 2. Misiones (`/dashboard/missions`)
- Tabla/lista con filtros por status (pills de filtro)
- Columnas: nombre, persona buscada, estado, drones asignados, IA activa, fecha inicio
- Botón "Nueva misión" (admin/buscador)
- Click en fila → detail page

### 3. Detalle de misión (`/dashboard/missions/[id]`)
- Layout: mapa 65% izquierda | panel derecho 35%
- Mapa Leaflet: marcadores drones + marcadores detecciones con coordenadas GPS reales
- Panel derecho tabs: Video / Info / Alertas
  - Video: `DroneVideoMosaic` existente (HLS)
  - Info: estado misión, controles start/pause/complete/cancel, toggle YOLO y FaceNet
  - Alertas: lista de alertas de esta misión
- Datos en tiempo real via WS `/ws/missions/{id}`

### 4. Personas (`/dashboard/persons`)
- Grid de tarjetas con foto (presigned URL) o avatar placeholder
- Chips de estado de búsqueda
- Buscador por nombre

### 5. Detalle persona (`/dashboard/persons/[id]`)
- Sin cambios funcionales, solo aplicar nuevo estilo visual

### 6. Detecciones (`/dashboard/detections`)
- Tabla con filtros: misión, fecha, confianza mínima
- Columnas: snapshot thumb, persona, misión, YOLO%, FaceNet%, GPS (solo admin/buscador), fecha
- Sin cambios de lógica

### 7. Alertas (`/dashboard/alerts`)
- Lista con badge de nivel (full/partial/confirmation_only)
- Acciones: confirmar / descartar
- Sin cambios de lógica

### 8. Drones (`/dashboard/drones`)
- Lista con RTMP URL copiable, badge `auto_created`
- Sin cambios de lógica

### 9. Usuarios, Config, Auditoría, Revisión
- Aplicar nuevo estilo visual sin cambios de lógica

### 10. Familiar flow (`/dashboard/familiar`, `/dashboard/familiar/report`, `/dashboard/notifications`)
- Aplicar nuevo estilo visual

---

## Sistema de componentes nuevo/actualizado

| Componente | Descripción |
|---|---|
| `AppShell` | Topbar + Sidebar + main wrapper. Reemplaza el layout actual. |
| `Sidebar` | Colapsable, con secciones y badges en tiempo real |
| `KpiCard` | Tarjeta de estadística: icono + valor + label + trend badge |
| `StatBadge` | Badge de tendencia (up/warn/neutral) |
| `LiveFeed` | Feed WS — lista scrollable de eventos con tipo y timestamp |
| `DroneStatusRow` | Fila de estado de drone con dot animado + barra batería |
| `DetectionRow` | Fila de detección con barras de confianza YOLO + FaceNet |
| `AlertRow` | Fila de alerta con barra lateral por content_level |
| `FieldReportRow` | Fila de field report con botones approve/reject |
| `MissionRow` | Fila de misión con badge IA (recognition_active/face_recognition_active) |
| `StatusChip` | Chip de estado con color semántico |
| `PageHeader` | Título + subtítulo + slot de acciones (botones) |
| `SectionCard` | Card con header (título + link) y body slot |

---

## Datos y APIs

**Regla absoluta**: ningún dato hardcodeado. Todo de API o WebSocket.

| Widget | API / Source |
|---|---|
| KPI misiones activas | `missionsApi.list()` → filter `status==='active'` |
| KPI drones volando | `dronesApi.list()` → filter `status==='flying'` |
| KPI alertas generadas | `alertsApi.list()` → filter `status==='generated'` |
| KPI detecciones hoy | `detectionsApi.list()` → filter `frame_timestamp` today |
| KPI field reports | `fieldReportsApi.listByMission(activeMissionId)` → filter `status==='pending'` |
| KPI usuarios activos | `usersApi.list()` → filter `is_active` |
| Feed en vivo | WS `/ws/missions/{id}` — mensajes `detection`, `alert`, `mission_update` |
| Batería drones | WS `/ws/telemetry/{drone_id}` — campo `battery_level` |
| Snapshot detección | `detection.snapshot_url` (presigned MinIO, 1h) |

---

## WebSocket — integración en dashboard

El dashboard admin suscribe un WS de alertas globales (`/ws/alerts`) para actualizar en tiempo real:
- Badge de campana (`unreadCount`)
- Feed en vivo
- KPI de alertas generadas

Para drones flying: suscribir `/ws/telemetry/{drone_id}` por cada drone con `status !== 'offline'`.

---

## Estados de carga y error

- **Loading**: `Skeleton` components (ya existen) en cada sección
- **Error**: mensaje inline con botón "Reintentar" (no bloquea el resto de la página)
- **Empty**: `EmptyState` existente con mensaje contextual

---

## Archivos a crear/modificar

**Modificar:**
- `frontend/src/app/dashboard/layout.tsx` — nuevo AppShell (Topbar + Sidebar colapsable)
- `frontend/src/app/dashboard/page.tsx` — dashboard con KPIs reales + grid completo
- `frontend/src/app/globals.css` — fuente Inter, variables CSS

**Crear:**
- `frontend/src/components/layout/AppShell.tsx`
- `frontend/src/components/layout/Sidebar.tsx`
- `frontend/src/components/layout/Topbar.tsx`
- `frontend/src/components/dashboard/KpiCard.tsx`
- `frontend/src/components/dashboard/LiveFeed.tsx`
- `frontend/src/components/dashboard/DroneStatusRow.tsx`
- `frontend/src/components/dashboard/DetectionRow.tsx`
- `frontend/src/components/dashboard/AlertRow.tsx`
- `frontend/src/components/dashboard/FieldReportRow.tsx`
- `frontend/src/components/dashboard/MissionRow.tsx`

**Resto de páginas:** aplicar nuevo estilo sin cambiar lógica.

---

## Fuera de alcance

- PWA rescatistas (`/app/*`) — no se toca
- Backend — ningún cambio
- Lógica de autenticación, WebSockets, stores — sin cambios

# Super Admin Dashboard — Diseño aprobado

**Fecha:** 2026-05-24  
**Enfoque:** Opción B — Separación total de interfaces

---

## 1. Resumen

Se introduce el rol `super_admin` como cúspide de la jerarquía. El `admin` pierde acceso a config técnica y gestión de otros admins. La separación es estructural (backend + frontend), no solo cosmética.

**Jerarquía:** `super_admin > admin > buscador/ayudante/familiar`

---

## 2. Backend

### 2.1 Nuevo rol

- Agregar `super_admin` al enum `RoleName` en `backend/app/models/enums.py`
- Migración Alembic `0009_superadmin_role.py`: INSERT en tabla `roles`

### 2.2 Cambios de permisos

| Endpoint | Antes | Después |
|---|---|---|
| `POST /users/` con `role=admin` | cualquier admin | solo `super_admin` |
| `PATCH /users/{id}` cambiando rol a `admin` | cualquier admin | solo `super_admin` |
| `GET /config/network-info` | admin | `super_admin` |
| `GET /dashboard/config` (system_config) | admin | `super_admin` |
| `GET /audit-logs/` | admin | `super_admin` |
| `DELETE /users/{id}/hard` | no existe | solo `super_admin` |

### 2.3 Nuevos endpoints

- `GET /superadmin/health` — estado de Redis, MinIO, AI Worker, MediaMTX (ping real)
- `GET /superadmin/admins` — lista usuarios con `role=admin`
- `GET /superadmin/sessions` — todas las sesiones activas con IP y user-agent
- `DELETE /superadmin/sessions/{session_id}` — revocar sesión específica
- `DELETE /users/{id}/hard` — borrado definitivo con body `{"confirm": true}`
- `GET /superadmin/soft-deleted` — entidades con soft delete pendientes de purga

---

## 3. Frontend

### 3.1 Super Admin — `/dashboard/superadmin`

**Sidebar** — misma shell que el dashboard actual (blanco, slate, azul activo), con grupos desplegables (accordion):
- **Sistema**: Resumen, Infraestructura, Estado de workers
- **Accesos críticos**: Gestión de admins, Sesiones activas
- **Seguridad**: Auditoría profunda, Borrados definitivos
- **Configuración**: Parámetros del sistema, Red y URLs de drones, Umbrales de IA

**Página principal (Resumen):**
- Stats: admins activos, servicios saludables, advertencias, eventos críticos
- Cards de salud de infraestructura (Redis ping, MinIO uso, AI Worker fps/latencia, MediaMTX streams) — datos de `GET /superadmin/health`
- Tabla de sesiones activas con botón revocar — datos de `GET /superadmin/sessions`
- Tabla de administradores — datos de `GET /superadmin/admins`
- Auditoría reciente — datos de `GET /audit-logs/`
- Parámetros del sistema editables — datos de `GET /config/`
- Zona de borrado definitivo — datos de `GET /superadmin/soft-deleted`

**Rutas nuevas:**
- `/dashboard/superadmin` — resumen principal
- `/dashboard/superadmin/infrastructure` — salud detallada
- `/dashboard/superadmin/admins` — CRUD de cuentas admin
- `/dashboard/superadmin/sessions` — sesiones activas
- `/dashboard/superadmin/audit` — auditoría profunda completa
- `/dashboard/superadmin/hard-delete` — zona de borrado definitivo
- `/dashboard/superadmin/config` — parámetros sistema + red + umbrales IA

### 3.2 Admin — `/dashboard/admin` (simplificado)

**Sidebar** — mismos colores, grupos desplegables:
- **Operaciones**: Panel, Misiones, Detecciones, Alertas, Revisión pendiente
- **Recursos**: Drones, Personal de campo, Personas buscadas

**Admin ya NO ve:** config de red, parámetros del sistema, auditoría, gestión de usuarios con rol admin.

**Admin SÍ puede:** crear/editar buscadores, ayudantes y familiares (no admins).

**Página principal:**
- Stats: misiones activas, drones en vuelo, revisiones pendientes, personal activo
- Misiones activas con acciones directas
- Alertas recientes en tiempo real
- Revisiones pendientes con prioridad
- Tabla de personal de campo (buscador/ayudante)
- Flota de drones

### 3.3 README

- Eliminar referencias a "DJI Mini 2" específicamente
- Reemplazar por "cualquier dron con soporte RTMP" 
- Agregar fila `super_admin` en tabla de roles
- Actualizar tabla de stack (quitar mención específica al dron)

### 3.4 Componentes compartidos

- `SuperAdminGuard` — RoleGuard específico para `super_admin`
- `CollapsibleNavGroup` — grupo de nav accordion reutilizable para el sidebar (ambos roles)
- `InfraHealthCard` — card de salud de servicio con dot de color
- `HardDeleteModal` — modal de confirmación con input de texto explícito

---

## 4. Datos del backend enlazados

| Sección UI | Endpoint |
|---|---|
| Salud infraestructura | `GET /superadmin/health` |
| Sesiones activas | `GET /superadmin/sessions` |
| Gestión admins | `GET /superadmin/admins` |
| Auditoría | `GET /audit-logs/` |
| Parámetros sistema | `GET /config/` + `PATCH /config/{key}` |
| Red / URLs drones | `GET /config/network-info` |
| Soft-deleted pendientes | `GET /superadmin/soft-deleted` |
| Misiones (admin) | `GET /missions/` |
| Alertas (admin) | `GET /alerts/` |
| Detecciones pendientes | `GET /detections/?reviewed=false` |
| Personal (admin) | `GET /users/?role=buscador,ayudante` |
| Drones (admin) | `GET /drones/` |

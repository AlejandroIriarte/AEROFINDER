# Reorganización de Vistas por Rol

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganizar las vistas del dashboard según roles: fusionar super_admin+admin en una sola vista completa, separar buscador como rescatista principal con vista operativa completa, simplificar ayudante, y añadir alertas confirmadas para familiar.

**Architecture:** Cambios exclusivamente en frontend. El backend y permisos no se tocan. El Sidebar es la pieza central — controla qué ve cada rol. La página de notificaciones del familiar se extiende con una sección de alertas confirmadas REST.

**Tech Stack:** Next.js 14 App Router, Zustand, TypeScript.

---

## Nueva matriz de vistas

| Rol | Dashboard landing | Secciones en Sidebar |
|-----|------------------|----------------------|
| `super_admin` + `admin` | Panel técnico (superadmin) | Técnico (infra, usuarios, sesiones, audit, config, red) + Operativo (misiones, personas, drones, detecciones, alertas, revisión) |
| `buscador` | Panel operativo | Misiones, Personas, Drones, Detecciones, Alertas, Revisión pendiente |
| `ayudante` | Alertas recientes | Misiones (vista), Detecciones, Alertas, Revisión pendiente |
| `familiar` | Mis casos | Mis casos, Reportar, Alertas en tiempo real (face_match + confirmadas) |

---

## Archivos modificados

- `frontend/src/components/layout/Sidebar.tsx` — reescritura de bloques por rol
- `frontend/src/app/dashboard/notifications/page.tsx` — añadir sección "Confirmadas por el equipo"

---

## Task 1: Sidebar — fusionar super_admin+admin, separar buscador, simplificar ayudante

**Files:**
- Modify: `frontend/src/components/layout/Sidebar.tsx`

El archivo tiene ~280 líneas. Los bloques de rol están en la función `Sidebar` dentro del `<nav>`.

### Cambio 1: super_admin y admin comparten la misma vista completa

Reemplazar los dos bloques separados (`{role === "super_admin" && ...}` y `{role === "admin" && ...}`) por uno solo que aplica a ambos:

- [ ] **Step 1: Fusionar bloques super_admin + admin**

Localizar la línea donde comienza el bloque `{role === "super_admin" && (` (~línea 105) y reemplazar ambos bloques hasta el cierre del bloque de `admin` (~línea 172) con:

```tsx
{/* ── SUPER ADMIN + ADMIN ─────────────────────────────── */}
{(role === "super_admin" || role === "admin") && (
  <>
    {isOpen ? (
      <>
        <CollapsibleNavGroup label="Operaciones" storageKey="sa_ops" defaultOpen={true}>
          <NavLink href="/dashboard/admin" label="Panel" icon={Icons.home} isOpen={isOpen} isActive={pathname === "/dashboard/admin"} />
          <NavLink href="/dashboard/missions" label="Misiones" icon={Icons.missions} isOpen={isOpen} isActive={isActive("/dashboard/missions")} badge={badges.missions} badgeColor="blue" />
          <NavLink href="/dashboard/persons" label="Personas buscadas" icon={Icons.persons} isOpen={isOpen} isActive={isActive("/dashboard/persons")} />
          <NavLink href="/dashboard/drones" label="Drones" icon={Icons.drones} isOpen={isOpen} isActive={isActive("/dashboard/drones")} />
          <NavLink href="/dashboard/detections" label="Detecciones" icon={Icons.detections} isOpen={isOpen} isActive={isActive("/dashboard/detections")} badge={badges.detections} badgeColor="amber" />
          <NavLink href="/dashboard/alerts" label="Alertas" icon={Icons.alerts} isOpen={isOpen} isActive={isActive("/dashboard/alerts")} badge={badges.alerts} badgeColor="red" />
          <NavLink href="/dashboard/admin/pending-review" label="Revisión pendiente" icon={Icons.review} isOpen={isOpen} isActive={isActive("/dashboard/admin/pending-review")} badge={badges.review} badgeColor="amber" />
        </CollapsibleNavGroup>
        <CollapsibleNavGroup label="Sistema" storageKey="sa_sistema" defaultOpen={false}>
          <NavLink href="/dashboard/superadmin" label="Resumen técnico" icon={Icons.home} isOpen={isOpen} isActive={pathname === "/dashboard/superadmin"} />
          <NavLink href="/dashboard/superadmin/infrastructure" label="Infraestructura" icon={Icons.health} isOpen={isOpen} isActive={isActive("/dashboard/superadmin/infrastructure")} />
          <NavLink href="/dashboard/superadmin/users" label="Usuarios del sistema" icon={Icons.users} isOpen={isOpen} isActive={isActive("/dashboard/superadmin/users")} />
          <NavLink href="/dashboard/superadmin/sessions" label="Sesiones activas" icon={Icons.lock} isOpen={isOpen} isActive={isActive("/dashboard/superadmin/sessions")} />
          <NavLink href="/dashboard/superadmin/audit" label="Auditoría" icon={Icons.logs} isOpen={isOpen} isActive={isActive("/dashboard/superadmin/audit")} />
          <NavLink href="/dashboard/superadmin/hard-delete" label="Borrados definitivos" icon={Icons.trash} isOpen={isOpen} isActive={isActive("/dashboard/superadmin/hard-delete")} />
        </CollapsibleNavGroup>
        <CollapsibleNavGroup label="Configuración" storageKey="sa_config" defaultOpen={false}>
          <NavLink href="/dashboard/superadmin/config" label="Parámetros del sistema" icon={Icons.config} isOpen={isOpen} isActive={isActive("/dashboard/superadmin/config")} />
          <NavLink href="/dashboard/superadmin/network" label="Red y URLs de drones" icon={Icons.network} isOpen={isOpen} isActive={isActive("/dashboard/superadmin/network")} />
        </CollapsibleNavGroup>
      </>
    ) : (
      <>
        <NavLink href="/dashboard/admin" label="Panel" icon={Icons.home} isOpen={false} isActive={pathname === "/dashboard/admin"} />
        <NavLink href="/dashboard/missions" label="Misiones" icon={Icons.missions} isOpen={false} isActive={isActive("/dashboard/missions")} badge={badges.missions} badgeColor="blue" />
        <NavLink href="/dashboard/persons" label="Personas" icon={Icons.persons} isOpen={false} isActive={isActive("/dashboard/persons")} />
        <NavLink href="/dashboard/drones" label="Drones" icon={Icons.drones} isOpen={false} isActive={isActive("/dashboard/drones")} />
        <NavLink href="/dashboard/detections" label="Detecciones" icon={Icons.detections} isOpen={false} isActive={isActive("/dashboard/detections")} badge={badges.detections} badgeColor="amber" />
        <NavLink href="/dashboard/alerts" label="Alertas" icon={Icons.alerts} isOpen={false} isActive={isActive("/dashboard/alerts")} badge={badges.alerts} badgeColor="red" />
        <NavLink href="/dashboard/admin/pending-review" label="Revisión" icon={Icons.review} isOpen={false} isActive={isActive("/dashboard/admin/pending-review")} badge={badges.review} badgeColor="amber" />
        <NavLink href="/dashboard/superadmin" label="Técnico" icon={Icons.health} isOpen={false} isActive={isActive("/dashboard/superadmin")} />
        <NavLink href="/dashboard/superadmin/config" label="Config" icon={Icons.config} isOpen={false} isActive={isActive("/dashboard/superadmin/config")} />
      </>
    )}
  </>
)}
```

### Cambio 2: buscador — vista operativa completa (separado de ayudante)

Localizar el bloque `{(role === "buscador" || role === "ayudante") && (` (~línea 177) y reemplazarlo con dos bloques independientes:

- [ ] **Step 2: Separar buscador con vista completa**

```tsx
{/* ── BUSCADOR (RESCATISTA PRINCIPAL) ──────────────────── */}
{role === "buscador" && (
  <>
    {isOpen ? (
      <CollapsibleNavGroup label="Operaciones" storageKey="bus_ops" defaultOpen={true}>
        <NavLink href="/dashboard" label="Dashboard" icon={Icons.home} isOpen={isOpen} isActive={pathname === "/dashboard"} />
        <NavLink href="/dashboard/missions" label="Misiones" icon={Icons.missions} isOpen={isOpen} isActive={isActive("/dashboard/missions")} badge={badges.missions} badgeColor="blue" />
        <NavLink href="/dashboard/persons" label="Personas buscadas" icon={Icons.persons} isOpen={isOpen} isActive={isActive("/dashboard/persons")} />
        <NavLink href="/dashboard/drones" label="Drones" icon={Icons.drones} isOpen={isOpen} isActive={isActive("/dashboard/drones")} />
        <NavLink href="/dashboard/detections" label="Detecciones" icon={Icons.detections} isOpen={isOpen} isActive={isActive("/dashboard/detections")} badge={badges.detections} badgeColor="amber" />
        <NavLink href="/dashboard/alerts" label="Alertas" icon={Icons.alerts} isOpen={isOpen} isActive={isActive("/dashboard/alerts")} badge={badges.alerts} badgeColor="red" />
        <NavLink href="/dashboard/admin/pending-review" label="Revisión pendiente" icon={Icons.review} isOpen={isOpen} isActive={isActive("/dashboard/admin/pending-review")} badge={badges.review} badgeColor="amber" />
      </CollapsibleNavGroup>
    ) : (
      <>
        <NavLink href="/dashboard" label="Dashboard" icon={Icons.home} isOpen={false} isActive={pathname === "/dashboard"} />
        <NavLink href="/dashboard/missions" label="Misiones" icon={Icons.missions} isOpen={false} isActive={isActive("/dashboard/missions")} badge={badges.missions} badgeColor="blue" />
        <NavLink href="/dashboard/persons" label="Personas" icon={Icons.persons} isOpen={false} isActive={isActive("/dashboard/persons")} />
        <NavLink href="/dashboard/drones" label="Drones" icon={Icons.drones} isOpen={false} isActive={isActive("/dashboard/drones")} />
        <NavLink href="/dashboard/detections" label="Detecciones" icon={Icons.detections} isOpen={false} isActive={isActive("/dashboard/detections")} badge={badges.detections} badgeColor="amber" />
        <NavLink href="/dashboard/alerts" label="Alertas" icon={Icons.alerts} isOpen={false} isActive={isActive("/dashboard/alerts")} badge={badges.alerts} badgeColor="red" />
        <NavLink href="/dashboard/admin/pending-review" label="Revisión" icon={Icons.review} isOpen={false} isActive={isActive("/dashboard/admin/pending-review")} badge={badges.review} badgeColor="amber" />
      </>
    )}
  </>
)}

{/* ── AYUDANTE ─────────────────────────────────────────── */}
{role === "ayudante" && (
  <>
    {isOpen ? (
      <CollapsibleNavGroup label="Seguimiento" storageKey="ayu_seg" defaultOpen={true}>
        <NavLink href="/dashboard" label="Dashboard" icon={Icons.home} isOpen={isOpen} isActive={pathname === "/dashboard"} />
        <NavLink href="/dashboard/missions" label="Misiones" icon={Icons.missions} isOpen={isOpen} isActive={isActive("/dashboard/missions")} badge={badges.missions} badgeColor="blue" />
        <NavLink href="/dashboard/detections" label="Detecciones" icon={Icons.detections} isOpen={isOpen} isActive={isActive("/dashboard/detections")} badge={badges.detections} badgeColor="amber" />
        <NavLink href="/dashboard/alerts" label="Alertas" icon={Icons.alerts} isOpen={isOpen} isActive={isActive("/dashboard/alerts")} badge={badges.alerts} badgeColor="red" />
        <NavLink href="/dashboard/admin/pending-review" label="Revisión pendiente" icon={Icons.review} isOpen={isOpen} isActive={isActive("/dashboard/admin/pending-review")} badge={badges.review} badgeColor="amber" />
      </CollapsibleNavGroup>
    ) : (
      <>
        <NavLink href="/dashboard" label="Dashboard" icon={Icons.home} isOpen={false} isActive={pathname === "/dashboard"} />
        <NavLink href="/dashboard/missions" label="Misiones" icon={Icons.missions} isOpen={false} isActive={isActive("/dashboard/missions")} badge={badges.missions} badgeColor="blue" />
        <NavLink href="/dashboard/detections" label="Detecciones" icon={Icons.detections} isOpen={false} isActive={isActive("/dashboard/detections")} badge={badges.detections} badgeColor="amber" />
        <NavLink href="/dashboard/alerts" label="Alertas" icon={Icons.alerts} isOpen={false} isActive={isActive("/dashboard/alerts")} badge={badges.alerts} badgeColor="red" />
        <NavLink href="/dashboard/admin/pending-review" label="Revisión" icon={Icons.review} isOpen={false} isActive={isActive("/dashboard/admin/pending-review")} badge={badges.review} badgeColor="amber" />
      </>
    )}
  </>
)}
```

### Cambio 3: familiar — sin cambios en nav, renombrar "Notificaciones" a "Alertas en tiempo real"

- [ ] **Step 3: Actualizar label del nav de notificaciones para familiar**

En el bloque `{role === "familiar" && (` (~línea 201), cambiar el NavLink de notificaciones:

```tsx
// ANTES:
<NavLink href="/dashboard/notifications" label="Notificaciones" icon={Icons.bell} isOpen={isOpen} isActive={isActive("/dashboard/notifications")} />

// DESPUÉS:
<NavLink href="/dashboard/notifications" label="Alertas en tiempo real" icon={Icons.bell} isOpen={isOpen} isActive={isActive("/dashboard/notifications")} />
```

### Cambio 4: enlace "Conectar" incluye buscador pero no admin (ya lo tiene en el panel)

- [ ] **Step 4: Actualizar la condición del enlace Conectar al final del Sidebar**

```tsx
// ANTES (~línea 213):
{(role === "buscador" || role === "admin") && (
  <NavLink href="/connect" label="Conectar" icon={Icons.connect} isOpen={isOpen} isActive={pathname === "/connect"} />
)}

// DESPUÉS:
{role === "buscador" && (
  <NavLink href="/connect" label="Conectar" icon={Icons.connect} isOpen={isOpen} isActive={pathname === "/connect"} />
)}
```

- [ ] **Step 5: Verificar que el archivo compila sin errores de TypeScript**

```bash
cd /home/wiz/aerofinder/frontend
npx tsc --noEmit 2>&1 | grep -i "sidebar\|error" | head -20
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/layout/Sidebar.tsx
git commit -m "feat(frontend): reorganize sidebar views — super_admin+admin merged, buscador full ops, ayudante simplified"
```

---

## Task 2: Familiar — sección de alertas confirmadas por el equipo

**Files:**
- Modify: `frontend/src/app/dashboard/notifications/page.tsx`

La página actual ya muestra detecciones `face_match` en tiempo real vía WebSocket. Falta una sección que muestre **alertas ya confirmadas por buscador o ayudante** (obtenidas del REST API, campo `status = "confirmed"` en la tabla `alerts`).

El modelo `alerts` tiene `status: AlertStatus` con valores `generated | confirmed | ...`. La API `alertsApi.list()` ya devuelve alertas. Filtramos por `status === "confirmed"`.

- [ ] **Step 1: Añadir estado para alertas confirmadas en NotificationsPage**

En el componente `NotificationsPage` (~línea donde se declaran los estados), añadir:

```typescript
const [confirmedAlerts, setConfirmedAlerts] = useState<Alert[]>([]);
```

- [ ] **Step 2: Cargar alertas confirmadas junto a la misión activa**

En el `useEffect` que llama a `Promise.all([missionsApi.list(), personsApi.list(), alertsApi.list()])`, extender el `.then` para separar las alertas confirmadas:

```typescript
.then(([missions, persons, allAlerts]) => {
  if (cancelled) return;
  // ... lógica existente ...

  // AÑADIR: separar alertas confirmadas por el equipo
  const confirmed = allAlerts.filter(
    (a) => a.status === "confirmed" && a.detection_id
  );
  setConfirmedAlerts(confirmed);

  // Alertas de sistema (notificaciones de cierre de misión, sin detection_id)
  setSystemAlerts(allAlerts.filter((a) => !a.detection_id && a.message_text));
})
```

> **Nota**: Verificar que el tipo `Alert` en `frontend/src/lib/types.ts` tiene el campo `status`. Si no existe, añadir `status?: string` al tipo `Alert`.

- [ ] **Step 3: Verificar campo status en el tipo Alert**

```bash
grep -n "status\|Alert" /home/wiz/aerofinder/frontend/src/lib/types.ts | head -20
```

Si `Alert` no tiene `status`, añadir al tipo:

```typescript
export interface Alert {
  // ...campos existentes...
  status?: "generated" | "confirmed" | "sent" | "failed";
}
```

- [ ] **Step 4: Añadir sección visual "Confirmadas por el equipo" en el JSX**

En el bloque principal del return (dentro del `!loadingMission && mission` branch), antes de la sección de detecciones WS (`alerts.length === 0 && !missionEnded`), añadir:

```tsx
{/* Alertas confirmadas por el equipo */}
{confirmedAlerts.length > 0 && (
  <div className="space-y-3">
    <div className="flex items-center gap-2">
      <span className="h-2 w-2 rounded-full bg-green-500" />
      <p className="text-[12px] font-semibold text-slate-600 uppercase tracking-wider">
        Confirmadas por el equipo ({confirmedAlerts.length})
      </p>
    </div>
    {confirmedAlerts.map((alert) => (
      <div
        key={alert.id}
        className="flex items-start gap-3 rounded-xl border border-green-200 bg-green-50 p-4"
      >
        {/* Ícono de check */}
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-100">
          <svg className="h-5 w-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-green-800">
            Coincidencia confirmada por el equipo de búsqueda
          </p>
          {alert.message_text && (
            <p className="mt-0.5 text-[12px] text-green-700">{alert.message_text}</p>
          )}
          <p className="mt-1 text-[10px] text-green-500">
            {new Date(alert.generated_at).toLocaleString("es-BO", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </p>
        </div>
      </div>
    ))}
  </div>
)}
```

- [ ] **Step 5: Verificar que el tipo Alert tiene generated_at y message_text**

```bash
grep -n "generated_at\|message_text\|interface Alert" /home/wiz/aerofinder/frontend/src/lib/types.ts
```

Si faltan campos, añadirlos al tipo `Alert`.

- [ ] **Step 6: Build para verificar que no hay errores**

```bash
cd /home/wiz/aerofinder/frontend && npm run build 2>&1 | tail -30
```

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/dashboard/notifications/page.tsx frontend/src/lib/types.ts
git commit -m "feat(frontend): familiar notifications — add confirmed-by-team alerts section"
```

---

## Verificación final

- [ ] Iniciar sesión como `superadmin@aerofinder.local` → debe ver Operaciones + Sistema + Config en sidebar
- [ ] Iniciar sesión como `admin@aerofinder.local` → debe ver la misma vista que super_admin
- [ ] Crear un usuario con rol `buscador` → debe ver solo Operaciones (misiones, personas, drones, detecciones, alertas, revisión)
- [ ] Iniciar sesión como `ayudante` → debe ver solo misiones, detecciones, alertas, revisión (sin personas ni drones)
- [ ] Iniciar sesión como `familiar` → debe ver mis casos, reportar, alertas en tiempo real. La sección "Confirmadas por el equipo" aparece si hay alertas con `status=confirmed`

---

## Task 3: Fusionar Alertas + Detecciones — Para el lunes 2026-06-16

**Contexto:** Actualmente hay dos páginas que muestran la misma data desde ángulos distintos:
- `/dashboard/alerts` → cards con snapshot, confirmar/descartar, WS en tiempo real (acción)
- `/dashboard/detections` → tabla paginada filtrable, solo lectura (historial)

**Decisión de diseño:** Una sola página `/dashboard/detections` con dos tabs.
La ruta `/dashboard/alerts` desaparece y redirige a `/dashboard/detections`.
El Sidebar queda con un único link "Detecciones" con badge de pendientes.

**Files:**
- Rewrite: `frontend/src/app/dashboard/detections/page.tsx`
- Create: `frontend/src/app/dashboard/alerts/page.tsx` → redirect a `/dashboard/detections`
- Modify: `frontend/src/components/layout/Sidebar.tsx` → quitar link Alertas, badge unificado

**Layout propuesto:**
```
/dashboard/detections

┌──────────────────────────────────────────────────────┐
│  [Por revisar (N)]  [Historial]          ● En vivo   │
├──────────────────────────────────────────────────────┤
│ Tab "Por revisar":                                    │
│  Grid de cards (contenido actual de alerts/page.tsx) │
│  → Confirmar / Falso positivo por card               │
│  → Nuevas entradas en tiempo real (WS /ws/alerts)    │
├──────────────────────────────────────────────────────┤
│ Tab "Historial":                                     │
│  Tabla paginada con filtros (actual detections page) │
│  → Solo lectura, muestra estado final de cada det.   │
└──────────────────────────────────────────────────────┘
```

**Roles:**
- `super_admin` + `admin` + `buscador`: ven ambos tabs, pueden confirmar/descartar
- `ayudante`: ve ambos tabs, puede confirmar/descartar (es su rol principal)
- GPS visible solo para super_admin, admin, buscador — ayudante no ve coords

**Steps (a completar el lunes):**
- [ ] Reescribir `detections/page.tsx` con tabs: mover contenido de `alerts/page.tsx` al tab "Por revisar", mover tabla paginada al tab "Historial"
- [ ] Crear redirect en `alerts/page.tsx` → `redirect("/dashboard/detections")`
- [ ] Actualizar Sidebar: quitar NavLink de Alertas, renombrar Detecciones, unificar badge
- [ ] Verificar que el WS de alertas (`/ws/alerts`) sigue funcionando en el tab "Por revisar"
- [ ] Verificar que ayudante puede confirmar/descartar (actualmente alertsApi.acknowledge usa rol del token)

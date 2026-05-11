# Frontend — Fixes de Navegación y Páginas Rotas

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corregir páginas vacías/rotas y navegación rota en todo el frontend de AeroFinder, consolidando el panel admin.

**Architecture:** Fixes quirúrgicos archivo por archivo. Sin cambios de backend. Sin nuevas dependencias. Todo en Next.js 14 App Router + Tailwind + Zustand existentes.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind CSS, Zustand, axios

---

## Mapa de archivos

| Archivo | Acción | Motivo |
|---------|--------|--------|
| `frontend/src/app/dashboard/persons/page.tsx` | Modificar | `PersonCard.onClick` no navega — corregir a `router.push` |
| `frontend/src/app/login/page.tsx` | Modificar | Pre-llenar email desde `?email=` query param |
| `frontend/src/app/dashboard/layout.tsx` | Modificar | Breadcrumb dinámico para rutas `[id]` |
| `frontend/src/app/dashboard/admin/page.tsx` | Modificar | Consolidar: quitar duplicados de config/logs, añadir links |
| `frontend/src/components/layout/Sidebar.tsx` | Modificar | Añadir link `/connect` en footer |
| `frontend/src/components/dashboard/AlertRow.tsx` | Modificar | Hacer fila clickeable con link a misión (via detection) |
| `frontend/src/lib/types.ts` | Modificar | Añadir `mission_id` al interface `Detection` usado por alerts page |

---

## Task 1: Fix PersonCard — navegar a detalle de persona al hacer click

**Files:**
- Modify: `frontend/src/app/dashboard/persons/page.tsx`

El problema: `PersonCard` recibe `onClick: (p: MissingPerson) => void` que llama `setSelected(person)`, pero `selected` nunca se usa para navegar ni mostrar nada visible. La navegación al detalle está rota.

- [ ] **Localizar el handler en persons/page.tsx**

En `frontend/src/app/dashboard/persons/page.tsx`, encontrar:
```tsx
const [selected, setSelected] = useState<MissingPerson | null>(null);
```
y la llamada:
```tsx
onClick={(p) => setSelected(p)}
```

- [ ] **Reemplazar onClick por navegación directa**

Cambiar el handler en `PersonsPage` para que navegue en lugar de seleccionar:

```tsx
// Eliminar: const [selected, setSelected] = useState<MissingPerson | null>(null);

// Cambiar el map de personCards de:
onClick={(p) => setSelected(p)}
// a:
onClick={(p) => router.push(`/dashboard/persons/${p.id}`)}
```

Asegurarse de que `const router = useRouter();` ya está importado (sí está).

- [ ] **Verificar que no hay código que use `selected` para renderizar un modal**

Buscar `selected` en todo el archivo. Si hay un `{selected && <Modal ...>}` al final, eliminarlo también — la navegación al detalle de persona reemplaza esa necesidad.

- [ ] **Commit**

```bash
cd /home/wiz/aerofinder
git add frontend/src/app/dashboard/persons/page.tsx
git commit -m "fix: PersonCard navega a /dashboard/persons/[id] al hacer click"
```

---

## Task 2: Login — pre-llenar email desde query param

**Files:**
- Modify: `frontend/src/app/login/page.tsx`

El flujo de registro hace `router.push("/login?email=" + encodeURIComponent(email))` pero el login ignora ese param. Hay que leerlo al montar.

- [ ] **Añadir imports necesarios**

En `frontend/src/app/login/page.tsx`, añadir al bloque de imports:

```tsx
import { useSearchParams } from "next/navigation";
```

- [ ] **Leer el param y pre-llenar el estado**

Después de las declaraciones de estado existentes, añadir:

```tsx
const searchParams = useSearchParams();

// Pre-llenar email si viene del flujo de registro
useEffect(() => {
  const emailParam = searchParams.get("email");
  if (emailParam) setEmail(emailParam);
}, [searchParams]);
```

`useEffect` ya está importado.

- [ ] **Envolver el componente en Suspense en el layout raíz (si no está)**

`useSearchParams()` en Next.js 14 requiere que el componente esté dentro de `<Suspense>`. Verificar `frontend/src/app/layout.tsx`:

Si `LoginPage` no está envuelto en Suspense, envolver el `{children}` del layout raíz:

```tsx
import { Suspense } from "react";
// ...
<Suspense fallback={null}>{children}</Suspense>
```

Si ya existe un Suspense boundary, no duplicar.

- [ ] **Commit**

```bash
git add frontend/src/app/login/page.tsx frontend/src/app/layout.tsx
git commit -m "fix: login pre-llena email desde query param ?email= (flujo post-registro)"
```

---

## Task 3: Breadcrumb dinámico para rutas [id]

**Files:**
- Modify: `frontend/src/app/dashboard/layout.tsx`

El breadcrumb actual usa `BREADCRUMB_MAP` con rutas estáticas. Para `/dashboard/missions/UUID` muestra solo "Misiones" y para `/dashboard/persons/UUID` muestra "Personas". Hay que detectar los segmentos dinámicos.

- [ ] **Actualizar el hook `useBreadcrumb`**

En `frontend/src/app/dashboard/layout.tsx`, reemplazar la función `useBreadcrumb` completa:

```tsx
function useBreadcrumb(): string {
  const pathname = usePathname();

  // Rutas estáticas exactas
  const EXACT: Record<string, string> = {
    "/dashboard":                        "Inicio",
    "/dashboard/missions":               "Misiones",
    "/dashboard/persons":                "Personas",
    "/dashboard/detections":             "Detecciones",
    "/dashboard/drones":                 "Drones",
    "/dashboard/alerts":                 "Alertas",
    "/dashboard/admin":                  "Panel admin",
    "/dashboard/admin/pending-review":   "Revisión de casos",
    "/dashboard/users":                  "Usuarios",
    "/dashboard/config":                 "Configuración",
    "/dashboard/logs":                   "Auditoría",
    "/dashboard/familiar":               "Mis casos",
    "/dashboard/familiar/report":        "Reportar",
    "/dashboard/notifications":          "Notificaciones",
  };

  if (EXACT[pathname]) return EXACT[pathname];

  // Rutas dinámicas por patrón
  const missionMatch = pathname.match(/^\/dashboard\/missions\/[^/]+$/);
  if (missionMatch) return "Detalle de misión";

  const personMatch = pathname.match(/^\/dashboard\/persons\/[^/]+$/);
  if (personMatch) return "Detalle de persona";

  // Prefijo más largo
  const prefix = Object.keys(EXACT)
    .filter((k) => pathname.startsWith(k + "/"))
    .sort((a, b) => b.length - a.length)[0];
  return prefix ? EXACT[prefix] : "Dashboard";
}
```

- [ ] **Commit**

```bash
git add frontend/src/app/dashboard/layout.tsx
git commit -m "fix: breadcrumb dinámico para rutas [id] (misiones, personas)"
```

---

## Task 4: Consolidar panel admin — quitar duplicados, añadir links

**Files:**
- Modify: `frontend/src/app/dashboard/admin/page.tsx`

El admin page actual duplica SystemConfig (que tiene su propia página en `/config`) y tiene `setAuditLog([])` hardcodeado (nunca carga). Se convierte en una "sala de control" real: red info + stats rápidos + links a páginas especializadas.

- [ ] **Reescribir `AdminPage` eliminando secciones duplicadas**

Reemplazar el componente `AdminPage` completo (mantener `NetworkInfoSection`, `ActiveMissions`, `DroneFleet`, eliminar `AuditLogSection` y `SystemConfigTable` e importar `Link`):

```tsx
import Link from "next/link";

export default function AdminPage() {
  const [missions,    setMissions]    = useState<Mission[]>([]);
  const [drones,      setDrones]      = useState<Drone[]>([]);
  const [networkInfo, setNetworkInfo] = useState<NetworkInfo | null>(null);
  const [loadError,   setLoadError]   = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [m, d, n] = await Promise.all([
        missionsApi.list(),
        dronesApi.list(),
        systemApi.getNetworkInfo(),
      ]);
      setMissions(m);
      setDrones(d);
      setNetworkInfo(n);
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const activeMissions = missions.filter((m) => m.status === "active" || m.status === "planned");
  const flyingDrones   = drones.filter((d) => d.status === "in_mission");

  return (
    <RoleGuard allowedRoles={["admin"]}>
      <div className="p-6 space-y-8">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">Panel de control</h1>
          <button
            onClick={loadData}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Actualizar
          </button>
        </div>

        {loadError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            Error al cargar datos. Verifica tu conexión e intenta actualizar.
          </div>
        )}

        {/* Stats rápidos */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: "Misiones activas",  value: activeMissions.length,  color: "text-green-600" },
            { label: "Drones en vuelo",   value: flyingDrones.length,    color: "text-blue-600"  },
            { label: "Total misiones",    value: missions.length,        color: "text-slate-700" },
            { label: "Total drones",      value: drones.length,          color: "text-slate-700" },
          ].map((stat) => (
            <div key={stat.label} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm text-center">
              <p className={`text-3xl font-bold ${stat.color}`}>{stat.value}</p>
              <p className="mt-1 text-xs text-gray-500">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Links a herramientas admin */}
        <section>
          <h2 className="mb-3 text-sm font-semibold text-gray-700">Herramientas</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Link
              href="/dashboard/config"
              className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 hover:bg-slate-50 transition-colors shadow-sm"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-100">
                <svg viewBox="0 0 24 24" className="h-5 w-5 stroke-violet-600 fill-none" strokeWidth={1.8}>
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                </svg>
              </div>
              <div>
                <p className="text-[13px] font-semibold text-slate-800">Configuración</p>
                <p className="text-[11px] text-slate-500">Parámetros del sistema, umbrales IA</p>
              </div>
            </Link>

            <Link
              href="/dashboard/logs"
              className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 hover:bg-slate-50 transition-colors shadow-sm"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100">
                <svg viewBox="0 0 24 24" className="h-5 w-5 stroke-blue-600 fill-none" strokeWidth={1.8}>
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/>
                  <line x1="16" y1="17" x2="8" y2="17"/>
                </svg>
              </div>
              <div>
                <p className="text-[13px] font-semibold text-slate-800">Auditoría</p>
                <p className="text-[11px] text-slate-500">Log de cambios en la base de datos</p>
              </div>
            </Link>

            <Link
              href="/dashboard/users"
              className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 hover:bg-slate-50 transition-colors shadow-sm"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-100">
                <svg viewBox="0 0 24 24" className="h-5 w-5 stroke-green-600 fill-none" strokeWidth={1.8}>
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                  <circle cx="12" cy="7" r="4"/>
                </svg>
              </div>
              <div>
                <p className="text-[13px] font-semibold text-slate-800">Usuarios</p>
                <p className="text-[11px] text-slate-500">Gestión de cuentas y roles</p>
              </div>
            </Link>
          </div>
        </section>

        {networkInfo && <NetworkInfoSection info={networkInfo} />}
        <ActiveMissions missions={missions} />
        <DroneFleet drones={drones} />
      </div>
    </RoleGuard>
  );
}
```

- [ ] **Eliminar imports sin usar**

Quitar del bloque de imports al inicio del archivo:
- `AuditLog` de los tipos (si ya no se usa)
- Las interfaces/componentes `AuditLogSection` y `SystemConfigTable` definidas en el mismo archivo
- `systemApi.listConfig` del destructuring (si se elimina del `Promise.all`)

- [ ] **Commit**

```bash
git add frontend/src/app/dashboard/admin/page.tsx
git commit -m "refactor: panel admin — quitar duplicados, añadir links a config/logs/users"
```

---

## Task 5: Añadir /connect al Sidebar

**Files:**
- Modify: `frontend/src/components/layout/Sidebar.tsx`

La página `/connect` (QR + URLs del sistema) existe y funciona pero no está enlazada desde ningún lado. Se añade en el footer del sidebar, visible para admin y buscador (quienes instalan el sistema).

- [ ] **Añadir ícono QR al objeto `Icons`**

En `frontend/src/components/layout/Sidebar.tsx`, añadir al objeto `Icons`:

```tsx
connect: (
  <svg viewBox="0 0 24 24" className="h-[17px] w-[17px] stroke-current fill-none flex-shrink-0" strokeWidth={1.8}>
    <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
    <rect x="3" y="14" width="7" height="7"/>
    <path d="M14 14h.01M14 17h.01M17 14h.01M17 17h.01M20 14h.01M20 17h.01M20 20h.01M17 20h.01M14 20h.01"/>
  </svg>
),
```

- [ ] **Añadir el link en el footer del sidebar, entre nav y logout**

En el componente `Sidebar`, justo antes del botón de `logout`, añadir:

```tsx
{/* Link Conectar — admin y buscador */}
{(role === "admin" || role === "buscador") && (
  <Link
    href="/connect"
    title={isOpen ? undefined : "Conectar dispositivo"}
    className={`flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-slate-500 hover:bg-slate-50 hover:text-slate-800 transition-colors ${isOpen ? "w-full" : "w-9 justify-center"}`}
  >
    {Icons.connect}
    {isOpen && <span className="text-[13px] font-medium">Conectar</span>}
  </Link>
)}
```

- [ ] **Commit**

```bash
git add frontend/src/components/layout/Sidebar.tsx
git commit -m "feat: añadir link /connect en sidebar footer (admin y buscador)"
```

---

## Task 6: AlertRow — link a misión asociada en la página de alertas

**Files:**
- Modify: `frontend/src/app/dashboard/alerts/page.tsx`
- Modify: `frontend/src/lib/types.ts`

El tipo `Alert` no tiene `mission_id`. El backend retorna `detection_id`. Para no necesitar un fetch extra por alerta, añadimos `mission_id` al tipo `Alert` y lo usamos si está presente (el backend ya puede retornarlo via join, necesitamos verificar).

- [ ] **Verificar qué retorna el backend para alerts**

En el archivo `backend/app/schemas/alerts.py`, verificar si el schema de respuesta incluye `mission_id`. Si no, añadirlo.

Abrir `backend/app/schemas/alerts.py` y ver la clase `AlertResponse`. Si no tiene `mission_id`, añadir:

```python
mission_id: uuid.UUID | None = None
```

Si ya lo tiene, no cambiar nada.

- [ ] **Actualizar el router de alerts en backend para incluir mission_id (si no está)**

En `backend/app/routers/alerts.py`, verificar que el `SELECT` del endpoint de lista incluye el `mission_id` via join con `detections`. Si ya está en el schema de respuesta, el ORM lo tomará del modelo.

Si el modelo `Alert` no tiene `mission_id` directo pero `Detection` sí, añadir una propiedad al schema:

```python
# En AlertResponse
@computed_field
@property
def mission_id(self) -> uuid.UUID | None:
    return self.detection.mission_id if self.detection else None
```

Si esto requiere cargar `detection` eagerly en el router, añadir `.options(selectinload(Alert.detection))` al query.

**Si el cambio de backend es complejo** (requiere más de 5 minutos): SALTAR este sub-paso, dejar `mission_id: string | null = null` en el tipo TS y el link no se mostrará hasta que haya datos.

- [ ] **Actualizar el interface `Alert` en types.ts**

En `frontend/src/lib/types.ts`, añadir `mission_id` al interface `Alert`:

```ts
export interface Alert {
  id: string;
  detection_id: string;
  recipient_user_id: string | null;
  mission_id: string | null;          // ← añadir
  content_level: AlertContentLevel;
  status: AlertStatus;
  message_text: string | null;
  generated_at: string;
  updated_at: string;
}
```

- [ ] **Hacer la fila de alerta clickeable si hay mission_id**

En `frontend/src/app/dashboard/alerts/page.tsx`, en el map de alertas, envolver cada `AlertRow` en un link condicional:

```tsx
{filtered.map((alert) => (
  <div key={alert.id} className="flex items-start gap-0">
    <div
      className="flex-1 cursor-pointer"
      onClick={() => alert.mission_id && router.push(`/dashboard/missions/${alert.mission_id}`)}
      title={alert.mission_id ? "Ver misión" : undefined}
    >
      <AlertRow alert={alert} />
    </div>
    {/* botones confirm/dismiss existentes sin cambios */}
    {(alert.status === "generated" || alert.status === "sent") && (
      <div className="flex shrink-0 flex-col gap-1.5 px-4 py-2.5">
        <button onClick={() => handleConfirm(alert.id)} ...>✓ Confirmar</button>
        <button onClick={() => handleDismiss(alert.id)} ...>Descartar</button>
      </div>
    )}
  </div>
))}
```

Asegurarse de que `useRouter` está importado y `const router = useRouter()` declarado en el componente.

- [ ] **Commit**

```bash
git add frontend/src/lib/types.ts frontend/src/app/dashboard/alerts/page.tsx
git commit -m "feat: AlertRow navega a misión asociada al hacer click (si mission_id disponible)"
```

---

## Task 7: Fix logs page — mejorar mensaje de error y añadir paginación

**Files:**
- Modify: `frontend/src/app/dashboard/logs/page.tsx`

La página ya llama a `/audit-log/` correctamente. El problema es que ante cualquier error (incluso 404 o 500 transitorio) muestra "función no disponible" permanentemente. Mejoramos el mensaje y añadimos un botón de reintentar.

- [ ] **Añadir estado de error detallado y botón reintentar**

En `frontend/src/app/dashboard/logs/page.tsx`, reemplazar el bloque de carga:

```tsx
const [logs,        setLogs]        = useState<AuditLog[]>([]);
const [loading,     setLoading]     = useState(true);
const [error,       setError]       = useState<string | null>(null);

const load = useCallback(async () => {
  if (!isAdmin) return;
  setLoading(true);
  setError(null);
  try {
    const { data } = await api.get<AuditLog[]>("/audit-log/", { params: { limit: 100 } });
    setLogs(data);
  } catch (err: unknown) {
    const axiosErr = err as { response?: { status?: number } };
    if (axiosErr.response?.status === 403) {
      setError("Sin permisos para ver el log de auditoría.");
    } else {
      setError("Error al cargar el log. Intenta de nuevo.");
    }
  } finally {
    setLoading(false);
  }
}, [isAdmin]);

useEffect(() => { load(); }, [load]);
```

Añadir `useCallback` a los imports si no está.

- [ ] **Mostrar error con botón reintentar en lugar de "no disponible"**

Reemplazar el bloque `{unavailable && ...}` con:

```tsx
{!loading && error && (
  <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-center">
    <p className="text-sm text-amber-800">{error}</p>
    <button
      onClick={load}
      className="mt-3 rounded-lg bg-amber-600 px-4 py-2 text-sm text-white hover:bg-amber-700"
    >
      Reintentar
    </button>
  </div>
)}
```

- [ ] **Commit**

```bash
git add frontend/src/app/dashboard/logs/page.tsx
git commit -m "fix: logs page — error detallado con reintentar en lugar de 'no disponible'"
```

---

## Verificación final

- [ ] **Verificar navegación PersonCard**
  - Ir a `/dashboard/persons`, hacer click en cualquier card → debe navegar a `/dashboard/persons/[id]`

- [ ] **Verificar pre-llenado login**
  - Registrar usuario nuevo → redirección a `/login?email=...` → campo email pre-llenado

- [ ] **Verificar breadcrumbs dinámicos**
  - Entrar a `/dashboard/missions/[id]` → breadcrumb muestra "Detalle de misión"
  - Entrar a `/dashboard/persons/[id]` → breadcrumb muestra "Detalle de persona"

- [ ] **Verificar panel admin consolidado**
  - `/dashboard/admin` muestra stats + links (no duplica config/logs)
  - Links "Configuración", "Auditoría", "Usuarios" navegan correctamente

- [ ] **Verificar link Conectar**
  - Sidebar con rol admin/buscador muestra "Conectar" en footer
  - Click navega a `/connect` con QR funcional

- [ ] **Verificar logs page**
  - `/dashboard/logs` carga registros de auditoría correctamente
  - Si hay error, muestra mensaje claro + botón Reintentar

- [ ] **Commit final de verificación**

```bash
git add .
git commit -m "chore: verificación completa frontend fixes — navegación y páginas rotas"
```

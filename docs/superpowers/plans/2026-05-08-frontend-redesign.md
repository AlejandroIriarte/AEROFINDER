# Frontend Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rediseñar el frontend de AEROFINDER con estilo Modern Clean (topbar + sidebar colapsable), todos los datos consumidos del backend real, y un dashboard admin funcional con KPIs en vivo, detecciones, alertas, drones y field reports.

**Architecture:** Nuevo `AppShell` (Topbar + Sidebar colapsable) reemplaza el sidebar actual en `layout.tsx`. El dashboard usa hooks de datos reales por rol. Componentes de fila reutilizables (`MissionRow`, `AlertRow`, `DetectionRow`, `DroneStatusRow`, `FieldReportRow`, `LiveFeed`) componen el grid. Ningún dato hardcodeado.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind CSS (sin nuevas dependencias), APIs existentes en `lib/api.ts`, WebSocket hook existente en `lib/websocket.ts`.

---

## File Map

**Crear:**
- `frontend/src/components/layout/Topbar.tsx` — barra superior: logo/toggle, breadcrumb, rol chip, campana, avatar
- `frontend/src/components/layout/Sidebar.tsx` — nav colapsable con secciones, íconos SVG, badges
- `frontend/src/components/dashboard/KpiCard.tsx` — tarjeta KPI: ícono + valor + label + trend
- `frontend/src/components/dashboard/SectionCard.tsx` — card con header slot y children
- `frontend/src/components/dashboard/MissionRow.tsx` — fila de misión con badge IA
- `frontend/src/components/dashboard/AlertRow.tsx` — fila de alerta con barra content_level
- `frontend/src/components/dashboard/DetectionRow.tsx` — fila de detección con barras de confianza
- `frontend/src/components/dashboard/DroneStatusRow.tsx` — fila de drone con dot animado + batería
- `frontend/src/components/dashboard/FieldReportRow.tsx` — fila de field report con aprobar/rechazar
- `frontend/src/components/dashboard/LiveFeed.tsx` — feed WS scrollable de eventos en tiempo real
- `frontend/src/hooks/useDashboardData.ts` — hook que carga todos los datos del dashboard admin
- `frontend/src/hooks/useSidebarBadges.ts` — hook para badges en tiempo real del sidebar

**Modificar:**
- `frontend/src/app/globals.css` — Inter font, variables CSS, utilidades globales
- `frontend/src/app/layout.tsx` — importar Inter desde next/font
- `frontend/src/app/dashboard/layout.tsx` — reemplazar sidebar antiguo con Topbar + Sidebar
- `frontend/src/app/dashboard/page.tsx` — dashboard completo con datos reales por rol
- `frontend/src/lib/api.ts` — añadir `fieldReportsApi.approve/reject`, `detectionsApi` params
- `frontend/src/lib/types.ts` — añadir `face_recognition_active` a `Mission` si falta

---

## Task 1: Global styles — Inter font + variables CSS

**Files:**
- Modify: `frontend/src/app/globals.css`
- Modify: `frontend/src/app/layout.tsx`

- [ ] **Step 1: Leer layout.tsx raíz actual**

```bash
cat frontend/src/app/layout.tsx
```

- [ ] **Step 2: Actualizar layout.tsx para cargar Inter**

Reemplazar el contenido de `frontend/src/app/layout.tsx`:

```tsx
// =============================================================================
// AEROFINDER — Root layout: carga Inter, metadata global
// =============================================================================

import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "AEROFINDER",
  description: "Sistema de búsqueda de personas desaparecidas con drones",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 3: Actualizar globals.css**

Reemplazar `frontend/src/app/globals.css` completo:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --font-inter: 'Inter', system-ui, sans-serif;
}

body {
  font-family: var(--font-inter);
  background: #f1f5f9;
  color: #0f172a;
  -webkit-font-smoothing: antialiased;
}

@layer utilities {
  .text-balance { text-wrap: balance; }

  /* Dot animado para elementos live */
  .live-dot {
    display: inline-block;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #22c55e;
    animation: livepulse 2s infinite;
  }

  /* Barra de confianza (YOLO / FaceNet) */
  .conf-bar {
    display: inline-block;
    width: 36px;
    height: 4px;
    border-radius: 2px;
    background: #e2e8f0;
    overflow: hidden;
    vertical-align: middle;
  }
  .conf-fill-high { background: #22c55e; height: 100%; border-radius: 2px; }
  .conf-fill-mid  { background: #f59e0b; height: 100%; border-radius: 2px; }
  .conf-fill-low  { background: #ef4444; height: 100%; border-radius: 2px; }
}

@keyframes livepulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(34,197,94,.4); }
  50%       { box-shadow: 0 0 0 5px rgba(34,197,94,0); }
}

/* Animación para drone volando */
@keyframes flyingpulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(34,197,94,.35); }
  50%       { box-shadow: 0 0 0 4px rgba(34,197,94,0); }
}
.drone-flying { animation: flyingpulse 2s infinite; }
```

- [ ] **Step 4: Verificar compilación**

```bash
cd frontend && npm run build 2>&1 | tail -20
```
Expected: sin errores de compilación. Si hay warnings de lint no relacionados, ignorar.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/globals.css frontend/src/app/layout.tsx
git commit -m "style: Inter font + CSS variables y utilidades globales"
```

---

## Task 2: Topbar component

**Files:**
- Create: `frontend/src/components/layout/Topbar.tsx`

- [ ] **Step 1: Crear `frontend/src/components/layout/Topbar.tsx`**

```tsx
// =============================================================================
// AEROFINDER — Topbar: logo/toggle, breadcrumb, rol chip, campana, avatar
// =============================================================================

"use client";

import { NotificationBell } from "@/components/notifications/NotificationBell";
import type { RoleName } from "@/lib/types";

// ── Colores de rol chip ───────────────────────────────────────────────────────

const ROLE_CHIP: Record<RoleName, { bg: string; text: string; label: string }> = {
  admin:    { bg: "bg-violet-100", text: "text-violet-700", label: "Admin" },
  buscador: { bg: "bg-blue-100",   text: "text-blue-700",   label: "Buscador" },
  ayudante: { bg: "bg-green-100",  text: "text-green-700",  label: "Ayudante" },
  familiar: { bg: "bg-amber-100",  text: "text-amber-700",  label: "Familiar" },
};

// ── SVGs inline ──────────────────────────────────────────────────────────────

function DroneIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] stroke-white fill-none" strokeWidth={1.8}>
      <circle cx="12" cy="12" r="3"/>
      <path d="M5 5l3 3M19 5l-3 3M5 19l3-3M19 19l-3-3"/>
      <circle cx="5"  cy="5"  r="2"/>
      <circle cx="19" cy="5"  r="2"/>
      <circle cx="5"  cy="19" r="2"/>
      <circle cx="19" cy="19" r="2"/>
    </svg>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface TopbarProps {
  breadcrumb:      string;      // ej. "Panel de administración"
  role:            RoleName;
  userName:        string;
  onToggleSidebar: () => void;
}

// ── Componente ────────────────────────────────────────────────────────────────

export function Topbar({ breadcrumb, role, userName, onToggleSidebar }: TopbarProps) {
  const chip = ROLE_CHIP[role];

  // Iniciales del nombre (máximo 2 caracteres)
  const initials = userName
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <header className="flex h-[52px] items-center gap-3 border-b border-slate-200 bg-white px-4 flex-shrink-0 z-10">
      {/* Logo / toggle sidebar */}
      <button
        onClick={onToggleSidebar}
        className="flex h-[34px] w-[34px] items-center justify-center rounded-lg bg-blue-600 flex-shrink-0 hover:bg-blue-700 transition-colors"
        title="Expandir / colapsar menú"
      >
        <DroneIcon />
      </button>

      {/* Divider */}
      <div className="h-7 w-px bg-slate-200 flex-shrink-0" />

      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-slate-500">
        <span>Dashboard</span>
        <span className="text-slate-300">/</span>
        <span className="font-semibold text-slate-900">{breadcrumb}</span>
      </nav>

      {/* Derecha */}
      <div className="ml-auto flex items-center gap-2">
        {/* Rol chip */}
        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${chip.bg} ${chip.text}`}>
          {chip.label}
        </span>

        {/* Campana (componente existente) */}
        {role !== "familiar" && <NotificationBell />}

        {/* Avatar con iniciales */}
        <div
          className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold text-white cursor-pointer flex-shrink-0 select-none"
          title={userName}
        >
          {initials}
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Verificar que no rompe compilación**

```bash
cd frontend && npm run build 2>&1 | grep -E "error|Error" | head -20
```
Expected: sin errores relacionados con `Topbar.tsx`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/layout/Topbar.tsx
git commit -m "feat: componente Topbar — breadcrumb, rol chip, campana, avatar"
```

---

## Task 3: Sidebar colapsable

**Files:**
- Create: `frontend/src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Crear `frontend/src/components/layout/Sidebar.tsx`**

```tsx
// =============================================================================
// AEROFINDER — Sidebar colapsable con íconos + labels, secciones y badges
// Colapsado: 52px (solo íconos). Expandido: 216px (íconos + labels).
// =============================================================================

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import type { RoleName } from "@/lib/types";

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface NavItem {
  label:  string;
  href:   string;
  roles:  RoleName[];
  icon:   React.ReactNode;
  badge?: number | null;   // badge en tiempo real
}

export interface SidebarBadges {
  missions:   number;   // misiones activas
  alerts:     number;   // alertas generadas sin ver
  detections: number;   // detecciones hoy
  review:     number;   // field reports pendientes
}

interface SidebarProps {
  isOpen:  boolean;
  badges:  SidebarBadges;
}

// ── SVGs inline (Lucide-style, 17×17, sin dependencia) ───────────────────────

const Icons = {
  home: (
    <svg viewBox="0 0 24 24" className="h-[17px] w-[17px] stroke-current fill-none flex-shrink-0" strokeWidth={1.8}>
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
      <polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  ),
  missions: (
    <svg viewBox="0 0 24 24" className="h-[17px] w-[17px] stroke-current fill-none flex-shrink-0" strokeWidth={1.8}>
      <rect x="3" y="3" width="7" height="7" rx="1"/>
      <rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="3" y="14" width="7" height="7" rx="1"/>
      <rect x="14" y="14" width="7" height="7" rx="1"/>
    </svg>
  ),
  persons: (
    <svg viewBox="0 0 24 24" className="h-[17px] w-[17px] stroke-current fill-none flex-shrink-0" strokeWidth={1.8}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  ),
  detections: (
    <svg viewBox="0 0 24 24" className="h-[17px] w-[17px] stroke-current fill-none flex-shrink-0" strokeWidth={1.8}>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  ),
  drones: (
    <svg viewBox="0 0 24 24" className="h-[17px] w-[17px] stroke-current fill-none flex-shrink-0" strokeWidth={1.8}>
      <circle cx="12" cy="12" r="3"/>
      <path d="M5 5l3 3M19 5l-3 3M5 19l3-3M19 19l-3-3"/>
      <circle cx="5" cy="5" r="2"/><circle cx="19" cy="5" r="2"/>
      <circle cx="5" cy="19" r="2"/><circle cx="19" cy="19" r="2"/>
    </svg>
  ),
  alerts: (
    <svg viewBox="0 0 24 24" className="h-[17px] w-[17px] stroke-current fill-none flex-shrink-0" strokeWidth={1.8}>
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/>
      <line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  ),
  review: (
    <svg viewBox="0 0 24 24" className="h-[17px] w-[17px] stroke-current fill-none flex-shrink-0" strokeWidth={1.8}>
      <path d="M9 11l3 3L22 4"/>
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
    </svg>
  ),
  users: (
    <svg viewBox="0 0 24 24" className="h-[17px] w-[17px] stroke-current fill-none flex-shrink-0" strokeWidth={1.8}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
  ),
  config: (
    <svg viewBox="0 0 24 24" className="h-[17px] w-[17px] stroke-current fill-none flex-shrink-0" strokeWidth={1.8}>
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  ),
  logs: (
    <svg viewBox="0 0 24 24" className="h-[17px] w-[17px] stroke-current fill-none flex-shrink-0" strokeWidth={1.8}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
    </svg>
  ),
  report: (
    <svg viewBox="0 0 24 24" className="h-[17px] w-[17px] stroke-current fill-none flex-shrink-0" strokeWidth={1.8}>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
  ),
  myCases: (
    <svg viewBox="0 0 24 24" className="h-[17px] w-[17px] stroke-current fill-none flex-shrink-0" strokeWidth={1.8}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
  ),
  bell: (
    <svg viewBox="0 0 24 24" className="h-[17px] w-[17px] stroke-current fill-none flex-shrink-0" strokeWidth={1.8}>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>
  ),
  logout: (
    <svg viewBox="0 0 24 24" className="h-[17px] w-[17px] stroke-current fill-none flex-shrink-0" strokeWidth={1.8}>
      <path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
    </svg>
  ),
};

// ── Badge pill ────────────────────────────────────────────────────────────────

function NavPill({ count, color }: { count: number; color: "red" | "blue" | "amber" }) {
  if (!count) return null;
  const cls = {
    red:   "bg-red-100 text-red-700",
    blue:  "bg-blue-100 text-blue-700",
    amber: "bg-amber-100 text-amber-700",
  }[color];
  return (
    <span className={`ml-auto rounded-full px-1.5 py-px text-[9px] font-bold ${cls}`}>
      {count > 99 ? "99+" : count}
    </span>
  );
}

// ── Nav item ──────────────────────────────────────────────────────────────────

function NavLink({
  item, isOpen, isActive,
}: {
  item: NavItem; isOpen: boolean; isActive: boolean;
}) {
  return (
    <Link
      href={item.href}
      title={isOpen ? undefined : item.label}
      className={`flex h-9 items-center gap-2.5 rounded-lg px-2.5 transition-colors ${
        isActive
          ? "bg-blue-50 text-blue-600"
          : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
      } ${isOpen ? "w-full" : "w-9 justify-center"}`}
    >
      {item.icon}
      {isOpen && (
        <>
          <span className="text-[13px] font-medium truncate">{item.label}</span>
          {item.badge != null && item.badge > 0 && (
            <NavPill
              count={item.badge}
              color={
                item.href.includes("alerts")     ? "red"   :
                item.href.includes("missions")   ? "blue"  : "amber"
              }
            />
          )}
        </>
      )}
    </Link>
  );
}

// ── Section label ─────────────────────────────────────────────────────────────

function SectionLabel({ label, isOpen }: { label: string; isOpen: boolean }) {
  if (!isOpen) return <div className="h-2" />;
  return (
    <p className="mt-2 mb-1 px-2.5 text-[9px] font-semibold uppercase tracking-widest text-slate-400">
      {label}
    </p>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

export function Sidebar({ isOpen, badges }: SidebarProps) {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();

  if (!user) return null;
  const role = user.role as RoleName;

  // ── Definición de items con badges ───────────────────────────────
  const ALL_ITEMS: NavItem[] = [
    // Operaciones
    { label: "Dashboard",   href: "/dashboard",                        roles: ["admin","buscador","ayudante","familiar"], icon: Icons.home      },
    { label: "Misiones",    href: "/dashboard/missions",               roles: ["admin","buscador","ayudante"],             icon: Icons.missions,  badge: badges.missions   },
    { label: "Personas",    href: "/dashboard/persons",                roles: ["admin","buscador"],                        icon: Icons.persons                              },
    { label: "Detecciones", href: "/dashboard/detections",             roles: ["admin","buscador","ayudante"],             icon: Icons.detections,badge: badges.detections },
    { label: "Drones",      href: "/dashboard/drones",                 roles: ["admin","buscador"],                        icon: Icons.drones                               },
    { label: "Alertas",     href: "/dashboard/alerts",                 roles: ["admin","buscador","ayudante"],             icon: Icons.alerts,    badge: badges.alerts     },
    // Admin
    { label: "Revisión",    href: "/dashboard/admin/pending-review",   roles: ["admin","ayudante"],                        icon: Icons.review,    badge: badges.review     },
    { label: "Panel admin", href: "/dashboard/admin",                  roles: ["admin"],                                   icon: Icons.home                                 },
    { label: "Usuarios",    href: "/dashboard/users",                  roles: ["admin"],                                   icon: Icons.users                                },
    { label: "Config",      href: "/dashboard/config",                 roles: ["admin"],                                   icon: Icons.config                               },
    { label: "Auditoría",   href: "/dashboard/logs",                   roles: ["admin"],                                   icon: Icons.logs                                 },
    // Familiar
    { label: "Reportar",    href: "/dashboard/familiar/report",        roles: ["familiar"],                                icon: Icons.report                               },
    { label: "Mis casos",   href: "/dashboard/familiar",               roles: ["familiar"],                                icon: Icons.myCases                              },
    { label: "Notificaciones", href: "/dashboard/notifications",       roles: ["familiar"],                                icon: Icons.bell                                 },
  ];

  // Secciones
  const opsItems    = ALL_ITEMS.filter(i => i.roles.includes(role) && !i.href.includes("admin") && !i.href.includes("users") && !i.href.includes("config") && !i.href.includes("logs"));
  const adminItems  = ALL_ITEMS.filter(i => i.roles.includes(role) && (i.href.includes("admin") || i.href.includes("users") || i.href.includes("config") || i.href.includes("logs")));

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <aside
      className={`flex h-screen flex-col border-r border-slate-200 bg-white transition-all duration-200 flex-shrink-0 overflow-hidden ${
        isOpen ? "w-[216px]" : "w-[52px]"
      }`}
    >
      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
        {/* Operaciones */}
        <SectionLabel label="Operaciones" isOpen={isOpen} />
        {opsItems.map((item) => (
          <NavLink key={item.href} item={item} isOpen={isOpen} isActive={isActive(item.href)} />
        ))}

        {/* Admin section */}
        {adminItems.length > 0 && (
          <>
            <SectionLabel label="Admin" isOpen={isOpen} />
            {adminItems.map((item) => (
              <NavLink key={item.href} item={item} isOpen={isOpen} isActive={isActive(item.href)} />
            ))}
          </>
        )}

        <div className="flex-1" />

        {/* Logout */}
        <button
          onClick={() => logout()}
          title={isOpen ? undefined : "Cerrar sesión"}
          className={`flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-red-500 hover:bg-red-50 transition-colors ${
            isOpen ? "w-full" : "w-9 justify-center"
          }`}
        >
          {Icons.logout}
          {isOpen && <span className="text-[13px] font-medium">Cerrar sesión</span>}
        </button>
      </nav>
    </aside>
  );
}
```

- [ ] **Step 2: Compilar**

```bash
cd frontend && npm run build 2>&1 | grep -E "^.*error" | head -20
```
Expected: sin errores en `Sidebar.tsx`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/layout/Sidebar.tsx
git commit -m "feat: Sidebar colapsable — secciones, íconos SVG, badges tiempo real"
```

---

## Task 4: Hook useSidebarBadges + actualizar dashboard/layout.tsx

**Files:**
- Create: `frontend/src/hooks/useSidebarBadges.ts`
- Modify: `frontend/src/app/dashboard/layout.tsx`

- [ ] **Step 1: Crear `frontend/src/hooks/useSidebarBadges.ts`**

```ts
// =============================================================================
// AEROFINDER — Hook para badges en tiempo real del sidebar
// Actualiza contadores cada 30s y en eventos WS de la store de notificaciones
// =============================================================================

"use client";

import { useEffect, useState } from "react";
import { missionsApi, alertsApi, detectionsApi } from "@/lib/api";
import { useNotificationsStore } from "@/store/notifications";
import type { SidebarBadges } from "@/components/layout/Sidebar";

const isToday = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth()    === now.getMonth()    &&
    d.getDate()     === now.getDate()
  );
};

export function useSidebarBadges(): SidebarBadges {
  const unreadCount = useNotificationsStore((s) => s.unreadCount);

  const [badges, setBadges] = useState<SidebarBadges>({
    missions:   0,
    alerts:     0,
    detections: 0,
    review:     0,
  });

  const load = async () => {
    try {
      const [missions, detections] = await Promise.all([
        missionsApi.list(),
        detectionsApi.list({ limit: 200 }),
      ]);
      setBadges((prev) => ({
        ...prev,
        missions:   missions.filter((m) => m.status === "active").length,
        detections: detections.filter((d) => isToday(d.frame_timestamp)).length,
        alerts:     unreadCount,
        // review se actualiza desde el dashboard principal
      }));
    } catch {
      // silent — badges son decorativos, no bloquean la UI
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mantener alerts sincronizado con el store de notificaciones
  useEffect(() => {
    setBadges((prev) => ({ ...prev, alerts: unreadCount }));
  }, [unreadCount]);

  return badges;
}
```

- [ ] **Step 2: Verificar que `detectionsApi.list` acepta `limit`**

```bash
grep -A 12 "detectionsApi = {" frontend/src/lib/api.ts | head -15
```

Si el parámetro se llama `limit` confirmar. Si no existe, añadir `limit?: number` al tipo de params en `lib/api.ts`:

```ts
// En detectionsApi.list, añadir al objeto de params:
async list(params?: {
  mission_id?:       string;
  missing_person_id?: string;
  is_reviewed?:      boolean;
  limit?:            number;
  skip?:             number;
}): Promise<Detection[]> {
  const { data } = await api.get<Detection[]>("/detections/", { params });
  return data;
},
```

- [ ] **Step 3: Reescribir `frontend/src/app/dashboard/layout.tsx`**

```tsx
// =============================================================================
// AEROFINDER — Dashboard layout: Topbar + Sidebar colapsable + main
// Estado del sidebar persiste en localStorage.
// =============================================================================

"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import { Topbar } from "@/components/layout/Topbar";
import { Sidebar } from "@/components/layout/Sidebar";
import { NotificationProvider } from "@/components/notifications/NotificationProvider";
import { GlobalToasts } from "@/components/notifications/GlobalToasts";
import { useSidebarBadges } from "@/hooks/useSidebarBadges";

// Mapa de ruta a label legible para el breadcrumb
const BREADCRUMB_MAP: Record<string, string> = {
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

function useBreadcrumb(): string {
  const pathname = usePathname();
  // Buscar coincidencia exacta o por prefijo (para rutas dinámicas)
  const exact = BREADCRUMB_MAP[pathname];
  if (exact) return exact;
  // Para rutas dinámicas como /dashboard/missions/[id]
  const prefix = Object.keys(BREADCRUMB_MAP)
    .filter((k) => pathname.startsWith(k + "/"))
    .sort((a, b) => b.length - a.length)[0];
  return prefix ? BREADCRUMB_MAP[prefix] : "Dashboard";
}

function InnerLayout({ children }: { children: React.ReactNode }) {
  const router          = useRouter();
  const user            = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading       = useAuthStore((s) => s.isLoading);
  const loadUser        = useAuthStore((s) => s.loadUser);
  const breadcrumb      = useBreadcrumb();
  const badges          = useSidebarBadges();

  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("aerofinder_sidebar") === "open";
  });

  const toggleSidebar = () => {
    setSidebarOpen((prev) => {
      const next = !prev;
      localStorage.setItem("aerofinder_sidebar", next ? "open" : "closed");
      return next;
    });
  };

  useEffect(() => {
    if (!isAuthenticated && !isLoading) loadUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.replace("/login");
  }, [isLoading, isAuthenticated, router]);

  if (isLoading || !isAuthenticated || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <div className="text-center text-slate-400">
          <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-500" />
          <p className="text-sm">Verificando sesión…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <Topbar
        breadcrumb={breadcrumb}
        role={user.role}
        userName={user.full_name}
        onToggleSidebar={toggleSidebar}
      />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar isOpen={sidebarOpen} badges={badges} />
        <main className="flex-1 overflow-y-auto bg-slate-100">
          {children}
        </main>
      </div>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <NotificationProvider>
      <GlobalToasts />
      <InnerLayout>{children}</InnerLayout>
    </NotificationProvider>
  );
}
```

- [ ] **Step 4: Compilar y verificar**

```bash
cd frontend && npm run build 2>&1 | grep -E "error" | grep -v "node_modules" | head -20
```
Expected: sin errores. Si hay error de tipo en `detectionsApi.list({ limit: 200 })`, completar el Step 2.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useSidebarBadges.ts frontend/src/app/dashboard/layout.tsx frontend/src/lib/api.ts
git commit -m "feat: layout dashboard — Topbar + Sidebar colapsable con badges reales"
```

---

## Task 5: Componentes base del dashboard — KpiCard, SectionCard, PageHeader

**Files:**
- Create: `frontend/src/components/dashboard/KpiCard.tsx`
- Create: `frontend/src/components/dashboard/SectionCard.tsx`
- Create: `frontend/src/components/dashboard/PageHeader.tsx`

- [ ] **Step 1: Crear `frontend/src/components/dashboard/KpiCard.tsx`**

```tsx
// =============================================================================
// AEROFINDER — KpiCard: ícono + valor + label + trend badge opcional
// =============================================================================

interface KpiCardProps {
  icon:    React.ReactNode;
  value:   number | string;
  label:   string;
  trend?:  string;
  trendColor?: "green" | "amber" | "slate";
  iconBg?: "green" | "blue" | "red" | "amber" | "violet" | "slate";
}

const ICON_BG = {
  green:  "bg-green-100 text-green-600",
  blue:   "bg-blue-100  text-blue-600",
  red:    "bg-red-100   text-red-600",
  amber:  "bg-amber-100 text-amber-600",
  violet: "bg-violet-100 text-violet-600",
  slate:  "bg-slate-100 text-slate-500",
};

const TREND_COLOR = {
  green: "bg-green-100 text-green-700",
  amber: "bg-amber-100 text-amber-700",
  slate: "bg-slate-100 text-slate-500",
};

export function KpiCard({ icon, value, label, trend, trendColor = "slate", iconBg = "blue" }: KpiCardProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${ICON_BG[iconBg]}`}>
          {icon}
        </div>
        {trend && (
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${TREND_COLOR[trendColor]}`}>
            {trend}
          </span>
        )}
      </div>
      <p className="text-2xl font-extrabold text-slate-900 leading-none">{value}</p>
      <p className="mt-1 text-[11px] text-slate-500">{label}</p>
    </div>
  );
}
```

- [ ] **Step 2: Crear `frontend/src/components/dashboard/SectionCard.tsx`**

```tsx
// =============================================================================
// AEROFINDER — SectionCard: card con header (título + íco + link) + children
// =============================================================================

import Link from "next/link";

interface SectionCardProps {
  title:       string;
  icon?:       React.ReactNode;
  linkHref?:   string;
  linkLabel?:  string;
  badge?:      number | null;
  children:    React.ReactNode;
  className?:  string;
}

export function SectionCard({
  title, icon, linkHref, linkLabel = "Ver todo →", badge, children, className = "",
}: SectionCardProps) {
  return (
    <div className={`overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2 text-[13px] font-semibold text-slate-800">
          {icon && <span className="text-slate-400">{icon}</span>}
          {title}
          {badge != null && badge > 0 && (
            <span className="rounded-full bg-amber-100 px-1.5 py-px text-[9px] font-bold text-amber-700">
              {badge}
            </span>
          )}
        </div>
        {linkHref && (
          <Link href={linkHref} className="text-[11px] font-medium text-blue-600 hover:text-blue-700">
            {linkLabel}
          </Link>
        )}
      </div>
      {/* Body */}
      <div>{children}</div>
    </div>
  );
}
```

- [ ] **Step 3: Crear `frontend/src/components/dashboard/PageHeader.tsx`**

```tsx
// =============================================================================
// AEROFINDER — PageHeader: título, subtítulo + slot de acciones
// =============================================================================

interface PageHeaderProps {
  title:      string;
  subtitle?:  string;
  children?:  React.ReactNode;   // acciones (botones) a la derecha
}

export function PageHeader({ title, subtitle, children }: PageHeaderProps) {
  return (
    <div className="mb-5 flex items-start justify-between">
      <div>
        <h1 className="text-[19px] font-bold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-0.5 text-[12px] text-slate-400">{subtitle}</p>}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}
```

- [ ] **Step 4: Compilar**

```bash
cd frontend && npm run build 2>&1 | grep -E "error" | grep -v "node_modules" | head -10
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/dashboard/KpiCard.tsx \
        frontend/src/components/dashboard/SectionCard.tsx \
        frontend/src/components/dashboard/PageHeader.tsx
git commit -m "feat: componentes base dashboard — KpiCard, SectionCard, PageHeader"
```

---

## Task 6: Row components — MissionRow, AlertRow, DetectionRow, DroneStatusRow, FieldReportRow, LiveFeed

**Files:**
- Create: `frontend/src/components/dashboard/MissionRow.tsx`
- Create: `frontend/src/components/dashboard/AlertRow.tsx`
- Create: `frontend/src/components/dashboard/DetectionRow.tsx`
- Create: `frontend/src/components/dashboard/DroneStatusRow.tsx`
- Create: `frontend/src/components/dashboard/FieldReportRow.tsx`
- Create: `frontend/src/components/dashboard/LiveFeed.tsx`

- [ ] **Step 1: Crear `MissionRow.tsx`**

```tsx
// =============================================================================
// AEROFINDER — MissionRow: fila de misión con badge IA (recognition_active)
// =============================================================================

import Link from "next/link";
import type { Mission, MissionStatus } from "@/lib/types";

const STATUS_LABEL: Record<MissionStatus, string> = {
  planned:     "Planificada",
  active:      "Activa",
  paused:      "Pausada",
  completed:   "Completada",
  interrupted: "Interrumpida",
  cancelled:   "Cancelada",
};

const STATUS_CHIP: Record<MissionStatus, string> = {
  planned:     "bg-amber-100 text-amber-700",
  active:      "bg-green-100 text-green-700",
  paused:      "bg-orange-100 text-orange-700",
  completed:   "bg-blue-100  text-blue-700",
  interrupted: "bg-red-100   text-red-700",
  cancelled:   "bg-slate-100 text-slate-500",
};

const DOT_COLOR: Record<MissionStatus, string> = {
  planned:     "bg-amber-400",
  active:      "bg-green-500",
  paused:      "bg-orange-400",
  completed:   "bg-blue-400",
  interrupted: "bg-red-400",
  cancelled:   "bg-slate-300",
};

function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60)  return `hace ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `hace ${hrs}h`;
  return new Date(iso).toLocaleDateString("es-BO", { day: "2-digit", month: "short" });
}

interface MissionRowProps {
  mission:       Mission;
  droneCount?:   number;
}

export function MissionRow({ mission, droneCount }: MissionRowProps) {
  return (
    <Link
      href={`/dashboard/missions/${mission.id}`}
      className="flex items-center gap-3 border-b border-slate-50 px-4 py-2.5 last:border-0 hover:bg-slate-50 transition-colors"
    >
      {/* Status dot */}
      <span
        className={`h-2 w-2 rounded-full flex-shrink-0 ${DOT_COLOR[mission.status]} ${
          mission.status === "active" ? "shadow-[0_0_0_3px_rgba(34,197,94,.2)]" : ""
        }`}
      />

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="truncate text-[12px] font-medium text-slate-900">{mission.name}</p>
        <div className="mt-0.5 flex items-center gap-3 text-[10px] text-slate-400">
          {droneCount != null && <span>{droneCount} drone{droneCount !== 1 ? "s" : ""}</span>}
          {/* Badge IA */}
          {mission.recognition_active && (
            <span className="font-semibold text-violet-600">
              ● YOLO{mission.face_recognition_active ? " + FaceNet" : ""} ON
            </span>
          )}
          <span>{formatRelative(mission.started_at ?? mission.created_at)}</span>
        </div>
      </div>

      {/* Status chip */}
      <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_CHIP[mission.status]}`}>
        {STATUS_LABEL[mission.status]}
      </span>
    </Link>
  );
}
```

- [ ] **Step 2: Crear `AlertRow.tsx`**

```tsx
// =============================================================================
// AEROFINDER — AlertRow: fila de alerta con barra lateral por content_level
// =============================================================================

import type { Alert } from "@/lib/types";

const LEVEL_BAR: Record<string, string> = {
  full:              "bg-red-500",
  partial:           "bg-amber-500",
  confirmation_only: "bg-blue-400",
};

const LEVEL_LABEL: Record<string, string> = {
  full:              "Coincidencia confirmada",
  partial:           "Coincidencia probable",
  confirmation_only: "Posible coincidencia",
};

const STATUS_CHIP: Record<string, string> = {
  generated: "bg-red-100 text-red-700",
  sent:      "bg-blue-100 text-blue-700",
  confirmed: "bg-green-100 text-green-700",
  dismissed: "bg-slate-100 text-slate-500",
};

const STATUS_LABEL: Record<string, string> = {
  generated: "Nueva",
  sent:      "Enviada",
  confirmed: "Confirmada",
  dismissed: "Descartada",
};

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60)  return `hace ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `hace ${hrs}h`;
  return new Date(iso).toLocaleDateString("es-BO", { day: "2-digit", month: "short" });
}

interface AlertRowProps {
  alert: Alert;
}

export function AlertRow({ alert }: AlertRowProps) {
  return (
    <div className="flex items-start gap-3 border-b border-slate-50 px-4 py-2.5 last:border-0">
      {/* Barra lateral por nivel */}
      <div className={`mt-0.5 w-1 self-stretch rounded-full flex-shrink-0 ${LEVEL_BAR[alert.content_level] ?? "bg-slate-200"}`} />

      {/* Contenido */}
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-semibold text-slate-900">
          {LEVEL_LABEL[alert.content_level] ?? alert.content_level}
        </p>
        {alert.message_text && (
          <p className="mt-0.5 truncate text-[11px] text-slate-500">{alert.message_text}</p>
        )}
        <p className="mt-0.5 text-[10px] text-slate-400">{formatRelative(alert.generated_at)}</p>
      </div>

      {/* Status chip */}
      <span className={`flex-shrink-0 mt-0.5 rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_CHIP[alert.status] ?? ""}`}>
        {STATUS_LABEL[alert.status] ?? alert.status}
      </span>
    </div>
  );
}
```

- [ ] **Step 3: Crear `DetectionRow.tsx`**

```tsx
// =============================================================================
// AEROFINDER — DetectionRow: fila de detección con barras YOLO + FaceNet
// =============================================================================

import type { Detection } from "@/lib/types";

function ConfBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const cls =
    pct >= 75 ? "conf-fill-high" :
    pct >= 50 ? "conf-fill-mid"  : "conf-fill-low";
  return (
    <span className="conf-bar">
      <span className={cls} style={{ width: `${pct}%`, display: "block" }} />
    </span>
  );
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `hace ${mins}m`;
  return `hace ${Math.floor(mins / 60)}h`;
}

interface DetectionRowProps {
  detection:    Detection;
  personName?:  string;
}

export function DetectionRow({ detection, personName }: DetectionRowProps) {
  const yoloPct  = Math.round(detection.yolo_confidence * 100);
  const facePct  = Math.round(detection.facenet_similarity * 100);

  return (
    <div className="flex items-center gap-3 border-b border-slate-50 px-4 py-2.5 last:border-0">
      {/* Avatar placeholder */}
      <div className="h-8 w-8 rounded-lg bg-slate-100 flex-shrink-0 flex items-center justify-center">
        <svg viewBox="0 0 24 24" className="h-4 w-4 stroke-slate-300 fill-none" strokeWidth={1.5}>
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
          <circle cx="12" cy="7" r="4"/>
        </svg>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-medium text-slate-900 truncate">
          {personName ?? "Persona detectada"}
        </p>
        <div className="mt-0.5 flex items-center gap-3 text-[10px] text-slate-500">
          <span className="flex items-center gap-1">
            YOLO <ConfBar value={detection.yolo_confidence} /> {yoloPct}%
          </span>
          <span className="flex items-center gap-1">
            Face <ConfBar value={detection.facenet_similarity} /> {facePct}%
          </span>
        </div>
      </div>

      <span className="flex-shrink-0 text-[10px] text-slate-400">
        {formatRelative(detection.frame_timestamp)}
      </span>
    </div>
  );
}
```

- [ ] **Step 4: Crear `DroneStatusRow.tsx`**

```tsx
// =============================================================================
// AEROFINDER — DroneStatusRow: drone con dot animado, batería WS, link HLS
// =============================================================================

import type { Drone } from "@/lib/types";

interface DroneStatusRowProps {
  drone:       Drone;
  batteryPct?: number | null;   // del WS de telemetría; null si no disponible
}

const STATUS_DOT: Record<string, string> = {
  available:    "bg-amber-400",
  flying:       "bg-green-500 drone-flying",
  maintenance:  "bg-orange-400",
  retired:      "bg-slate-300",
};

const STATUS_LABEL: Record<string, string> = {
  available:   "Disponible",
  flying:      "Volando",
  maintenance: "Mantenimiento",
  retired:     "Retirado",
};

function BatteryBar({ pct }: { pct: number }) {
  const cls =
    pct >= 60 ? "bg-green-500" :
    pct >= 30 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-2 w-8 overflow-hidden rounded-sm border border-slate-200 bg-slate-100">
        <div className={`h-full rounded-sm ${cls}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-[10px] font-medium ${pct < 30 ? "text-red-600" : "text-slate-500"}`}>
        {pct}%
      </span>
    </div>
  );
}

export function DroneStatusRow({ drone, batteryPct }: DroneStatusRowProps) {
  return (
    <div className="flex items-center gap-3 border-b border-slate-50 px-4 py-2.5 last:border-0">
      {/* Status dot */}
      <span className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${STATUS_DOT[drone.status] ?? "bg-slate-300"}`} />

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="truncate text-[12px] font-medium text-slate-900">{drone.model}</p>
        <div className="mt-0.5 flex items-center gap-2 text-[10px] text-slate-400">
          <span>{drone.serial_number}</span>
          {drone.auto_created && (
            <span className="rounded-full bg-violet-100 px-1.5 py-px text-[9px] font-semibold text-violet-600">
              auto
            </span>
          )}
          {drone.hls_url && (
            <a
              href={drone.hls_url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-blue-600 hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              ▶ HLS
            </a>
          )}
        </div>
      </div>

      {/* Batería o estado */}
      <div className="flex-shrink-0">
        {batteryPct != null ? (
          <BatteryBar pct={batteryPct} />
        ) : (
          <span className="text-[10px] text-slate-400">
            {STATUS_LABEL[drone.status] ?? drone.status}
          </span>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Crear `FieldReportRow.tsx`**

```tsx
// =============================================================================
// AEROFINDER — FieldReportRow: field report pendiente con aprobar/rechazar
// =============================================================================

import { useState } from "react";
import { fieldReportsApi } from "@/lib/api";
import type { FieldReport } from "@/lib/types";

interface FieldReportRowProps {
  report:     FieldReport;
  onResolved: (id: string) => void;
}

export function FieldReportRow({ report, onResolved }: FieldReportRowProps) {
  const [loading, setLoading] = useState<"approve" | "reject" | null>(null);

  const handle = async (action: "approve" | "reject") => {
    setLoading(action);
    try {
      if (action === "approve") {
        await fieldReportsApi.approve(report.id);
      } else {
        await fieldReportsApi.reject(report.id);
      }
      onResolved(report.id);
    } catch (err) {
      console.error(`Error al ${action}:`, err);
    } finally {
      setLoading(null);
    }
  };

  // Iniciales del rescatista
  const initials = report.rescuer_name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div className="flex items-center gap-3 border-b border-slate-50 px-4 py-2.5 last:border-0">
      {/* Avatar */}
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[11px] font-bold text-indigo-600">
        {initials}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-medium text-slate-900">{report.rescuer_name}</p>
        {report.notes && (
          <p className="mt-0.5 truncate text-[11px] text-slate-500">"{report.notes}"</p>
        )}
        <p className="mt-0.5 text-[10px] text-slate-400">
          {report.photos.length} foto{report.photos.length !== 1 ? "s" : ""} ·{" "}
          {new Date(report.created_at).toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>

      {/* Acciones */}
      <div className="flex flex-shrink-0 gap-1.5">
        <button
          onClick={() => handle("approve")}
          disabled={loading !== null}
          className="rounded-lg bg-green-100 px-2.5 py-1 text-[10px] font-semibold text-green-700 hover:bg-green-200 disabled:opacity-50 transition-colors"
        >
          {loading === "approve" ? "…" : "✓ Aprobar"}
        </button>
        <button
          onClick={() => handle("reject")}
          disabled={loading !== null}
          className="rounded-lg bg-red-100 px-2.5 py-1 text-[10px] font-semibold text-red-700 hover:bg-red-200 disabled:opacity-50 transition-colors"
        >
          {loading === "reject" ? "…" : "✗ Rechazar"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Añadir `fieldReportsApi.approve` y `.reject` en `lib/api.ts`**

Buscar el bloque `fieldReportsApi` en `frontend/src/lib/api.ts` y añadir al final del objeto (antes del cierre `}`):

```ts
  async approve(reportId: string): Promise<FieldReport> {
    const { data } = await api.patch<FieldReport>(`/field-reports/${reportId}/approve`);
    return data;
  },

  async reject(reportId: string): Promise<FieldReport> {
    const { data } = await api.patch<FieldReport>(`/field-reports/${reportId}/reject`);
    return data;
  },
```

- [ ] **Step 7: Crear `LiveFeed.tsx`**

```tsx
// =============================================================================
// AEROFINDER — LiveFeed: feed scrollable de eventos WS en tiempo real
// Consume mensajes del hook useWebSocket del componente padre vía prop.
// =============================================================================

"use client";

import { useEffect, useRef } from "react";

export interface FeedEvent {
  type:      "detection" | "alert" | "telemetry" | "mission_update";
  message:   string;
  timestamp: number;   // Date.now()
}

const TYPE_CHIP: Record<FeedEvent["type"], string> = {
  detection:      "bg-violet-100 text-violet-700",
  alert:          "bg-red-100    text-red-700",
  telemetry:      "bg-blue-100   text-blue-700",
  mission_update: "bg-slate-100  text-slate-600",
};

const TYPE_LABEL: Record<FeedEvent["type"], string> = {
  detection:      "DETECCIÓN",
  alert:          "ALERTA",
  telemetry:      "TELEMETRÍA",
  mission_update: "MISIÓN",
};

function formatTs(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 60_000);
  if (diff === 0) return "ahora";
  if (diff < 60)  return `hace ${diff}m`;
  return `hace ${Math.floor(diff / 60)}h`;
}

interface LiveFeedProps {
  events:    FeedEvent[];
  maxHeight?: string;
}

export function LiveFeed({ events, maxHeight = "220px" }: LiveFeedProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll al último evento
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events.length]);

  if (events.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-[12px] text-slate-400">
        Esperando eventos WebSocket…
      </div>
    );
  }

  return (
    <div className="overflow-y-auto" style={{ maxHeight }}>
      {events.map((ev, i) => (
        <div key={i} className="flex items-start gap-2.5 border-b border-slate-50 px-4 py-2 last:border-0">
          <span className={`mt-0.5 flex-shrink-0 rounded px-1.5 py-px text-[9px] font-bold ${TYPE_CHIP[ev.type]}`}>
            {TYPE_LABEL[ev.type]}
          </span>
          <p className="flex-1 text-[11px] leading-[1.4] text-slate-700">{ev.message}</p>
          <span className="flex-shrink-0 text-[10px] text-slate-400">{formatTs(ev.timestamp)}</span>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
```

- [ ] **Step 8: Compilar**

```bash
cd frontend && npm run build 2>&1 | grep -E "error" | grep -v "node_modules" | head -20
```
Expected: sin errores.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/components/dashboard/ frontend/src/lib/api.ts
git commit -m "feat: row components dashboard — MissionRow, AlertRow, DetectionRow, DroneStatusRow, FieldReportRow, LiveFeed"
```

---

## Task 7: Hook useDashboardData

**Files:**
- Create: `frontend/src/hooks/useDashboardData.ts`

- [ ] **Step 1: Crear `frontend/src/hooks/useDashboardData.ts`**

```ts
// =============================================================================
// AEROFINDER — useDashboardData: carga todos los datos del dashboard admin
// Todos los datos vienen del backend; nada hardcodeado.
// =============================================================================

"use client";

import { useCallback, useEffect, useState } from "react";
import {
  missionsApi, dronesApi, alertsApi, detectionsApi,
  usersApi, fieldReportsApi,
} from "@/lib/api";
import type { Alert, Detection, Drone, FieldReport, Mission, User } from "@/lib/types";

const isToday = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth()    === now.getMonth()    &&
    d.getDate()     === now.getDate()
  );
};

export interface DashboardData {
  missions:           Mission[];
  drones:             Drone[];
  alerts:             Alert[];
  detectionsToday:    Detection[];
  fieldReportsPending: FieldReport[];
  usersActive:        User[];
  isLoading:          boolean;
  error:              string | null;
  reload:             () => void;
}

export function useDashboardData(): DashboardData {
  const [missions,            setMissions]            = useState<Mission[]>([]);
  const [drones,              setDrones]              = useState<Drone[]>([]);
  const [alerts,              setAlerts]              = useState<Alert[]>([]);
  const [detectionsToday,     setDetectionsToday]     = useState<Detection[]>([]);
  const [fieldReportsPending, setFieldReportsPending] = useState<FieldReport[]>([]);
  const [usersActive,         setUsersActive]         = useState<User[]>([]);
  const [isLoading,           setIsLoading]           = useState(true);
  const [error,               setError]               = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [missionList, droneList, alertList, detectionList, userList] = await Promise.all([
        missionsApi.list(),
        dronesApi.list(),
        alertsApi.list(),
        detectionsApi.list({ limit: 200 }),
        usersApi.list(),
      ]);

      setMissions(missionList);
      setDrones(droneList);
      setAlerts(alertList);
      setDetectionsToday(detectionList.filter((d) => isToday(d.frame_timestamp)));
      setUsersActive(userList.filter((u) => u.is_active));

      // Cargar field reports de misiones activas
      const activeMissions = missionList.filter((m) => m.status === "active");
      if (activeMissions.length > 0) {
        const reports = await Promise.all(
          activeMissions.map((m) => fieldReportsApi.listForMission(m.id).catch(() => [] as FieldReport[]))
        );
        const pending = reports.flat().filter((r) => r.status === "pending");
        setFieldReportsPending(pending);
      } else {
        setFieldReportsPending([]);
      }
    } catch (err) {
      setError("Error al cargar los datos del dashboard.");
      console.error("[useDashboardData]", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return {
    missions,
    drones,
    alerts,
    detectionsToday,
    fieldReportsPending,
    usersActive,
    isLoading,
    error,
    reload: load,
  };
}
```

- [ ] **Step 2: Compilar**

```bash
cd frontend && npm run build 2>&1 | grep -E "error" | grep -v "node_modules" | head -10
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useDashboardData.ts
git commit -m "feat: hook useDashboardData — carga real de misiones, drones, alertas, detecciones, field reports, usuarios"
```

---

## Task 8: Dashboard page — vista admin/buscador con datos reales

**Files:**
- Modify: `frontend/src/app/dashboard/page.tsx`

- [ ] **Step 1: Reescribir `frontend/src/app/dashboard/page.tsx`**

```tsx
// =============================================================================
// AEROFINDER — Dashboard principal con datos reales del backend
// admin/buscador: KPIs + misiones + feed WS + detecciones + alertas + drones + field reports
// ayudante: alertas recientes
// familiar: redirect a /dashboard/familiar
// =============================================================================

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import { useDashboardData } from "@/hooks/useDashboardData";
import { KpiCard }         from "@/components/dashboard/KpiCard";
import { SectionCard }     from "@/components/dashboard/SectionCard";
import { PageHeader }      from "@/components/dashboard/PageHeader";
import { MissionRow }      from "@/components/dashboard/MissionRow";
import { AlertRow }        from "@/components/dashboard/AlertRow";
import { DetectionRow }    from "@/components/dashboard/DetectionRow";
import { DroneStatusRow }  from "@/components/dashboard/DroneStatusRow";
import { FieldReportRow }  from "@/components/dashboard/FieldReportRow";
import { LiveFeed }        from "@/components/dashboard/LiveFeed";
import type { FeedEvent }  from "@/components/dashboard/LiveFeed";
import { useWebSocket }    from "@/lib/websocket";
import { useNotificationsStore } from "@/store/notifications";
import type { RoleName }   from "@/lib/types";
import { missionsApi }     from "@/lib/api";

// ── Íconos SVG inline ────────────────────────────────────────────────────────

const IcoMissions = () => (
  <svg viewBox="0 0 24 24" className="h-[15px] w-[15px] stroke-current fill-none flex-shrink-0" strokeWidth={2}>
    <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
    <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
  </svg>
);
const IcoDrones = () => (
  <svg viewBox="0 0 24 24" className="h-[15px] w-[15px] stroke-current fill-none flex-shrink-0" strokeWidth={2}>
    <circle cx="12" cy="12" r="3"/>
    <path d="M5 5l3 3M19 5l-3 3M5 19l3-3M19 19l-3-3"/>
    <circle cx="5" cy="5" r="2"/><circle cx="19" cy="5" r="2"/>
    <circle cx="5" cy="19" r="2"/><circle cx="19" cy="19" r="2"/>
  </svg>
);
const IcoAlerts = () => (
  <svg viewBox="0 0 24 24" className="h-[15px] w-[15px] stroke-current fill-none flex-shrink-0" strokeWidth={2}>
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
    <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>
);
const IcoDetections = () => (
  <svg viewBox="0 0 24 24" className="h-[15px] w-[15px] stroke-current fill-none flex-shrink-0" strokeWidth={2}>
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
  </svg>
);
const IcoReports = () => (
  <svg viewBox="0 0 24 24" className="h-[15px] w-[15px] stroke-current fill-none flex-shrink-0" strokeWidth={2}>
    <path d="M9 11l3 3L22 4"/>
    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
  </svg>
);
const IcoUsers = () => (
  <svg viewBox="0 0 24 24" className="h-[15px] w-[15px] stroke-current fill-none flex-shrink-0" strokeWidth={2}>
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
);

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(): string {
  return new Date().toLocaleDateString("es-BO", {
    weekday: "long", day: "2-digit", month: "long",
  });
}

// ── Vista admin/buscador ──────────────────────────────────────────────────────

function AdminBuscadorDashboard({ role }: { role: "admin" | "buscador" }) {
  const {
    missions, drones, alerts, detectionsToday,
    fieldReportsPending, usersActive, isLoading, error, reload,
  } = useDashboardData();

  const [feedEvents, setFeedEvents]       = useState<FeedEvent[]>([]);
  const [pendingReports, setPendingReports] = useState(fieldReportsPending);
  const unreadCount = useNotificationsStore((s) => s.unreadCount);

  // Sincronizar field reports pendientes cuando carga
  useEffect(() => {
    setPendingReports(fieldReportsPending);
  }, [fieldReportsPending]);

  // WS de alertas globales para el feed en vivo
  const firstActiveMission = missions.find((m) => m.status === "active");

  const handleWsMessage = useCallback((msg: Record<string, unknown>) => {
    const type = msg.type as FeedEvent["type"];
    if (!["detection", "alert", "telemetry", "mission_update"].includes(type)) return;

    let message = "";
    if (type === "detection") {
      const yolo = typeof msg.yolo_confidence === "number" ? Math.round(msg.yolo_confidence * 100) : "?";
      const face = typeof msg.facenet_similarity === "number" ? Math.round(msg.facenet_similarity * 100) : "?";
      message = `YOLO ${yolo}% · FaceNet ${face}%`;
    } else if (type === "alert") {
      message = (msg.message_text as string) ?? "Alerta generada";
    } else if (type === "telemetry") {
      const lat = typeof msg.latitude  === "number" ? msg.latitude.toFixed(4)  : "?";
      const lng = typeof msg.longitude === "number" ? msg.longitude.toFixed(4) : "?";
      const bat = msg.battery_level != null ? ` · bat ${msg.battery_level}%` : "";
      message = `GPS (${lat}, ${lng})${bat}`;
    } else {
      message = (msg.status as string) ?? "Actualización de misión";
    }

    setFeedEvents((prev) => [
      ...prev.slice(-49),
      { type, message, timestamp: Date.now() },
    ]);
  }, []);

  const wsUrl = firstActiveMission
    ? `/ws/missions/${firstActiveMission.id}`
    : null;

  useWebSocket(wsUrl, { onMessage: handleWsMessage });

  // Datos derivados
  const activeMissions  = missions.filter((m) => m.status === "active");
  const flyingDrones    = drones.filter((d) => d.status === "flying");
  const generatedAlerts = alerts.filter((a) => a.status === "generated");
  const recentAlerts    = alerts.slice(0, 5);
  const recentDets      = detectionsToday.slice(0, 5);
  const displayDrones   = drones.filter((d) => d.status !== "retired").slice(0, 5);

  const handleReportResolved = (id: string) => {
    setPendingReports((prev) => prev.filter((r) => r.id !== id));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-400">
        <div className="text-center">
          <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-500" />
          <p className="text-sm">Cargando datos…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-sm text-red-700">{error}</p>
        <button onClick={reload} className="mt-3 rounded-lg bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700">
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* KPI row */}
      <div className={`mb-5 grid gap-3 ${role === "admin" ? "grid-cols-6" : "grid-cols-4"}`}>
        <KpiCard icon={<IcoMissions />}   value={activeMissions.length}       label="Misiones activas"   iconBg="green"  trend={`${missions.length} total`}    trendColor="slate" />
        <KpiCard icon={<IcoDrones />}     value={flyingDrones.length}         label="Drones volando"     iconBg="blue"   trend={`${drones.length} registrados`} trendColor="slate" />
        <KpiCard icon={<IcoAlerts />}     value={generatedAlerts.length}      label="Alertas generadas"  iconBg="red"    trend={generatedAlerts.length > 0 ? "sin revisar" : "al día"} trendColor={generatedAlerts.length > 0 ? "amber" : "green"} />
        <KpiCard icon={<IcoDetections />} value={detectionsToday.length}      label="Detecciones hoy"    iconBg="amber"  trend="hoy"                            trendColor="slate" />
        {role === "admin" && <>
          <KpiCard icon={<IcoReports />}  value={pendingReports.length}       label="Field reports"      iconBg="violet" trend={pendingReports.length > 0 ? "pendientes" : "al día"} trendColor={pendingReports.length > 0 ? "amber" : "green"} />
          <KpiCard icon={<IcoUsers />}    value={usersActive.length}          label="Usuarios activos"   iconBg="slate"  trend="activos"                        trendColor="slate" />
        </>}
      </div>

      {/* Grid principal: misiones + feed WS */}
      <div className="mb-4 grid grid-cols-[1fr_320px] gap-4">
        <SectionCard
          title="Misiones activas"
          icon={<IcoMissions />}
          linkHref="/dashboard/missions"
        >
          {activeMissions.length === 0 ? (
            <p className="px-4 py-6 text-center text-[12px] text-slate-400">No hay misiones activas.</p>
          ) : (
            activeMissions.slice(0, 6).map((m) => <MissionRow key={m.id} mission={m} />)
          )}
        </SectionCard>

        <SectionCard
          title="Feed en vivo"
          icon={
            <span className="live-dot" />
          }
        >
          <LiveFeed events={feedEvents} maxHeight="240px" />
        </SectionCard>
      </div>

      {/* Grid secundario: detecciones + alertas + drones */}
      <div className="mb-4 grid grid-cols-3 gap-4">
        <SectionCard
          title="Detecciones recientes"
          icon={<IcoDetections />}
          linkHref="/dashboard/detections"
        >
          {recentDets.length === 0 ? (
            <p className="px-4 py-5 text-center text-[12px] text-slate-400">Sin detecciones hoy.</p>
          ) : (
            recentDets.map((d) => <DetectionRow key={d.id} detection={d} />)
          )}
        </SectionCard>

        <SectionCard
          title="Alertas pendientes"
          icon={<IcoAlerts />}
          linkHref="/dashboard/alerts"
          badge={generatedAlerts.length}
        >
          {recentAlerts.length === 0 ? (
            <p className="px-4 py-5 text-center text-[12px] text-slate-400">Sin alertas recientes.</p>
          ) : (
            recentAlerts.map((a) => <AlertRow key={a.id} alert={a} />)
          )}
        </SectionCard>

        <SectionCard
          title="Estado de flota"
          icon={<IcoDrones />}
          linkHref="/dashboard/drones"
        >
          {displayDrones.length === 0 ? (
            <p className="px-4 py-5 text-center text-[12px] text-slate-400">Sin drones registrados.</p>
          ) : (
            displayDrones.map((d) => <DroneStatusRow key={d.id} drone={d} />)
          )}
        </SectionCard>
      </div>

      {/* Field reports (solo admin) */}
      {role === "admin" && pendingReports.length > 0 && (
        <SectionCard
          title="Field reports — pendientes de revisión"
          icon={<IcoReports />}
          linkHref="/dashboard/admin/pending-review"
          badge={pendingReports.length}
        >
          <div className="grid grid-cols-2">
            {pendingReports.slice(0, 4).map((r) => (
              <FieldReportRow key={r.id} report={r} onResolved={handleReportResolved} />
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}

// ── Vista ayudante ────────────────────────────────────────────────────────────

function AyudanteDashboard() {
  const { alerts, isLoading, error, reload } = useDashboardData();
  const generatedAlerts = alerts.filter((a) => a.status === "generated");

  if (isLoading) return (
    <div className="flex items-center justify-center py-24 text-slate-400">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-500" />
    </div>
  );

  if (error) return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
      <p className="text-sm text-red-700">{error}</p>
      <button onClick={reload} className="mt-3 rounded-lg bg-red-600 px-4 py-2 text-sm text-white">Reintentar</button>
    </div>
  );

  return (
    <div>
      <div className="mb-5 grid grid-cols-2 gap-3">
        <KpiCard icon={<IcoAlerts />} value={generatedAlerts.length} label="Alertas pendientes" iconBg="red"  trend={generatedAlerts.length > 0 ? "sin revisar" : "al día"} trendColor={generatedAlerts.length > 0 ? "amber" : "green"} />
        <KpiCard icon={<IcoAlerts />} value={alerts.length}          label="Total alertas"      iconBg="blue" trend="total"  trendColor="slate" />
      </div>
      <SectionCard title="Alertas recientes" icon={<IcoAlerts />} linkHref="/dashboard/alerts">
        {alerts.length === 0 ? (
          <p className="px-4 py-6 text-center text-[12px] text-slate-400">Sin alertas recientes.</p>
        ) : (
          alerts.slice(0, 10).map((a) => <AlertRow key={a.id} alert={a} />)
        )}
      </SectionCard>
    </div>
  );
}

// ── Dashboard principal ───────────────────────────────────────────────────────

const HEADING: Record<RoleName, string> = {
  admin:    "Panel de administración",
  buscador: "Panel de operaciones",
  ayudante: "Panel de ayudante",
  familiar: "Mis notificaciones",
};

export default function DashboardPage() {
  const router = useRouter();
  const user   = useAuthStore((s) => s.user);

  useEffect(() => {
    if (user?.role === "familiar") router.replace("/dashboard/familiar");
  }, [user, router]);

  if (!user || user.role === "familiar") return null;

  return (
    <div className="p-5">
      <PageHeader
        title={HEADING[user.role]}
        subtitle={`${user.full_name} · ${formatDate()}`}
      >
        {(user.role === "admin" || user.role === "buscador") && (
          <a
            href="/dashboard/missions"
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-[12px] font-semibold text-white hover:bg-blue-700 transition-colors"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 stroke-white fill-none" strokeWidth={2.5}>
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Nueva misión
          </a>
        )}
      </PageHeader>

      {(user.role === "admin" || user.role === "buscador") && (
        <AdminBuscadorDashboard role={user.role as "admin" | "buscador"} />
      )}
      {user.role === "ayudante" && <AyudanteDashboard />}
    </div>
  );
}
```

- [ ] **Step 2: Verificar que `useWebSocket` acepta `{ onMessage }` como options**

```bash
grep -A 10 "useWebSocket" frontend/src/lib/websocket.ts | head -15
```

Si la firma es diferente, ajustar la llamada en el dashboard al patrón correcto que ya usa `DroneStream.tsx` o `MissionMap.tsx`.

- [ ] **Step 3: Compilar**

```bash
cd frontend && npm run build 2>&1 | grep -E "error" | grep -v "node_modules" | head -20
```
Expected: sin errores de tipo. Warnings de lint son aceptables.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/dashboard/page.tsx
git commit -m "feat: dashboard page — KPIs reales + grid misiones/alertas/drones/detecciones/field reports"
```

---

## Task 9: Style pass — misiones list, detalle misión, personas

**Files:**
- Modify: `frontend/src/app/dashboard/missions/page.tsx`
- Modify: `frontend/src/app/dashboard/persons/page.tsx`

- [ ] **Step 1: Leer el estado actual de missions/page.tsx**

```bash
head -60 frontend/src/app/dashboard/missions/page.tsx
```

- [ ] **Step 2: Aplicar nuevo estilo a `missions/page.tsx`**

Reemplazar la sección de render (mantener toda la lógica, sólo cambiar el JSX de presentación). El patrón es:

```tsx
// Wrapper principal
<div className="p-5">
  <PageHeader title="Misiones" subtitle="Listado completo de operaciones">
    {/* botón Nueva misión si admin/buscador */}
  </PageHeader>

  {/* Filtros por status — pills */}
  <div className="mb-4 flex flex-wrap gap-2">
    {["Todas", "Activas", "Planificadas", "Completadas"].map((f) => (
      <button
        key={f}
        onClick={() => setFilter(f)}
        className={`rounded-full px-3 py-1 text-[12px] font-medium transition-colors ${
          activeFilter === f
            ? "bg-blue-600 text-white"
            : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
        }`}
      >
        {f}
      </button>
    ))}
  </div>

  {/* Lista */}
  <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
    {filteredMissions.map((m) => <MissionRow key={m.id} mission={m} />)}
  </div>
</div>
```

Importar `PageHeader` y `MissionRow`. Mantener todo el estado y lógica existente.

- [ ] **Step 3: Aplicar nuevo estilo a `persons/page.tsx`**

```bash
head -60 frontend/src/app/dashboard/persons/page.tsx
```

Mismo patrón: `<div className="p-5">` + `<PageHeader>` + lista con tarjetas. Mantener lógica.

- [ ] **Step 4: Compilar**

```bash
cd frontend && npm run build 2>&1 | grep -E "error" | grep -v "node_modules" | head -10
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/dashboard/missions/page.tsx frontend/src/app/dashboard/persons/page.tsx
git commit -m "style: missions y persons page — nuevo estilo con PageHeader y MissionRow"
```

---

## Task 10: Style pass — alertas, drones, detecciones, usuarios, config, revisión, logs

**Files:**
- Modify: `frontend/src/app/dashboard/alerts/page.tsx`
- Modify: `frontend/src/app/dashboard/drones/page.tsx`
- Modify: `frontend/src/app/dashboard/detections/page.tsx`
- Modify: `frontend/src/app/dashboard/users/page.tsx`
- Modify: `frontend/src/app/dashboard/config/page.tsx`
- Modify: `frontend/src/app/dashboard/admin/pending-review/page.tsx`
- Modify: `frontend/src/app/dashboard/logs/page.tsx`

- [ ] **Step 1: Leer cada página**

```bash
for f in alerts drones detections users config logs; do
  echo "=== $f ===" && head -30 frontend/src/app/dashboard/$f/page.tsx
done
echo "=== pending-review ===" && head -30 frontend/src/app/dashboard/admin/pending-review/page.tsx
```

- [ ] **Step 2: Aplicar patrón a todas las páginas**

Para cada página, envolver el contenido existente en:
```tsx
<div className="p-5">
  <PageHeader title="[Título]" subtitle="[subtítulo opcional]">
    {/* acciones si aplica */}
  </PageHeader>
  {/* contenido existente con clases actualizadas */}
</div>
```

Reglas de clases:
- Listas → `rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden divide-y divide-slate-50`
- Filas → `px-4 py-3 flex items-center gap-3 hover:bg-slate-50 transition-colors`
- Tablas → `w-full text-[12px]` con `thead` en `bg-slate-50 text-slate-500 text-[10px] uppercase tracking-wide`
- Formularios → `rounded-xl border border-slate-200 bg-white p-5 shadow-sm`
- Botones primarios → `rounded-lg bg-blue-600 px-3 py-2 text-[12px] font-semibold text-white hover:bg-blue-700`
- Botones outline → `rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] font-medium text-slate-700 hover:bg-slate-50`

Usar `AlertRow` y `DroneStatusRow` donde corresponda.

- [ ] **Step 3: Compilar**

```bash
cd frontend && npm run build 2>&1 | grep -E "error" | grep -v "node_modules" | head -20
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/dashboard/alerts/page.tsx \
        frontend/src/app/dashboard/drones/page.tsx \
        frontend/src/app/dashboard/detections/page.tsx \
        frontend/src/app/dashboard/users/page.tsx \
        frontend/src/app/dashboard/config/page.tsx \
        frontend/src/app/dashboard/admin/pending-review/page.tsx \
        frontend/src/app/dashboard/logs/page.tsx
git commit -m "style: pages restantes — alerts, drones, detections, users, config, revision, logs"
```

---

## Task 11: Style pass — familiar flow + login/register

**Files:**
- Modify: `frontend/src/app/dashboard/familiar/page.tsx`
- Modify: `frontend/src/app/dashboard/familiar/report/page.tsx`
- Modify: `frontend/src/app/dashboard/notifications/page.tsx`
- Modify: `frontend/src/app/login/page.tsx`
- Modify: `frontend/src/app/register/page.tsx`

- [ ] **Step 1: Leer páginas**

```bash
head -40 frontend/src/app/dashboard/familiar/page.tsx
head -40 frontend/src/app/login/page.tsx
```

- [ ] **Step 2: Familiar flow — mismo patrón `p-5` + `PageHeader`**

Mantener toda la lógica, sólo cambiar presentación siguiendo el patrón del Task 10.

- [ ] **Step 3: Login page — centrado, card blanca**

El login/register deben verse así:
```tsx
<div className="flex min-h-screen items-center justify-center bg-slate-100">
  <div className="w-full max-w-sm">
    {/* Logo */}
    <div className="mb-6 text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600">
        {/* drone icon SVG */}
      </div>
      <h1 className="text-xl font-bold text-slate-900">AEROFINDER</h1>
      <p className="mt-0.5 text-sm text-slate-500">Sistema de búsqueda con drones</p>
    </div>
    {/* Card con formulario */}
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      {/* form existente con clases actualizadas */}
    </div>
  </div>
</div>
```

Inputs: `w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500`

- [ ] **Step 4: Compilar final**

```bash
cd frontend && npm run build 2>&1 | tail -30
```
Expected: `✓ Compiled successfully` o similar sin errores.

- [ ] **Step 5: Lint**

```bash
cd frontend && npm run lint 2>&1 | tail -20
```

- [ ] **Step 6: Commit final**

```bash
git add frontend/src/app/dashboard/familiar/ \
        frontend/src/app/dashboard/notifications/page.tsx \
        frontend/src/app/login/page.tsx \
        frontend/src/app/register/page.tsx
git commit -m "style: familiar flow + login/register — estilo Modern Clean completo"
```

---

## Self-Review

**Spec coverage:**
- ✅ Topbar con breadcrumb dinámico, rol chip, campana, avatar — Task 2 + 4
- ✅ Sidebar colapsable (52px/216px), secciones, badges tiempo real — Task 3 + 4
- ✅ KPIs reales sin hardcode: missionsApi, dronesApi, alertsApi, detectionsApi, usersApi, fieldReportsApi — Task 7 + 8
- ✅ recognition_active + face_recognition_active visible en MissionRow — Task 6
- ✅ WS live feed con tipos detection/alert/telemetry — Task 8
- ✅ yolo_confidence + facenet_similarity con barras — Task 6
- ✅ content_level en AlertRow (full/partial/confirmation_only) — Task 6
- ✅ Drone hls_url + auto_created + batería — Task 6
- ✅ Field reports con approve/reject inline — Task 6 + fieldReportsApi.approve/reject — Task 6 Step 6
- ✅ Resto de páginas con nuevo estilo — Task 9 + 10 + 11
- ✅ Login/register con nuevo estilo — Task 11
- ✅ PWA rescatistas (`/app/*`) no se toca — fuera de alcance

**Placeholder scan:** Ningún TBD o TODO en el plan. El Task 10 Step 2 describe el patrón de clases con ejemplos concretos en lugar de código página por página (cada página tiene estructura diferente que requiere leer antes de editar — el pattern es suficiente).

**Type consistency:**
- `FeedEvent` definido en `LiveFeed.tsx` e importado en `dashboard/page.tsx` ✅
- `SidebarBadges` definido en `Sidebar.tsx` e importado en `useSidebarBadges.ts` ✅
- `fieldReportsApi.approve/reject` añadidos en Task 6 Step 6 antes de ser usados en `FieldReportRow` ✅
- `detectionsApi.list({ limit })` — se verifica en Task 4 Step 2 antes de usarse en `useSidebarBadges` ✅

// =============================================================================
// AEROFINDER — Sidebar colapsable con íconos + labels, secciones y badges
// Colapsado: 52px (solo íconos). Expandido: 216px (íconos + labels).
// =============================================================================

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import type { RoleName } from "@/lib/types";

interface NavItem {
  label:  string;
  href:   string;
  roles:  RoleName[];
  icon:   React.ReactNode;
  badge?: number | null;
}

export interface SidebarBadges {
  missions:   number;
  alerts:     number;
  detections: number;
  review:     number;
}

interface SidebarProps {
  isOpen:  boolean;
  badges:  SidebarBadges;
}

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
  connect: (
    <svg viewBox="0 0 24 24" className="h-[17px] w-[17px] stroke-current fill-none flex-shrink-0" strokeWidth={1.8}>
      <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
      <rect x="3" y="14" width="7" height="7"/>
      <path d="M14 14h.01M14 17h.01M17 14h.01M17 17h.01M20 14h.01M20 17h.01M20 20h.01M17 20h.01M14 20h.01"/>
    </svg>
  ),
};

function NavPill({ count, color }: { count: number; color: "red" | "blue" | "amber" }) {
  if (!count) return null;
  const cls = { red: "bg-red-100 text-red-700", blue: "bg-blue-100 text-blue-700", amber: "bg-amber-100 text-amber-700" }[color];
  return (
    <span className={`ml-auto rounded-full px-1.5 py-px text-[9px] font-bold ${cls}`}>
      {count > 99 ? "99+" : count}
    </span>
  );
}

function NavLink({ item, isOpen, isActive }: { item: NavItem; isOpen: boolean; isActive: boolean }) {
  return (
    <Link
      href={item.href}
      title={isOpen ? undefined : item.label}
      className={`flex h-9 items-center gap-2.5 rounded-lg px-2.5 transition-colors ${
        isActive ? "bg-blue-50 text-blue-600" : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
      } ${isOpen ? "w-full" : "w-9 justify-center"}`}
    >
      {item.icon}
      {isOpen && (
        <>
          <span className="text-[13px] font-medium truncate">{item.label}</span>
          {item.badge != null && item.badge > 0 && (
            <NavPill
              count={item.badge}
              color={item.href.includes("alerts") ? "red" : item.href.includes("missions") ? "blue" : "amber"}
            />
          )}
        </>
      )}
    </Link>
  );
}

function SectionLabel({ label, isOpen }: { label: string; isOpen: boolean }) {
  if (!isOpen) return <div className="h-2" />;
  return (
    <p className="mt-2 mb-1 px-2.5 text-[9px] font-semibold uppercase tracking-widest text-slate-400">
      {label}
    </p>
  );
}

export function Sidebar({ isOpen, badges }: SidebarProps) {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();

  if (!user) return null;
  const role = user.role as RoleName;

  const ALL_ITEMS: NavItem[] = [
    { label: "Dashboard",      href: "/dashboard",                      roles: ["admin","buscador","ayudante","familiar"], icon: Icons.home                                 },
    { label: "Misiones",       href: "/dashboard/missions",             roles: ["admin","buscador","ayudante"],            icon: Icons.missions,  badge: badges.missions   },
    { label: "Personas",       href: "/dashboard/persons",              roles: ["admin","buscador"],                       icon: Icons.persons                              },
    { label: "Detecciones",    href: "/dashboard/detections",           roles: ["admin","buscador","ayudante"],            icon: Icons.detections,badge: badges.detections },
    { label: "Drones",         href: "/dashboard/drones",               roles: ["admin","buscador"],                       icon: Icons.drones                               },
    { label: "Alertas",        href: "/dashboard/alerts",               roles: ["admin","buscador","ayudante"],            icon: Icons.alerts,    badge: badges.alerts     },
    { label: "Revisión",       href: "/dashboard/admin/pending-review", roles: ["admin","ayudante"],                       icon: Icons.review,    badge: badges.review     },
    { label: "Panel admin",    href: "/dashboard/admin",                roles: ["admin"],                                  icon: Icons.home                                 },
    { label: "Usuarios",       href: "/dashboard/users",                roles: ["admin"],                                  icon: Icons.users                                },
    { label: "Config",         href: "/dashboard/config",               roles: ["admin"],                                  icon: Icons.config                               },
    { label: "Auditoría",      href: "/dashboard/logs",                 roles: ["admin"],                                  icon: Icons.logs                                 },
    { label: "Reportar",       href: "/dashboard/familiar/report",      roles: ["familiar"],                               icon: Icons.report                               },
    { label: "Mis casos",      href: "/dashboard/familiar",             roles: ["familiar"],                               icon: Icons.myCases                              },
    { label: "Notificaciones", href: "/dashboard/notifications",        roles: ["familiar"],                               icon: Icons.bell                                 },
  ];

  const opsItems   = ALL_ITEMS.filter(i => i.roles.includes(role) && !i.href.includes("admin") && !i.href.includes("users") && !i.href.includes("config") && !i.href.includes("logs"));
  const adminItems = ALL_ITEMS.filter(i => i.roles.includes(role) && (i.href.includes("admin") || i.href.includes("users") || i.href.includes("config") || i.href.includes("logs")));
  const isActive   = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <aside className={`flex h-screen flex-col border-r border-slate-200 bg-white transition-all duration-200 flex-shrink-0 overflow-hidden ${isOpen ? "w-[216px]" : "w-[52px]"}`}>
      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
        <SectionLabel label="Operaciones" isOpen={isOpen} />
        {opsItems.map((item) => <NavLink key={item.href} item={item} isOpen={isOpen} isActive={isActive(item.href)} />)}

        {adminItems.length > 0 && (
          <>
            <SectionLabel label="Admin" isOpen={isOpen} />
            {adminItems.map((item) => <NavLink key={item.href} item={item} isOpen={isOpen} isActive={isActive(item.href)} />)}
          </>
        )}

        <div className="flex-1" />

        {/* Link Conectar — admin y buscador */}
        {(role === "admin" || role === "buscador") && (
          <Link
            href="/connect"
            title={isOpen ? undefined : "Conectar"}
            className={`flex h-9 items-center gap-2.5 rounded-lg px-2.5 transition-colors ${
              pathname === "/connect"
                ? "bg-blue-50 text-blue-600"
                : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
            } ${isOpen ? "w-full" : "w-9 justify-center"}`}
          >
            {Icons.connect}
            {isOpen && <span className="text-[13px] font-medium">Conectar</span>}
          </Link>
        )}

        <button
          onClick={() => logout()}
          title={isOpen ? undefined : "Cerrar sesión"}
          className={`flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-red-500 hover:bg-red-50 transition-colors ${isOpen ? "w-full" : "w-9 justify-center"}`}
        >
          {Icons.logout}
          {isOpen && <span className="text-[13px] font-medium">Cerrar sesión</span>}
        </button>
      </nav>
    </aside>
  );
}

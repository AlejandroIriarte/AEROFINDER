// =============================================================================
// AEROFINDER — Sidebar colapsable con grupos de navegación por rol
// Grupos: según rol (super_admin / admin / operacional / familiar)
// =============================================================================

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import { CollapsibleNavGroup } from "@/components/layout/CollapsibleNavGroup";
import type { RoleName } from "@/lib/types";

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

// ── Íconos SVG ────────────────────────────────────────────────────────────────
const Icons = {
  home: <svg viewBox="0 0 24 24" className="h-[17px] w-[17px] stroke-current fill-none flex-shrink-0" strokeWidth={1.8}><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  missions: <svg viewBox="0 0 24 24" className="h-[17px] w-[17px] stroke-current fill-none flex-shrink-0" strokeWidth={1.8}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>,
  persons: <svg viewBox="0 0 24 24" className="h-[17px] w-[17px] stroke-current fill-none flex-shrink-0" strokeWidth={1.8}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  detections: <svg viewBox="0 0 24 24" className="h-[17px] w-[17px] stroke-current fill-none flex-shrink-0" strokeWidth={1.8}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
  drones: <svg viewBox="0 0 24 24" className="h-[17px] w-[17px] stroke-current fill-none flex-shrink-0" strokeWidth={1.8}><circle cx="12" cy="12" r="3"/><path d="M5 5l3 3M19 5l-3 3M5 19l3-3M19 19l-3-3"/><circle cx="5" cy="5" r="2"/><circle cx="19" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="19" r="2"/></svg>,
  alerts: <svg viewBox="0 0 24 24" className="h-[17px] w-[17px] stroke-current fill-none flex-shrink-0" strokeWidth={1.8}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  review: <svg viewBox="0 0 24 24" className="h-[17px] w-[17px] stroke-current fill-none flex-shrink-0" strokeWidth={1.8}><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>,
  users: <svg viewBox="0 0 24 24" className="h-[17px] w-[17px] stroke-current fill-none flex-shrink-0" strokeWidth={1.8}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  config: <svg viewBox="0 0 24 24" className="h-[17px] w-[17px] stroke-current fill-none flex-shrink-0" strokeWidth={1.8}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  logs: <svg viewBox="0 0 24 24" className="h-[17px] w-[17px] stroke-current fill-none flex-shrink-0" strokeWidth={1.8}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  report: <svg viewBox="0 0 24 24" className="h-[17px] w-[17px] stroke-current fill-none flex-shrink-0" strokeWidth={1.8}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  bell: <svg viewBox="0 0 24 24" className="h-[17px] w-[17px] stroke-current fill-none flex-shrink-0" strokeWidth={1.8}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
  logout: <svg viewBox="0 0 24 24" className="h-[17px] w-[17px] stroke-current fill-none flex-shrink-0" strokeWidth={1.8}><path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>,
  connect: <svg viewBox="0 0 24 24" className="h-[17px] w-[17px] stroke-current fill-none flex-shrink-0" strokeWidth={1.8}><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h.01M14 17h.01M17 14h.01M17 17h.01M20 14h.01M20 17h.01M20 20h.01M17 20h.01M14 20h.01"/></svg>,
  health: <svg viewBox="0 0 24 24" className="h-[17px] w-[17px] stroke-current fill-none flex-shrink-0" strokeWidth={1.8}><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>,
  lock: <svg viewBox="0 0 24 24" className="h-[17px] w-[17px] stroke-current fill-none flex-shrink-0" strokeWidth={1.8}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>,
  trash: <svg viewBox="0 0 24 24" className="h-[17px] w-[17px] stroke-current fill-none flex-shrink-0" strokeWidth={1.8}><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>,
  network: <svg viewBox="0 0 24 24" className="h-[17px] w-[17px] stroke-current fill-none flex-shrink-0" strokeWidth={1.8}><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>,
};

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

function NavLink({
  href, label, icon, isOpen, isActive, badge, badgeColor,
}: {
  href: string; label: string; icon: React.ReactNode;
  isOpen: boolean; isActive: boolean;
  badge?: number | null; badgeColor?: "red" | "blue" | "amber";
}) {
  return (
    <Link
      href={href}
      title={isOpen ? undefined : label}
      className={`flex h-9 items-center gap-2.5 rounded-lg px-2.5 transition-colors ${
        isActive ? "bg-blue-50 text-blue-600" : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
      } ${isOpen ? "w-full" : "w-9 justify-center"}`}
    >
      {icon}
      {isOpen && (
        <>
          <span className="text-[13px] font-medium truncate">{label}</span>
          {badge != null && badge > 0 && <NavPill count={badge} color={badgeColor ?? "amber"} />}
        </>
      )}
    </Link>
  );
}

export function Sidebar({ isOpen, badges }: SidebarProps) {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();

  if (!user) return null;
  const role = user.role as RoleName;
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <aside className={`
      flex h-screen flex-col border-r border-slate-200 bg-white transition-all duration-200
      overflow-hidden flex-shrink-0 fixed top-0 left-0 z-50 md:relative md:translate-x-0
      ${isOpen ? "translate-x-0 w-[216px]" : "-translate-x-full md:translate-x-0 w-[216px] md:w-[52px]"}
    `}>
      <nav className="flex flex-1 flex-col overflow-y-auto p-2 gap-0">

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
                  <NavLink href="/dashboard/map" label="Mapa en tiempo real" icon={<svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>} isOpen={isOpen} isActive={isActive("/dashboard/map")} />
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
                <NavLink href="/dashboard/map" label="Mapa en tiempo real" icon={<svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>} isOpen={false} isActive={isActive("/dashboard/map")} />
                <NavLink href="/dashboard/superadmin" label="Técnico" icon={Icons.health} isOpen={false} isActive={isActive("/dashboard/superadmin")} />
                <NavLink href="/dashboard/superadmin/config" label="Config" icon={Icons.config} isOpen={false} isActive={isActive("/dashboard/superadmin/config")} />
              </>
            )}
          </>
        )}

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
                <NavLink href="/dashboard/map" label="Mapa en tiempo real" icon={<svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>} isOpen={isOpen} isActive={isActive("/dashboard/map")} />
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
                <NavLink href="/dashboard/map" label="Mapa en tiempo real" icon={<svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>} isOpen={false} isActive={isActive("/dashboard/map")} />
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

        {/* ── FAMILIAR ─────────────────────────────────────────── */}
        {role === "familiar" && (
          <>
            <NavLink href="/dashboard" label="Dashboard" icon={Icons.home} isOpen={isOpen} isActive={pathname === "/dashboard"} />
            <NavLink href="/dashboard/familiar" label="Mis casos" icon={Icons.persons} isOpen={isOpen} isActive={isActive("/dashboard/familiar") && !pathname.includes("report")} />
            <NavLink href="/dashboard/familiar/report" label="Reportar" icon={Icons.report} isOpen={isOpen} isActive={isActive("/dashboard/familiar/report")} />
            <NavLink href="/dashboard/notifications" label="Alertas en tiempo real" icon={Icons.bell} isOpen={isOpen} isActive={isActive("/dashboard/notifications")} />
          </>
        )}

        <div className="flex-1" />

        {/* Conectar — buscador */}
        {role === "buscador" && (
          <NavLink href="/connect" label="Conectar" icon={Icons.connect} isOpen={isOpen} isActive={pathname === "/connect"} />
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

// frontend/src/components/layout/BottomNav.tsx
// Barra de navegación fija en el fondo — solo visible en móvil (md:hidden)
// Muestra 3 items según el rol + botón "Más" que llama onOpenDrawer

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { RoleName } from "@/lib/types";

interface BottomNavItem {
  label: string;
  href:  string;
  icon:  React.ReactNode;
}

interface BottomNavProps {
  role:          RoleName;
  onOpenDrawer:  () => void;
}

const IcoHome = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8}>
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
    <polyline points="9 22 9 12 15 12 15 22"/>
  </svg>
);
const IcoPersons = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8}>
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
);
const IcoMissions = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8}>
    <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
    <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
  </svg>
);
const IcoAlerts = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8}>
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
    <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>
);
const IcoCases = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8}>
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
    <circle cx="12" cy="7" r="4"/>
  </svg>
);
const IcoReport = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8}>
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
);
const IcoBell = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8}>
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
    <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
  </svg>
);
const IcoMore = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8}>
    <line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>
  </svg>
);

const ITEMS_BY_ROLE: Record<RoleName, BottomNavItem[]> = {
  admin:    [
    { label: "Inicio",    href: "/dashboard",          icon: <IcoHome /> },
    { label: "Personas",  href: "/dashboard/persons",  icon: <IcoPersons /> },
    { label: "Misiones",  href: "/dashboard/missions", icon: <IcoMissions /> },
  ],
  buscador: [
    { label: "Inicio",    href: "/dashboard",          icon: <IcoHome /> },
    { label: "Personas",  href: "/dashboard/persons",  icon: <IcoPersons /> },
    { label: "Misiones",  href: "/dashboard/missions", icon: <IcoMissions /> },
  ],
  ayudante: [
    { label: "Inicio",    href: "/dashboard",          icon: <IcoHome /> },
    { label: "Misiones",  href: "/dashboard/missions", icon: <IcoMissions /> },
    { label: "Alertas",   href: "/dashboard/alerts",   icon: <IcoAlerts /> },
  ],
  familiar: [
    { label: "Mis casos", href: "/dashboard/familiar",        icon: <IcoCases /> },
    { label: "Reportar",  href: "/dashboard/familiar/report", icon: <IcoReport /> },
    { label: "Avisos",    href: "/dashboard/notifications",   icon: <IcoBell /> },
  ],
};

export function BottomNav({ role, onOpenDrawer }: BottomNavProps) {
  const pathname = usePathname();
  const items    = ITEMS_BY_ROLE[role] ?? ITEMS_BY_ROLE.familiar;

  const isActive = (href: string) =>
    href === "/dashboard"
      ? pathname === href
      : pathname === href || pathname.startsWith(href + "/");

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 flex h-16 items-center justify-around border-t border-slate-200 bg-white px-2 pb-safe">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-1 transition-colors ${
            isActive(item.href) ? "text-blue-600" : "text-slate-400"
          }`}
        >
          {item.icon}
          <span className="text-[9px] font-medium">{item.label}</span>
        </Link>
      ))}
      <button
        onClick={onOpenDrawer}
        className="flex flex-1 flex-col items-center justify-center gap-0.5 py-1 text-slate-400 transition-colors hover:text-slate-700"
      >
        <IcoMore />
        <span className="text-[9px] font-medium">Más</span>
      </button>
    </nav>
  );
}

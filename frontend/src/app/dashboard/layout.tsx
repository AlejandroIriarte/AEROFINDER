// =============================================================================
// AEROFINDER Frontend — Layout del dashboard con sidebar por rol
// Protección de ruta: redirige a /login si no hay sesión.
// Muestra solo las rutas permitidas según el rol del usuario.
// =============================================================================

"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/store/auth";
import type { RoleName } from "@/lib/types";

// ── Navegación por rol ────────────────────────────────────────────────────────

interface NavItem {
  label: string;
  href:  string;
  roles: RoleName[];   // roles que pueden ver este item
}

// Todos los items del sidebar; se filtran por rol al renderizar
const NAV_ITEMS: NavItem[] = [
  { label: "Panel admin",     href: "/dashboard/admin",         roles: ["admin"] },
  { label: "Misiones",        href: "/dashboard/missions",      roles: ["admin", "buscador", "ayudante"] },
  { label: "Personas",        href: "/dashboard/persons",       roles: ["admin", "buscador"] },
  { label: "Drones",          href: "/dashboard/drones",        roles: ["admin", "buscador"] },
  { label: "Usuarios",        href: "/dashboard/users",         roles: ["admin"] },
  { label: "Alertas",         href: "/dashboard/alerts",        roles: ["admin", "ayudante"] },
  { label: "Configuración",   href: "/dashboard/config",        roles: ["admin"] },
  { label: "Auditoría",       href: "/dashboard/logs",          roles: ["admin"] },
  { label: "Notificaciones",  href: "/dashboard/notifications", roles: ["familiar"] },
];

// ── Badge de rol ──────────────────────────────────────────────────────────────

const ROLE_COLOR: Record<RoleName, string> = {
  admin:    "bg-purple-600 text-white",
  buscador: "bg-blue-600   text-white",
  ayudante: "bg-green-600  text-white",
  familiar: "bg-amber-500  text-white",
};

const ROLE_LABEL: Record<RoleName, string> = {
  admin:    "Admin",
  buscador: "Buscador",
  ayudante: "Ayudante",
  familiar: "Familiar",
};

function RoleBadge({ role }: { role: RoleName }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${ROLE_COLOR[role]}`}>
      {ROLE_LABEL[role]}
    </span>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

function Sidebar({ role, userName }: { role: RoleName; userName: string }) {
  const pathname = usePathname();
  const logout   = useAuthStore((s) => s.logout);

  // Filtrar items visibles para el rol actual
  const navItems = NAV_ITEMS.filter((item) => item.roles.includes(role));

  return (
    <aside className="flex h-screen w-56 flex-col bg-gray-900 text-gray-100 shadow-lg">
      {/* Header: nombre y rol */}
      <div className="border-b border-gray-700 px-4 py-5">
        <p className="text-lg font-bold tracking-tight text-white">AEROFINDER</p>
        <p className="mt-1 truncate text-sm text-gray-300 font-medium">{userName}</p>
        <div className="mt-2">
          <RoleBadge role={role} />
        </div>
      </div>

      {/* Navegación filtrada por rol */}
      <nav className="flex-1 overflow-y-auto px-2 py-4">
        <ul className="space-y-0.5">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-blue-700 text-white"
                      : "text-gray-300 hover:bg-gray-700 hover:text-white"
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer: nombre de usuario + logout */}
      <div className="border-t border-gray-700 px-4 py-4">
        <p className="mb-2 truncate text-[11px] text-gray-500">{userName}</p>
        <button
          onClick={() => logout()}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-gray-400 transition-colors hover:bg-gray-700 hover:text-white"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}

// ── Layout principal ──────────────────────────────────────────────────────────

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router          = useRouter();
  const user            = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading       = useAuthStore((s) => s.isLoading);
  const loadUser        = useAuthStore((s) => s.loadUser);

  // Restaurar sesión desde cookie al montar
  useEffect(() => {
    if (!isAuthenticated && !isLoading) {
      loadUser();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Redirigir a login si no autenticado y la carga terminó
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isLoading, isAuthenticated, router]);

  // Spinner mientras se verifica la sesión
  if (isLoading || !isAuthenticated || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-900">
        <div className="text-center text-gray-400">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-gray-600 border-t-blue-500" />
          <p className="text-sm">Verificando sesión…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar role={user.role} userName={user.full_name} />
      <main className="flex-1 overflow-auto bg-gray-50">
        {children}
      </main>
    </div>
  );
}

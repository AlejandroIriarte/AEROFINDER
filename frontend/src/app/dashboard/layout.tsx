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
import { BottomNav } from "@/components/layout/BottomNav";
import { NotificationProvider } from "@/components/notifications/NotificationProvider";
import { GlobalToasts } from "@/components/notifications/GlobalToasts";
import { useSidebarBadges } from "@/hooks/useSidebarBadges";

// Constante a nivel de módulo — se inicializa una sola vez al cargar el módulo
const BREADCRUMB_EXACT: Record<string, string> = {
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

  if (BREADCRUMB_EXACT[pathname]) return BREADCRUMB_EXACT[pathname];

  // Rutas dinámicas por patrón
  if (/^\/dashboard\/missions\/[^/]+$/.test(pathname)) return "Detalle de misión";
  if (/^\/dashboard\/persons\/[^/]+$/.test(pathname))  return "Detalle de persona";

  // Prefijo más largo como fallback
  const prefix = Object.keys(BREADCRUMB_EXACT)
    .filter((k) => pathname.startsWith(k + "/"))
    .sort((a, b) => b.length - a.length)[0];
  return prefix ? BREADCRUMB_EXACT[prefix] : "Dashboard";
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
        {/* Backdrop overlay — solo en móvil cuando sidebar está abierto */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/40 md:hidden"
            onClick={toggleSidebar}
          />
        )}
        <Sidebar isOpen={sidebarOpen} badges={badges} />
        <main className="flex-1 overflow-y-auto bg-slate-100 pb-16 md:pb-0">
          {children}
        </main>
      </div>
      <BottomNav role={user.role} onOpenDrawer={toggleSidebar} />
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

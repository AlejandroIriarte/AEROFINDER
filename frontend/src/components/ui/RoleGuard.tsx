// =============================================================================
// AEROFINDER Frontend — RoleGuard
// Wrapper que renderiza children solo si el rol del usuario está permitido.
// Si no está permitido renderiza fallback o redirige a /dashboard.
// Protección client-side; la barrera real es el middleware del servidor.
// =============================================================================

"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import type { RoleName } from "@/lib/types";

interface RoleGuardProps {
  allowedRoles: RoleName[];
  children:     React.ReactNode;
  fallback?:    React.ReactNode;
  redirectTo?:  string;
}

export function RoleGuard({
  allowedRoles,
  children,
  fallback,
  redirectTo = "/dashboard",
}: RoleGuardProps) {
  const router     = useRouter();
  const user       = useAuthStore((s) => s.user);
  const isLoading  = useAuthStore((s) => s.isLoading);

  const hasAccess = user ? allowedRoles.includes(user.role) : false;

  useEffect(() => {
    // Solo redirigir si la sesión ya cargó, hay usuario y no tiene acceso
    if (!isLoading && user && !hasAccess && !fallback) {
      router.replace(redirectTo);
    }
  }, [isLoading, user, hasAccess, fallback, redirectTo, router]);

  // Mientras carga: no renderizar nada (el layout ya muestra spinner)
  if (isLoading || !user) return null;

  if (!hasAccess) {
    return fallback ? <>{fallback}</> : null;
  }

  return <>{children}</>;
}

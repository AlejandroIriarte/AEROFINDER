// =============================================================================
// AEROFINDER Frontend — AuthProvider
// Registra el store de Zustand en window para que el interceptor de axios
// pueda acceder al access_token sin importar el store directamente.
// =============================================================================

"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/store/auth";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const loadUser = useAuthStore((s) => s.loadUser);

  // Registrar el store en window al montar (solo en browser)
  useEffect(() => {
    if (typeof window !== "undefined") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__aerofinder_auth_store = useAuthStore;
    }
    // Intentar restaurar sesión desde cookie de refresh al cargar la app
    loadUser();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return <>{children}</>;
}

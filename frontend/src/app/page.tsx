// =============================================================================
// AEROFINDER Frontend — Página raíz
// Redirige a /dashboard si hay sesión activa, a /login si no.
// Se ejecuta en el servidor (sin "use client").
// =============================================================================

import { redirect } from "next/navigation";
import { cookies } from "next/headers";

export default function RootPage() {
  // Detectar cookie de refresh token para determinar el destino
  // La verificación real del token ocurre en el layout de /dashboard
  const cookieStore = cookies();
  const hasRefreshToken = cookieStore.has("aerofinder_refresh");

  if (hasRefreshToken) {
    redirect("/dashboard");
  } else {
    redirect("/login");
  }
}

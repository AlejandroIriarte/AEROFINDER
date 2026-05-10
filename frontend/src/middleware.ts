// =============================================================================
// AEROFINDER Frontend — Middleware de Next.js para protección de rutas
//
// Ejecuta en el Edge Runtime antes de que la página se renderice.
// Verifica que exista la cookie del refresh token para rutas protegidas.
// La validación real del JWT ocurre en el servidor (backend FastAPI).
//
// Rutas protegidas:
//   /dashboard/* — requiere sesión (cualquier rol)
//   /app/*       — requiere sesión (rescatistas en campo)
//
// Rutas públicas:
//   /login, /register, /connect, /public/*
// =============================================================================

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const REFRESH_COOKIE = "aerofinder_refresh";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Solo actúa en rutas protegidas
  const isProtected =
    pathname.startsWith("/dashboard") || pathname.startsWith("/app");

  if (!isProtected) return NextResponse.next();

  // Verifica presencia del refresh token (cookie HttpOnly)
  const hasSession = request.cookies.has(REFRESH_COOKIE);

  if (!hasSession) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/app/:path*"],
};

// =============================================================================
// AEROFINDER Frontend — Store de autenticación (Zustand)
// El access_token vive solo en memoria. El refresh_token en cookie httpOnly-like.
// =============================================================================

"use client";

import { create } from "zustand";
import Cookies from "js-cookie";
import { authApi } from "@/lib/api";
import type { User } from "@/lib/types";

const REFRESH_COOKIE  = "aerofinder_refresh";
// Cookie con SameSite=Strict y 7 días de vida
const COOKIE_OPTIONS  = { expires: 7, sameSite: "Strict" as const };

interface AuthState {
  user:            User | null;
  accessToken:     string | null;
  isLoading:       boolean;
  isAuthenticated: boolean;

  // Acciones
  login:          (email: string, password: string) => Promise<void>;
  logout:         () => Promise<void>;
  refreshToken:   () => Promise<boolean>;
  loadUser:       () => Promise<void>;
  setAccessToken: (token: string) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user:            null,
  accessToken:     null,
  isLoading:       false,
  isAuthenticated: false,

  // ── Setter interno para que el interceptor de axios actualice el token ───────
  setAccessToken: (token: string) => {
    set({ accessToken: token, isAuthenticated: true });
  },

  // ── Login ────────────────────────────────────────────────────────────────────
  login: async (email: string, password: string) => {
    set({ isLoading: true });
    try {
      const response = await authApi.login(email, password);

      // Guardar access_token solo en memoria
      set({
        user:            response.user,
        accessToken:     response.access_token,
        isAuthenticated: true,
        isLoading:       false,
      });

      // Guardar refresh_token en cookie (persiste entre tabs)
      // Nota: el backend devuelve el refresh_token en el body de /auth/login
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const refreshToken = (response as any).refresh_token as string | undefined;
      if (refreshToken) {
        Cookies.set(REFRESH_COOKIE, refreshToken, COOKIE_OPTIONS);
      }
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  // ── Logout ───────────────────────────────────────────────────────────────────
  logout: async () => {
    try {
      await authApi.logout();
    } catch {
      // Silenciar: el logout local se completa siempre
    } finally {
      Cookies.remove(REFRESH_COOKIE);
      set({
        user:            null,
        accessToken:     null,
        isAuthenticated: false,
        isLoading:       false,
      });
    }
  },

  // ── Refresh automático ────────────────────────────────────────────────────────
  refreshToken: async (): Promise<boolean> => {
    const refreshToken = Cookies.get(REFRESH_COOKIE);
    if (!refreshToken) return false;

    try {
      const newToken = await authApi.refresh(refreshToken);
      set({ accessToken: newToken, isAuthenticated: true });
      return true;
    } catch {
      // Token inválido o expirado: limpiar sesión
      Cookies.remove(REFRESH_COOKIE);
      set({ user: null, accessToken: null, isAuthenticated: false });
      return false;
    }
  },

  // ── Carga del usuario al restaurar sesión ─────────────────────────────────────
  loadUser: async () => {
    const { accessToken, refreshToken: doRefresh } = get() as AuthState & {
      refreshToken: () => Promise<boolean>;
    };

    // Si no hay token en memoria, intentar refresh desde cookie
    if (!accessToken) {
      const refreshed = await doRefresh();
      if (!refreshed) return;
    }

    set({ isLoading: true });
    try {
      const user = await authApi.me();
      set({ user, isAuthenticated: true, isLoading: false });
    } catch {
      // Token inválido: limpiar
      set({
        user:            null,
        accessToken:     null,
        isAuthenticated: false,
        isLoading:       false,
      });
      Cookies.remove(REFRESH_COOKIE);
    }
  },
}));

// ── Registrar store en window para que el interceptor de axios lo acceda ──────
// Solo en browser; el interceptor usa getTokenFromStore() que lee esta referencia
if (typeof window !== "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).__aerofinder_auth_store = useAuthStore;
}

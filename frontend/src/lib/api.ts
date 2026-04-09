// =============================================================================
// AEROFINDER Frontend — Cliente HTTP centralizado (axios)
// Interceptores: agrega JWT en requests, refresca token en 401.
// =============================================================================

import axios, {
  AxiosInstance,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from "axios";
import Cookies from "js-cookie";
import type {
  Alert,
  AuditLog,
  Detection,
  Drone,
  LoginResponse,
  Mission,
  MissingPerson,
  SystemConfig,
  User,
} from "@/lib/types";

// Nombre de la cookie donde se guarda el refresh token
const REFRESH_COOKIE = "aerofinder_refresh";

// ── Instancia base ────────────────────────────────────────────────────────────

const api: AxiosInstance = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  headers: { "Content-Type": "application/json" },
  timeout: 15_000,
});

// ── Interceptor de request: agrega Bearer token desde el store ────────────────
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  // Importación dinámica para evitar circular dependency con el store
  // El token vive solo en memoria (no en cookie/localStorage)
  const { accessToken } = getTokenFromStore();
  if (accessToken && config.headers) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

// ── Interceptor de response: manejo de 401 con refresh automático ─────────────
let _isRefreshing = false;
let _refreshQueue: Array<{
  resolve: (token: string) => void;
  reject: (err: unknown) => void;
}> = [];

api.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error) => {
    const originalRequest = error.config;

    // Solo actuar ante 401 y sin loop de reintento
    if (error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    if (_isRefreshing) {
      // Encolar requests que llegaron mientras se refresca
      return new Promise((resolve, reject) => {
        _refreshQueue.push({ resolve, reject });
      }).then((token) => {
        originalRequest.headers.Authorization = `Bearer ${token}`;
        return api(originalRequest);
      });
    }

    _isRefreshing = true;

    try {
      const refreshToken = Cookies.get(REFRESH_COOKIE);
      if (!refreshToken) throw new Error("Sin refresh token");

      const { data } = await axios.post<{ access_token: string }>(
        `${process.env.NEXT_PUBLIC_API_URL}/auth/refresh`,
        { refresh_token: refreshToken }
      );

      const newToken = data.access_token;
      setTokenInStore(newToken);

      // Despachar a todos los requests encolados
      _refreshQueue.forEach(({ resolve }) => resolve(newToken));
      _refreshQueue = [];

      originalRequest.headers.Authorization = `Bearer ${newToken}`;
      return api(originalRequest);
    } catch (refreshError) {
      _refreshQueue.forEach(({ reject }) => reject(refreshError));
      _refreshQueue = [];
      // Refresh fallido → logout y redirección
      await performLogout();
      return Promise.reject(refreshError);
    } finally {
      _isRefreshing = false;
    }
  }
);

// ── Acceso al store sin importar directamente (evita circular deps) ───────────

function getTokenFromStore(): { accessToken: string | null } {
  if (typeof window === "undefined") return { accessToken: null };
  try {
    // Acceso directo al estado de Zustand en memoria
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const store = (window as any).__aerofinder_auth_store;
    return { accessToken: store?.getState?.()?.accessToken ?? null };
  } catch {
    return { accessToken: null };
  }
}

function setTokenInStore(token: string): void {
  if (typeof window === "undefined") return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const store = (window as any).__aerofinder_auth_store;
    store?.getState?.()?.setAccessToken?.(token);
  } catch {
    // Silencioso: si el store no está disponible el request igual se reintenta
  }
}

async function performLogout(): Promise<void> {
  Cookies.remove(REFRESH_COOKIE);
  if (typeof window !== "undefined") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const store = (window as any).__aerofinder_auth_store;
    await store?.getState?.()?.logout?.();
    window.location.href = "/login";
  }
}

// ── API de autenticación ──────────────────────────────────────────────────────

export const authApi = {
  async login(
    email: string,
    password: string
  ): Promise<LoginResponse> {
    // El backend espera form-data para /auth/login (OAuth2PasswordRequestForm)
    const params = new URLSearchParams({ username: email, password });
    const { data } = await api.post<LoginResponse>("/auth/login", params, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    return data;
  },

  async logout(): Promise<void> {
    await api.post("/auth/logout").catch(() => {
      // Silenciar errores: logout local siempre se completa
    });
  },

  async me(): Promise<User> {
    const { data } = await api.get<User>("/auth/me");
    return data;
  },

  async refresh(refreshToken: string): Promise<string> {
    const { data } = await api.post<{ access_token: string }>(
      "/auth/refresh",
      { refresh_token: refreshToken }
    );
    return data.access_token;
  },
};

// ── API de misiones ───────────────────────────────────────────────────────────

export const missionsApi = {
  async list(): Promise<Mission[]> {
    const { data } = await api.get<Mission[]>("/missions/");
    return data;
  },

  async get(id: string): Promise<Mission> {
    const { data } = await api.get<Mission>(`/missions/${id}`);
    return data;
  },

  async create(payload: Partial<Mission>): Promise<Mission> {
    const { data } = await api.post<Mission>("/missions/", payload);
    return data;
  },

  async update(id: string, payload: Partial<Mission>): Promise<Mission> {
    const { data } = await api.patch<Mission>(`/missions/${id}`, payload);
    return data;
  },
};

// ── API de personas desaparecidas ─────────────────────────────────────────────

export const personsApi = {
  async list(): Promise<MissingPerson[]> {
    const { data } = await api.get<MissingPerson[]>("/persons/");
    return data;
  },

  async get(id: string): Promise<MissingPerson> {
    const { data } = await api.get<MissingPerson>(`/persons/${id}`);
    return data;
  },
};

// ── API de drones ─────────────────────────────────────────────────────────────

export const dronesApi = {
  async list(): Promise<Drone[]> {
    const { data } = await api.get<Drone[]>("/drones/");
    return data;
  },
};

// ── API de alertas ────────────────────────────────────────────────────────────

export const alertsApi = {
  async list(missionId?: string): Promise<Alert[]> {
    const params = missionId ? { mission_id: missionId } : {};
    const { data } = await api.get<Alert[]>("/alerts/", { params });
    return data;
  },

  async acknowledge(id: string): Promise<void> {
    await api.patch(`/alerts/${id}`, { status: "confirmed" });
  },

  async dismiss(id: string): Promise<void> {
    await api.patch(`/alerts/${id}`, { status: "dismissed" });
  },
};

// ── API de detecciones ────────────────────────────────────────────────────────

export const detectionsApi = {
  async list(missionId: string): Promise<Detection[]> {
    const { data } = await api.get<Detection[]>("/detections/", {
      params: { mission_id: missionId },
    });
    return data;
  },
};

// ── API de configuración del sistema ─────────────────────────────────────────

export const systemApi = {
  async listConfig(): Promise<SystemConfig[]> {
    const { data } = await api.get<SystemConfig[]>("/system/config");
    return data;
  },

  async updateConfig(id: string, value_text: string): Promise<SystemConfig> {
    const { data } = await api.patch<SystemConfig>(`/system/config/${id}`, { value_text });
    return data;
  },

  async auditLog(limit = 10): Promise<AuditLog[]> {
    const { data } = await api.get<AuditLog[]>("/system/audit-log", { params: { limit } });
    return data;
  },
};

// Exportar instancia para uso directo en casos especiales
export default api;

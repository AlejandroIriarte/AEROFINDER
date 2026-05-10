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
  Detection,
  DetectionReview,
  DetectionVerdict,
  Drone,
  DroneCreate,
  DroneUpdate,
  FieldReport,
  LoginResponse,
  MissingPersonStatus,
  MissionDrone,
  PhotoFaceAngle,
  PhotoResponse,
  PhotoUploadUrlResponse,
  PersonReportCreate,
  RegisterResponse,
  Mission,
  MissingPerson,
  PersonCreate,
  SystemConfig,
  UploadUrlResponse,
  User,
  UserCreate,
  UserUpdate,
  NetworkInfo,
  StreamInfo,
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
  async register(
    email: string,
    password: string,
    fullName: string,
    phone?: string
  ): Promise<RegisterResponse> {
    const { data } = await api.post<RegisterResponse>("/auth/register", {
      email,
      password,
      full_name: fullName,
      phone: phone || null,
    });
    return data;
  },

  async login(
    email: string,
    password: string
  ): Promise<LoginResponse> {
    const { data } = await api.post<LoginResponse>("/auth/login", { email, password });
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

  async listDrones(missionId: string): Promise<MissionDrone[]> {
    const { data } = await api.get<MissionDrone[]>(`/missions/${missionId}/drones`);
    return data;
  },

  async assignDrone(missionId: string, droneId: string): Promise<MissionDrone> {
    const { data } = await api.post<MissionDrone>(`/missions/${missionId}/drones`, {
      drone_id: droneId,
    });
    return data;
  },

  async unassignDrone(missionId: string, droneId: string): Promise<void> {
    await api.delete(`/missions/${missionId}/drones/${droneId}`);
  },

  async setRecognition(missionId: string, personDetection: boolean, faceRecognition: boolean): Promise<Mission> {
    const { data } = await api.post<Mission>(`/missions/${missionId}/recognition`, {
      person_detection: personDetection,
      face_recognition: faceRecognition,
    });
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

  async create(payload: PersonCreate): Promise<MissingPerson> {
    const { data } = await api.post<MissingPerson>("/persons/", payload);
    return data;
  },

  async update(id: string, payload: Partial<PersonCreate>): Promise<MissingPerson> {
    const { data } = await api.patch<MissingPerson>(`/persons/${id}`, payload);
    return data;
  },

  async approve(id: string): Promise<MissingPerson> {
    const { data } = await api.post<MissingPerson>(`/persons/${id}/approve`);
    return data;
  },

  async report(payload: PersonReportCreate): Promise<MissingPerson> {
    const { data } = await api.post<MissingPerson>("/persons/report", payload);
    return data;
  },

  async listPending(): Promise<MissingPerson[]> {
    const { data } = await api.get<MissingPerson[]>("/persons/pending-review");
    return data;
  },

  async updateStatus(id: string, status: MissingPersonStatus): Promise<MissingPerson> {
    const { data } = await api.patch<MissingPerson>(`/persons/${id}/status`, { status });
    return data;
  },
};

// ── API de fotos (presigned URL flow) ────────────────────────────────────────

export const photosApi = {
  async requestUploadUrl(
    personId: string,
    faceAngle: PhotoFaceAngle = "unknown"
  ): Promise<PhotoUploadUrlResponse> {
    const { data } = await api.post<PhotoUploadUrlResponse>(
      `/persons/${personId}/photos/upload-url`,
      { face_angle: faceAngle }
    );
    return data;
  },

  async uploadToPresignedUrl(uploadUrl: string, file: File): Promise<void> {
    await axios.put(uploadUrl, file, {
      headers: { "Content-Type": file.type || "image/jpeg" },
      timeout: 60_000,
    });
  },

  async confirm(personId: string, photoId: string): Promise<PhotoResponse> {
    const { data } = await api.post<PhotoResponse>(
      `/persons/${personId}/photos/confirm`,
      { photo_id: photoId }
    );
    return data;
  },

  async list(personId: string): Promise<PhotoResponse[]> {
    const { data } = await api.get<PhotoResponse[]>(
      `/persons/${personId}/photos`
    );
    return data;
  },

  async patch(personId: string, photoId: string, is_active: boolean): Promise<PhotoResponse> {
    const { data } = await api.patch<PhotoResponse>(
      `/persons/${personId}/photos/${photoId}`,
      { is_active }
    );
    return data;
  },
};

// ── API de drones ─────────────────────────────────────────────────────────────

export const dronesApi = {
  async list(): Promise<Drone[]> {
    const { data } = await api.get<Drone[]>("/drones/");
    return data;
  },

  async listStreams(): Promise<StreamInfo[]> {
    const { data } = await api.get<StreamInfo[]>("/drones/streams");
    return data;
  },

  async get(id: string): Promise<Drone> {
    const { data } = await api.get<Drone>(`/drones/${id}`);
    return data;
  },

  async create(payload: DroneCreate): Promise<Drone> {
    const { data } = await api.post<Drone>("/drones/", payload);
    return data;
  },

  async update(id: string, payload: DroneUpdate): Promise<Drone> {
    const { data } = await api.patch<Drone>(`/drones/${id}`, payload);
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
  async list(params?: {
    mission_id?: string;
    missing_person_id?: string;
    is_reviewed?: boolean;
    skip?: number;
    limit?: number;
  }): Promise<Detection[]> {
    const { data } = await api.get<Detection[]>("/detections/", { params });
    return data;
  },

  async get(detectionId: string): Promise<Detection> {
    const { data } = await api.get<Detection>(`/detections/${detectionId}`);
    return data;
  },

  async listReviews(detectionId: string): Promise<DetectionReview[]> {
    const { data } = await api.get<DetectionReview[]>(`/detections/${detectionId}/reviews`);
    return data;
  },

  async submitReview(
    detectionId: string,
    verdict: DetectionVerdict,
    notes?: string
  ): Promise<DetectionReview> {
    const { data } = await api.post<DetectionReview>(
      `/detections/${detectionId}/reviews`,
      { verdict, notes: notes ?? null }
    );
    return data;
  },
};

// ── API de configuración del sistema ─────────────────────────────────────────

export const systemApi = {
  async listConfig(): Promise<SystemConfig[]> {
    const { data } = await api.get<SystemConfig[]>("/config/");
    return data;
  },

  async getConfig(key: string): Promise<SystemConfig> {
    const { data } = await api.get<SystemConfig>(`/config/${key}`);
    return data;
  },

  async updateConfig(config_key: string, value_text: string): Promise<SystemConfig> {
    const { data } = await api.patch<SystemConfig>(`/config/${config_key}`, { value_text });
    return data;
  },

  async getNetworkInfo(): Promise<NetworkInfo> {
    const { data } = await api.get<NetworkInfo>("/config/network-info");
    return data;
  },
};

// ── API de usuarios ───────────────────────────────────────────────────────────

export const usersApi = {
  async listRoles(): Promise<{ id: string; name: string; description: string | null }[]> {
    const { data } = await api.get("/users/roles");
    return data;
  },

  async list(): Promise<User[]> {
    const { data } = await api.get<User[]>("/users/");
    return data;
  },

  async get(id: string): Promise<User> {
    const { data } = await api.get<User>(`/users/${id}`);
    return data;
  },

  async create(payload: UserCreate): Promise<User> {
    const { data } = await api.post<User>("/users/", payload);
    return data;
  },

  async update(id: string, payload: Partial<UserUpdate>): Promise<User> {
    const { data } = await api.patch<User>(`/users/${id}`, payload);
    return data;
  },

  async deactivate(id: string): Promise<void> {
    await api.delete(`/users/${id}`);
  },
};

// ── Field Reports API ─────────────────────────────────────────────────────────

export const fieldReportsApi = {
  async listForMission(missionId: string): Promise<FieldReport[]> {
    const { data } = await api.get<FieldReport[]>(`/missions/${missionId}/field-reports`);
    return data;
  },

  async create(missionId: string, payload: {
    notes?: string;
    location_lat?: number;
    location_lon?: number;
  }): Promise<{ id: string; status: string }> {
    const { data } = await api.post(`/missions/${missionId}/field-reports`, payload);
    return data;
  },

  async get(reportId: string): Promise<FieldReport> {
    const { data } = await api.get<FieldReport>(`/field-reports/${reportId}`);
    return data;
  },

  async approve(reportId: string): Promise<FieldReport> {
    const { data } = await api.patch<FieldReport>(`/field-reports/${reportId}/approve`);
    return data;
  },

  async reject(reportId: string, reason: string): Promise<FieldReport> {
    const { data } = await api.patch<FieldReport>(`/field-reports/${reportId}/reject`, { reason });
    return data;
  },

  async getUploadUrl(reportId: string, photoIndex: number): Promise<UploadUrlResponse> {
    const { data } = await api.post<UploadUrlResponse>(
      `/field-reports/${reportId}/photos/upload-url`,
      null,
      { params: { photo_index: photoIndex } }
    );
    return data;
  },

  async confirmPhoto(reportId: string, objectName: string): Promise<void> {
    await api.post(`/field-reports/${reportId}/photos/confirm`, { object_name: objectName });
  },

  async analyze(reportId: string): Promise<void> {
    await api.post(`/field-reports/${reportId}/analyze`);
  },
};

// ── Push Notifications API ────────────────────────────────────────────────────

export const pushApi = {
  async subscribe(subscription: PushSubscriptionJSON): Promise<void> {
    const keys = subscription.keys as { p256dh: string; auth: string };
    await api.post("/push/subscribe", {
      endpoint: subscription.endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
    });
  },

  async unsubscribe(endpoint: string): Promise<void> {
    await api.delete("/push/subscribe", { data: { endpoint } });
  },
};

// Exportar instancia para uso directo en casos especiales
export default api;

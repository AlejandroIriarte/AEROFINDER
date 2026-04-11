// =============================================================================
// AEROFINDER Frontend — Tipos e interfaces TypeScript
// Espejo de los schemas del backend (schemas/ y models/enums.py)
// =============================================================================

// ── Enums como union types ────────────────────────────────────────────────────

export type RoleName = "admin" | "buscador" | "ayudante" | "familiar";

export type MissionStatus =
  | "planned"
  | "active"
  | "paused"
  | "completed"
  | "interrupted"
  | "cancelled";

export type DroneStatus =
  | "available"
  | "in_mission"
  | "maintenance"
  | "out_of_service";

export type MissingPersonStatus =
  | "pending_review"
  | "active"
  | "found_alive"
  | "found_deceased"
  | "false_report"
  | "archived";

export type DetectionType =
  | "person_silhouette"
  | "face_candidate"
  | "face_match";

export type AlertType =
  | "face_match_confirmed"
  | "face_match_probable"
  | "face_match_possible";

export type AlertStatus = "generated" | "sent" | "confirmed" | "dismissed";

export type AlertContentLevel = "full" | "partial" | "confirmation_only";

export type NotificationChannel = "push" | "email" | "sms";

// ── Entidades principales ─────────────────────────────────────────────────────

export interface Role {
  id: string;
  name: RoleName;
  description: string | null;
}

export interface User {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  role: RoleName;
  is_active: boolean;
  last_login_at: string | null;
}

export interface MissingPerson {
  id: string;
  full_name: string;
  date_of_birth: string | null;
  age_at_disappearance: number | null;
  gender: string | null;
  physical_description: string | null;
  last_known_location: string | null;
  last_seen_at: string | null;
  disappeared_at: string;
  status: MissingPersonStatus;
  reporter_name: string | null;
  reporter_contact: string | null;
  found_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Drone {
  id: string;
  serial_number: string;
  model: string;
  manufacturer: string;
  status: DroneStatus;
  battery_warning_pct: number;
  max_flight_time_minutes: number | null;
  assigned_to_user_id: string | null;
  rtmp_stream_key: string | null;
  notes: string | null;
  registered_at: string;
  updated_at: string;
}

export interface GeoJsonPolygon {
  type: "Polygon";
  coordinates: number[][][];
}

export interface Mission {
  id: string;
  name: string;
  description: string | null;
  missing_person_id: string;
  status: MissionStatus;
  lead_user_id: string;
  planned_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  notes: string | null;
  // Polígono PostGIS serializado como GeoJSON por el backend
  search_area: GeoJsonPolygon | null;
  created_at: string;
  updated_at: string;
}

export interface Detection {
  id: string;
  mission_id: string;
  drone_id: string;
  missing_person_id: string;
  frame_timestamp: string;
  yolo_confidence: number;
  facenet_similarity: number;
  bounding_box: {
    x: number;
    y: number;
    w: number;
    h: number;
    frame_w: number;
    frame_h: number;
  };
  gps_latitude: number | null;
  gps_longitude: number | null;
  snapshot_file_id: string | null;
  snapshot_url: string | null;
  is_reviewed: boolean;
  created_at: string;
}

export interface Alert {
  id: string;
  detection_id: string;
  recipient_user_id: string | null;
  content_level: AlertContentLevel;
  status: AlertStatus;
  message_text: string | null;
  generated_at: string;
  updated_at: string;
}

export interface TelemetryPoint {
  type: "telemetry";
  drone_id: string;
  mission_id: string;
  lat: number;
  lng: number;
  altitude_m: number;
  battery_pct: number;
  heading_deg: number;
  speed_mps: number;
  timestamp: number;
}

export interface SystemConfig {
  id: string;
  config_key: string;
  value_text: string;
  value_type: "string" | "integer" | "float" | "boolean" | "json";
  description: string | null;
  min_value: string | null;
  max_value: string | null;
  updated_at: string;
}

export interface AuditLog {
  id: string;
  table_name: string;
  operation: "INSERT" | "UPDATE" | "DELETE";
  record_id: string;
  changed_by: string | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  changed_at: string;
}

// ── Tipos de respuesta de la API ──────────────────────────────────────────────

export interface LoginResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
}

// ── Tipos de mensajes WebSocket ───────────────────────────────────────────────

export type WSMessageType =
  | "connected"
  | "pong"
  | "telemetry"
  | "detection"
  | "alert"
  | "mission_update";

export interface WSMessage {
  type: WSMessageType;
  [key: string]: unknown;
}

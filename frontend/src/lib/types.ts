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

export type PhotoFaceAngle = "frontal" | "profile" | "three_quarter" | "unknown";

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
  physical_attributes: PhysicalAttributes | null;
  photos_requested_at?: string | null;
}

// ── Atributos físicos estructurados ──────────────────────────────────────────

export interface PhysicalAttributes {
  weight_kg?: number;
  build?: string;              // delgado/normal/robusto/corpulento
  skin_tone?: string;          // muy_claro/claro/medio/moreno/oscuro
  hair_color?: string;         // negro/castaño/rubio/pelirrojo/canoso/blanco/calvo
  hair_length?: string;        // calvo/muy_corto/corto/mediano/largo
  eye_color?: string;          // negros/marrones/verdes/azules/grises/miel
  wears_glasses?: boolean;
  facial_hair?: string;        // ninguno/barba/bigote/barba_y_bigote/incipiente
  distinguishing_marks?: string;
  clothing_upper?: string;
  clothing_lower?: string;
  clothing_footwear?: string;
  clothing_accessories?: string;
  ai_analyzed?: boolean;
  ai_confidence?: number;
}

// ── Resultado análisis de foto ────────────────────────────────────────────────

export interface PhotoAnalysisResult {
  quality: {
    is_useful: boolean;
    face_detected: boolean;
    face_angle: string;
    blur_score: number;
    issues: string[];
    issue_labels: string[];
  };
  attributes: {
    skin_tone?: string;
    hair_color?: string;
  };
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
  notes: string | null;
  stream_url?: string | null;
  registered_at: string;
  updated_at: string;
  auto_created: boolean;
  rtmp_url: string | null;
  hls_url: string | null;
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
  recognition_active: boolean;
  face_recognition_active: boolean;
  created_at: string;
  updated_at: string;
}

export type DetectionVerdict = "confirmed" | "false_positive" | "uncertain";

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

export interface DetectionReview {
  id: string;
  detection_id: string;
  reviewed_by: string;
  verdict: DetectionVerdict;
  notes: string | null;
  reviewed_at: string;
}

export interface Alert {
  id: string;
  detection_id: string;
  recipient_user_id: string | null;
  mission_id: string | null;          // opcional — el backend aún no lo expone, pero lo soportamos
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

// ── Fotos ────────────────────────────────────────────────────────────────────

export interface PhotoUploadUrlResponse {
  upload_url: string;
  photo_id: string;
  object_key: string;
  expires_in: number;
}

export interface PhotoResponse {
  id: string;
  missing_person_id: string;
  file_id: string;
  face_angle: PhotoFaceAngle;
  quality_score: number | null;
  has_embedding: boolean;
  is_active: boolean;
  uploaded_by: string | null;
  created_at: string;
  view_url: string | null;
}

// ── Tipos de respuesta de la API ──────────────────────────────────────────────

export interface LoginResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
}

export interface RegisterResponse {
  id: string;
  email: string;
  full_name: string;
  role: RoleName;
  is_active: boolean;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
}

// ── Tipos de creación/actualización ──────────────────────────────────────────

export interface UserCreate {
  email: string;
  password: string;
  full_name: string;
  phone?: string;
  role_id: string;
}

export interface UserUpdate {
  full_name?: string;
  phone?: string;
  is_active?: boolean;
  role_id?: string;
}

export interface DroneCreate {
  serial_number: string;
  model: string;
  manufacturer?: string;
  battery_warning_pct?: number;
  max_flight_time_minutes?: number;
  notes?: string;
  stream_url?: string;
}

export interface DroneUpdate {
  model?: string;
  manufacturer?: string;
  status?: DroneStatus;
  battery_warning_pct?: number;
  max_flight_time_minutes?: number;
  notes?: string;
  stream_url?: string | null;
}

export interface PersonCreate {
  full_name: string;
  disappeared_at: string;
  date_of_birth?: string;
  age_at_disappearance?: number;
  gender?: string;
  physical_description?: string;
  height_cm?: number;
  last_known_clothing?: string;
  last_known_location?: string;
  last_seen_at?: string;
  reporter_name?: string;
  reporter_contact?: string;
}

export interface PersonReportCreate {
  full_name: string;
  disappeared_at: string;
  date_of_birth?: string;
  age_at_disappearance?: number;
  gender?: string;
  physical_description?: string;
  height_cm?: number;
  last_known_location?: string;
  last_seen_at?: string;
  physical_attributes?: PhysicalAttributes;
}

// ── Drones de misión ──────────────────────────────────────────��──────────────

export interface MissionDrone {
  id: string;
  mission_id: string;
  drone_id: string;
  joined_at: string;
  left_at: string | null;
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

// ── Red / URLs de dron ────────────────────────────────────────────────────────

export interface NetworkInfo {
  server_ip: string;
  rtmp_port: number;
  hls_port: number;
  rtmp_url_template: string;
  hls_url_template: string;
  rtsp_url_template: string;
}

export interface StreamInfo {
  serial: string;
  ready: boolean;
  rtmp_url: string;
  hls_url: string;
  rtsp_url: string;
  registered_drone: Drone | null;
}

// ── Field Reports ─────────────────────────────────────────────────────────────

export interface FieldReportMatch {
  person_id: string;
  person_name: string;
  similarity_score: number;   // 0.0 a 1.0
  rank: number;
  photo_url: string | null;
}

export interface FieldReportPhoto {
  id: string;
  minio_object: string;
  uploaded_at: string;
}

export interface FieldReport {
  id: string;
  mission_id: string;
  rescuer_id: string;
  rescuer_name: string;
  status: "pending" | "approved" | "rejected" | "analyzing" | "completed";
  notes: string | null;
  location_lat: number | null;
  location_lon: number | null;
  approved_by: string | null;
  approved_at: string | null;
  completed_at: string | null;
  created_at: string;
  photos: FieldReportPhoto[];
  matches: FieldReportMatch[];
}

export interface UploadUrlResponse {
  presigned_url: string;
  object_name: string;
  photo_index: number;
}

// ── OCR de documentos ─────────────────────────────────────────────────────────

export interface OcrDocumentResult {
  document_type:   "ci_boliviana" | "passport" | "other";
  full_name:       string | null;
  date_of_birth:   string | null;   // ISO YYYY-MM-DD
  gender:          string | null;   // "M" | "F"
  document_number: string | null;
  address:         string | null;
}

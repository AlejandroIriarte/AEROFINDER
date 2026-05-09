// =============================================================================
// AEROFINDER Frontend — Marcador de detección en el mapa Leaflet
// Color por tipo. Popup con confianza, similitud, snapshot y coordenadas.
// Animación pulsante para face_match alerts críticos.
// =============================================================================

"use client";

import { CircleMarker, Popup } from "react-leaflet";
import type { DetectionType, RoleName } from "@/lib/types";

// ── Mensaje WS de detección (desde detection_consumer.py BE-5) ───────────────

export interface DetectionWSMessage {
  type: "detection" | "alert";
  detection_id: string;
  mission_id: string;
  drone_id: string;
  detection_type: DetectionType;
  yolo_confidence: number;
  similarity_score: number;
  matched_person_id: string | null;
  bbox: {
    x: number; y: number; w: number; h: number;
    frame_w: number; frame_h: number;
  };
  gps: { lat: number; lng: number; altitude_m: number | null };
  snapshot_url: string | null;
  frame_timestamp: string;
  alert_id?: string;
  // Nombre de la persona si viene enriquecido
  person_name?: string;
}

// ── Configuración por tipo de detección ──────────────────────────────────────

const TYPE_CONFIG: Record<DetectionType, { color: string; label: string; radius: number }> = {
  person_silhouette: { color: "#3b82f6", label: "Silueta",         radius: 8  },
  face_candidate:    { color: "#eab308", label: "Posible rostro",  radius: 10 },
  face_match:        { color: "#ef4444", label: "Coincidencia",    radius: 12 },
};

// ── Helper: calcular zona aproximada sin GPS (para ayudante) ─────────────────

function getZoneLabel(
  lat: number,
  lng: number,
  centerLat: number,
  centerLng: number
): string {
  const dy = lat - centerLat;
  const dx = lng - centerLng;
  const angle = (Math.atan2(dx, dy) * 180) / Math.PI;

  if (angle > -22.5 && angle <= 22.5)  return "Sector Norte";
  if (angle > 22.5  && angle <= 67.5)  return "Sector Noreste";
  if (angle > 67.5  && angle <= 112.5) return "Sector Este";
  if (angle > 112.5 && angle <= 157.5) return "Sector Sureste";
  if (angle > 157.5 || angle <= -157.5) return "Sector Sur";
  if (angle > -157.5 && angle <= -112.5) return "Sector Suroeste";
  if (angle > -112.5 && angle <= -67.5)  return "Sector Oeste";
  return "Sector Noroeste";
}

// ── Props del componente ──────────────────────────────────────────────────────

interface DetectionMarkerProps {
  detection: DetectionWSMessage;
  userRole:  RoleName;
  // Centro del área de búsqueda para calcular zona aproximada
  centerLat?: number;
  centerLng?: number;
  isPulsing?: boolean; // true para face_match críticos (alert WS)
}

// ── Componente principal ──────────────────────────────────────────────────────

export function DetectionMarker({
  detection,
  userRole,
  centerLat = 0,
  centerLng = 0,
  isPulsing = false,
}: DetectionMarkerProps) {
  const { gps, detection_type, yolo_confidence, similarity_score,
          snapshot_url, frame_timestamp, person_name } = detection;

  if (!gps?.lat || !gps?.lng) return null;

  const config      = TYPE_CONFIG[detection_type] ?? TYPE_CONFIG.person_silhouette;
  const canSeeGPS   = userRole === "admin" || userRole === "buscador";
  const zoneLabel   = !canSeeGPS
    ? getZoneLabel(gps.lat, gps.lng, centerLat, centerLng)
    : null;

  const timestamp = new Date(frame_timestamp).toLocaleTimeString("es-BO", {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });

  // Efecto pulsante via className en el elemento SVG del CircleMarker
  // Leaflet CircleMarker renderiza un SVG; la animación se logra con pathOptions
  const pathOptions = {
    color:       config.color,
    fillColor:   config.color,
    fillOpacity: isPulsing ? 0.7 : 0.5,
    weight:      isPulsing ? 3 : 2,
    opacity:     1,
  };

  return (
    <CircleMarker
      center={[gps.lat, gps.lng]}
      radius={config.radius}
      pathOptions={pathOptions}
    >
      <Popup minWidth={200} maxWidth={260}>
        <div className="space-y-2 text-xs">
          {/* Encabezado */}
          <div className="flex items-center gap-2">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: config.color }}
            />
            <span className="font-semibold text-gray-800">{config.label}</span>
            {isPulsing && (
              <span className="rounded bg-red-100 px-1 py-0.5 text-[10px] text-red-700 font-bold">
                ALERTA
              </span>
            )}
          </div>

          {/* Métricas de confianza */}
          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
            <span className="text-gray-500">Confianza YOLO</span>
            <span className="font-medium">{(yolo_confidence * 100).toFixed(1)}%</span>

            {detection_type !== "person_silhouette" && (
              <>
                <span className="text-gray-500">Similitud facial</span>
                <span className="font-medium text-red-600">
                  {(similarity_score * 100).toFixed(1)}%
                </span>
              </>
            )}

            {detection_type === "face_match" && person_name && (
              <>
                <span className="text-gray-500">Persona</span>
                <span className="font-semibold text-red-700">{person_name}</span>
              </>
            )}
          </div>

          {/* Coordenadas: visibles solo para admin y buscador */}
          {canSeeGPS ? (
            <div className="rounded bg-gray-50 px-2 py-1 font-mono text-[10px] text-gray-600">
              {gps.lat.toFixed(6)}, {gps.lng.toFixed(6)}
              {gps.altitude_m != null && (
                <span className="ml-2 text-gray-400">↑{gps.altitude_m.toFixed(0)}m</span>
              )}
            </div>
          ) : (
            <div className="rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-700">
              📍 {zoneLabel}
            </div>
          )}

          {/* Timestamp */}
          <p className="text-gray-400">{timestamp}</p>

          {/* Snapshot desde MinIO */}
          {snapshot_url && (
            <div className="mt-1 overflow-hidden rounded border border-gray-200">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={snapshot_url}
                alt="Snapshot de detección"
                className="w-full object-cover"
                style={{ maxHeight: 120 }}
                loading="lazy"
              />
            </div>
          )}
        </div>
      </Popup>
    </CircleMarker>
  );
}

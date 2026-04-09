// =============================================================================
// AEROFINDER Frontend — Contenido interno del mapa Leaflet
// Este archivo importa react-leaflet en el nivel superior; DEBE ser importado
// con dynamic(..., { ssr: false }) para evitar errores de window en SSR.
// =============================================================================

"use client";

import "leaflet/dist/leaflet.css";
import {
  MapContainer,
  TileLayer,
  Polygon,
  Polyline,
  ZoomControl,
} from "react-leaflet";
import L from "leaflet";

import { DroneMarker } from "@/components/map/DroneMarker";
import { DetectionMarker } from "@/components/map/DetectionMarker";
import type { DetectionWSMessage } from "@/components/map/DetectionMarker";
import type { GeoJsonPolygon, RoleName } from "@/lib/types";

// ── Corrección del ícono por defecto de Leaflet con webpack ──────────────────
// Sin esto, los markers muestran el ícono roto en Next.js
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// ── Props ─────────────────────────────────────────────────────────────────────

interface DroneState {
  lat: number;
  lng: number;
  heading_deg: number;
  altitude_m: number;
  battery_pct: number;
  speed_mps: number;
}

interface MapInnerProps {
  droneId:    string;
  droneState: DroneState | null;
  route:      [number, number][];         // historial de puntos [lat, lng]
  searchArea: GeoJsonPolygon | null;
  detections: DetectionWSMessage[];
  alertIds:   Set<string>;               // detection_ids que llegaron como "alert"
  userRole:   RoleName;
  centerLat:  number;
  centerLng:  number;
}

// ── Coordenadas por defecto: Cochabamba, Bolivia ──────────────────────────────
const DEFAULT_CENTER: [number, number] = [-17.3895, -66.1568];
const DEFAULT_ZOOM = 14;

export default function MapInner({
  droneId,
  droneState,
  route,
  searchArea,
  detections,
  alertIds,
  userRole,
  centerLat,
  centerLng,
}: MapInnerProps) {
  // Centro del mapa: primer punto del polígono o posición del dron o default
  const center: [number, number] =
    searchArea?.coordinates[0]?.[0]
      ? [searchArea.coordinates[0][0][1], searchArea.coordinates[0][0][0]]
      : droneState
      ? [droneState.lat, droneState.lng]
      : DEFAULT_CENTER;

  // Coordenadas del polígono de búsqueda (PostGIS: [lng, lat] → Leaflet: [lat, lng])
  const polygonPositions: [number, number][] =
    searchArea?.coordinates[0]?.map(([lng, lat]) => [lat, lng]) ?? [];

  return (
    <MapContainer
      center={center}
      zoom={DEFAULT_ZOOM}
      style={{ height: "100%", width: "100%" }}
      zoomControl={false}
    >
      {/* Control de zoom en esquina superior izquierda */}
      <ZoomControl position="topleft" />

      {/* Capa base de OpenStreetMap */}
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {/* Polígono del área de búsqueda */}
      {polygonPositions.length > 0 && (
        <Polygon
          positions={polygonPositions}
          pathOptions={{
            color:       "#2563eb",
            fillColor:   "#3b82f6",
            fillOpacity: 0.1,
            weight:      2,
            dashArray:   "6 4",
          }}
        />
      )}

      {/* Ruta volada (polyline) */}
      {route.length > 1 && (
        <Polyline
          positions={route}
          pathOptions={{
            color:   "#6366f1",
            weight:  2,
            opacity: 0.7,
          }}
        />
      )}

      {/* Marcador del dron en tiempo real */}
      {droneState && (
        <DroneMarker
          lat={droneState.lat}
          lng={droneState.lng}
          heading_deg={droneState.heading_deg}
          altitude_m={droneState.altitude_m}
          battery_pct={droneState.battery_pct}
          speed_mps={droneState.speed_mps}
          droneId={droneId}
        />
      )}

      {/* Marcadores de detecciones */}
      {detections.map((det) => (
        <DetectionMarker
          key={det.detection_id}
          detection={det}
          userRole={userRole}
          centerLat={centerLat}
          centerLng={centerLng}
          isPulsing={alertIds.has(det.detection_id)}
        />
      ))}
    </MapContainer>
  );
}

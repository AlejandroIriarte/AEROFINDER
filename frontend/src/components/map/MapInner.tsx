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
  CircleMarker,
  Tooltip,
} from "react-leaflet";
import L from "leaflet";

import { DroneMarker } from "@/components/map/DroneMarker";
import { DetectionMarker } from "@/components/map/DetectionMarker";
import type { DetectionWSMessage } from "@/components/map/DetectionMarker";
import type { DroneState } from "@/lib/useMultiDroneTelemetry";
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

interface MapInnerProps {
  droneStates: Record<string, DroneState>;
  routes:      Record<string, [number, number][]>;
  searchArea:  GeoJsonPolygon | null;
  detections:  DetectionWSMessage[];
  alertIds:    Set<string>;
  userRole:    RoleName;
  centerLat:   number;
  centerLng:   number;
  userPos:     [number, number] | null;
}

// ── Coordenadas por defecto: Cochabamba, Bolivia ──────────────────────────────
const DEFAULT_CENTER: [number, number] = [-17.3895, -66.1568];
const DEFAULT_ZOOM = 14;

export default function MapInner({
  droneStates,
  routes,
  searchArea,
  detections,
  alertIds,
  userRole,
  centerLat,
  centerLng,
  userPos,
}: MapInnerProps) {
  const firstDrone = Object.values(droneStates)[0] ?? null;

  // Centro: primer punto del polígono → primer dron activo → default
  const center: [number, number] =
    searchArea?.coordinates[0]?.[0]
      ? [searchArea.coordinates[0][0][1], searchArea.coordinates[0][0][0]]
      : firstDrone
      ? [firstDrone.lat, firstDrone.lng]
      : DEFAULT_CENTER;

  // Coordenadas del polígono (PostGIS: [lng, lat] → Leaflet: [lat, lng])
  const polygonPositions: [number, number][] =
    searchArea?.coordinates[0]?.map(([lng, lat]) => [lat, lng]) ?? [];

  return (
    <MapContainer
      center={center}
      zoom={DEFAULT_ZOOM}
      style={{ height: "100%", width: "100%" }}
      zoomControl={false}
    >
      <ZoomControl position="topleft" />

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

      {/* Ruta de cada dron */}
      {Object.entries(routes).map(([id, pts]) =>
        pts.length > 1 ? (
          <Polyline
            key={id}
            positions={pts}
            pathOptions={{ color: "#6366f1", weight: 2, opacity: 0.7 }}
          />
        ) : null,
      )}

      {/* Marcador de cada dron en tiempo real */}
      {Object.entries(droneStates).map(([id, state]) => (
        <DroneMarker
          key={id}
          lat={state.lat}
          lng={state.lng}
          heading_deg={state.heading_deg}
          altitude_m={state.altitude_m}
          battery_pct={state.battery_pct}
          speed_mps={state.speed_mps}
          droneId={id}
        />
      ))}

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

      {/* Posición del usuario (GPS del dispositivo) */}
      {userPos && (
        <CircleMarker
          center={userPos}
          radius={8}
          pathOptions={{
            color:       "#ffffff",
            fillColor:   "#2563eb",
            fillOpacity: 1,
            weight:      3,
          }}
        >
          <Tooltip permanent direction="top" offset={[0, -10]}>
            <span style={{ fontSize: 11 }}>📍 Tú</span>
          </Tooltip>
        </CircleMarker>
      )}
    </MapContainer>
  );
}

// =============================================================================
// AEROFINDER Frontend — Marcador del dron en el mapa Leaflet
// Ícono SVG rotado según heading_deg. Popup con datos operacionales.
// Solo se usa dentro de MapContainer (importado dinámicamente, sin SSR).
// =============================================================================

"use client";

import { useEffect, useRef } from "react";
import { Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";

interface DroneMarkerProps {
  lat: number;
  lng: number;
  heading_deg: number;
  altitude_m: number;
  battery_pct: number;
  speed_mps: number;
  droneId: string;
}

// ── SVG del dron rotado según el rumbo ────────────────────────────────────────

function buildDroneIcon(heading: number): L.DivIcon {
  const color =
    heading >= 0
      ? "#3b82f6" // azul por defecto
      : "#3b82f6";

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg"
         viewBox="0 0 32 32" width="32" height="32"
         style="transform: rotate(${heading}deg);
                transition: transform 0.5s ease;
                filter: drop-shadow(0 2px 4px rgba(0,0,0,0.4));">
      <!-- Cuerpo del dron: flecha apuntando al norte (heading 0 = arriba) -->
      <circle cx="16" cy="16" r="5" fill="${color}" opacity="0.9"/>
      <!-- Brazos -->
      <line x1="16" y1="16" x2="4"  y2="4"  stroke="${color}" stroke-width="2.5" stroke-linecap="round"/>
      <line x1="16" y1="16" x2="28" y2="4"  stroke="${color}" stroke-width="2.5" stroke-linecap="round"/>
      <line x1="16" y1="16" x2="4"  y2="28" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/>
      <line x1="16" y1="16" x2="28" y2="28" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/>
      <!-- Hélices (círculos en extremos de brazos) -->
      <circle cx="4"  cy="4"  r="3" fill="${color}" opacity="0.7"/>
      <circle cx="28" cy="4"  r="3" fill="${color}" opacity="0.7"/>
      <circle cx="4"  cy="28" r="3" fill="${color}" opacity="0.7"/>
      <circle cx="28" cy="28" r="3" fill="${color}" opacity="0.7"/>
      <!-- Dirección de vuelo: triángulo apuntando al heading -->
      <polygon points="16,2 13,10 19,10" fill="white" opacity="0.9"/>
    </svg>`;

  return L.divIcon({
    className: "", // sin clase por defecto de Leaflet
    html: svg,
    iconSize:   [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16],
  });
}

// ── Componente principal ──────────────────────────────────────────────────────

export function DroneMarker({
  lat,
  lng,
  heading_deg,
  altitude_m,
  battery_pct,
  speed_mps,
  droneId,
}: DroneMarkerProps) {
  useMap(); // acceso al contexto del mapa (requerido por react-leaflet para Marker)
  const markerRef  = useRef<L.Marker | null>(null);
  const prevLatLng = useRef<L.LatLng | null>(null);

  // Color de batería según nivel
  const batteryColor =
    battery_pct <= 20
      ? "text-red-600"
      : battery_pct <= 40
      ? "text-amber-500"
      : "text-green-600";

  // Actualizar posición con transición suave via setLatLng
  useEffect(() => {
    if (!markerRef.current) return;
    const newPos = L.latLng(lat, lng);
    if (
      prevLatLng.current &&
      prevLatLng.current.distanceTo(newPos) > 0
    ) {
      // Leaflet anima el marcador si se cambia la posición directamente
      markerRef.current.setLatLng(newPos);
    }
    prevLatLng.current = newPos;
  }, [lat, lng]);

  const icon = buildDroneIcon(heading_deg);

  return (
    <Marker
      ref={markerRef}
      position={[lat, lng]}
      icon={icon}
    >
      <Popup minWidth={180}>
        <div className="space-y-1 text-xs">
          <p className="font-semibold text-gray-800">🚁 Dron en vuelo</p>
          <p className="text-gray-500 font-mono text-[10px] truncate">{droneId}</p>
          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
            <span className="text-gray-500">Altitud</span>
            <span className="font-medium">{altitude_m.toFixed(1)} m</span>
            <span className="text-gray-500">Velocidad</span>
            <span className="font-medium">{speed_mps.toFixed(1)} m/s</span>
            <span className="text-gray-500">Rumbo</span>
            <span className="font-medium">{Math.round(heading_deg)}°</span>
            <span className="text-gray-500">Batería</span>
            <span className={`font-bold ${batteryColor}`}>{battery_pct}%</span>
          </div>
        </div>
      </Popup>
    </Marker>
  );
}

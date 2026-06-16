// frontend/src/components/map/MapView.tsx
// =============================================================================
// AEROFINDER — Componente Leaflet para visualizar posiciones GPS en tiempo real
// Se carga solo con dynamic() + ssr:false desde la página del mapa.
// =============================================================================

"use client";

import { useEffect, useRef } from "react";
import type { UserLocationState } from "@/lib/types";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface MapViewProps {
  locations: UserLocationState[];
  ownUserId: string | null;
  focusUserId: string | null;
  roleColors: Record<string, string>;
}

// Crea un ícono circular con el color del rol
function makeIcon(color: string, isOwn: boolean): L.DivIcon {
  const size = isOwn ? 14 : 12;
  const border = isOwn ? "3px solid white" : "2px solid white";
  return L.divIcon({
    className: "",
    html: `<div style="width:${size}px;height:${size}px;background:${color};border:${border};border-radius:50%;box-shadow:0 0 6px ${color};"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

export default function MapView({
  locations,
  ownUserId,
  focusUserId,
  roleColors,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Record<string, L.Marker>>({});

  // Inicializar el mapa una sola vez
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [-34.6037, -58.3816], // Buenos Aires por defecto
      zoom: 13,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current = {};
    };
  }, []);

  // Actualizar marcadores al cambiar locations
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const activeIds = new Set(locations.map((l) => l.user_id));

    // Eliminar marcadores de usuarios que ya no están
    for (const userId in markersRef.current) {
      if (!activeIds.has(userId)) {
        markersRef.current[userId].remove();
        delete markersRef.current[userId];
      }
    }

    // Agregar o actualizar marcadores
    for (const loc of locations) {
      const color = roleColors[loc.role] ?? "#64748b";
      const isOwn = loc.user_id === ownUserId;
      const icon = makeIcon(color, isOwn);
      const label = isOwn ? "Tú" : loc.user_name;

      if (markersRef.current[loc.user_id]) {
        markersRef.current[loc.user_id].setLatLng([loc.lat, loc.lng]);
        markersRef.current[loc.user_id].setIcon(icon);
      } else {
        markersRef.current[loc.user_id] = L.marker([loc.lat, loc.lng], { icon })
          .addTo(map)
          .bindTooltip(label, { permanent: false, direction: "top", offset: [0, -8] });
      }
    }
  }, [locations, ownUserId, roleColors]);

  // Volar al usuario seleccionado via chip
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusUserId) return;
    const loc = locations.find((l) => l.user_id === focusUserId);
    if (loc) map.flyTo([loc.lat, loc.lng], 16, { duration: 1 });
  }, [focusUserId, locations]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}

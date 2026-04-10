// =============================================================================
// AEROFINDER Frontend — MissionMap (componente raíz del mapa)
// Gestiona dos WebSockets (telemetría y misión), acumula ruta y detecciones,
// e importa MapInner dinámicamente para evitar errores SSR con Leaflet.
// =============================================================================

"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { useWebSocket } from "@/lib/websocket";
import type { DetectionWSMessage } from "@/components/map/DetectionMarker";
import type { GeoJsonPolygon, RoleName, TelemetryPoint } from "@/lib/types";
import { missionsApi } from "@/lib/api";
import { useAuthStore } from "@/store/auth";

// ── Importación dinámica (sin SSR) ────────────────────────────────────────────
const MapInner = dynamic(() => import("@/components/map/MapInner"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-gray-100">
      <span className="text-sm text-gray-500">Cargando mapa…</span>
    </div>
  ),
});

// ── Constantes ────────────────────────────────────────────────────────────────
const MAX_ROUTE_POINTS = 1000;
const MAX_DETECTIONS   = 100;  // máximo en memoria

// ── Props ─────────────────────────────────────────────────────────────────────

interface MissionMapProps {
  missionId: string;
  droneId:   string;
  userRole:  RoleName;
}

// ── Tipos internos ────────────────────────────────────────────────────────────

interface DroneState {
  lat:         number;
  lng:         number;
  heading_deg: number;
  altitude_m:  number;
  battery_pct: number;
  speed_mps:   number;
}

// ── Componente principal ──────────────────────────────────────────────────────

export function MissionMap({ missionId, droneId, userRole }: MissionMapProps) {
  const accessToken = useAuthStore((s) => s.accessToken);

  // Estado del mapa
  const [searchArea,  setSearchArea]  = useState<GeoJsonPolygon | null>(null);
  const [droneState,  setDroneState]  = useState<DroneState | null>(null);
  const [route,       setRoute]       = useState<[number, number][]>([]);
  const [detections,  setDetections]  = useState<DetectionWSMessage[]>([]);
  const [alertIds,    setAlertIds]    = useState<Set<string>>(new Set());
  const [centerLat,   setCenterLat]   = useState(0);
  const [centerLng,   setCenterLng]   = useState(0);

  // Ref FIFO de ruta para evitar re-renders innecesarios en el callback
  const routeRef = useRef<[number, number][]>([]);

  // ── Carga del área de búsqueda ─────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    missionsApi.get(missionId).then((mission) => {
      if (cancelled) return;
      if (mission.search_area) {
        setSearchArea(mission.search_area);
        // Centro del área de búsqueda como referencia para getZoneLabel
        const coords = mission.search_area.coordinates[0];
        if (coords?.length) {
          const avgLat = coords.reduce((s, c) => s + c[1], 0) / coords.length;
          const avgLng = coords.reduce((s, c) => s + c[0], 0) / coords.length;
          setCenterLat(avgLat);
          setCenterLng(avgLng);
        }
      }
    }).catch(() => {/* misión sin área definida, continuar */});
    return () => { cancelled = true; };
  }, [missionId]);

  // ── Handler de telemetría ──────────────────────────────────────────────────
  const handleTelemetry = useCallback((raw: unknown) => {
    const msg = raw as TelemetryPoint;
    if (msg.type !== "telemetry" || msg.drone_id !== droneId) return;

    setDroneState({
      lat:         msg.lat,
      lng:         msg.lng,
      heading_deg: msg.heading_deg,
      altitude_m:  msg.altitude_m,
      battery_pct: msg.battery_pct,
      speed_mps:   msg.speed_mps,
    });

    // Acumular ruta FIFO (máximo MAX_ROUTE_POINTS)
    const next: [number, number] = [msg.lat, msg.lng];
    routeRef.current = [
      ...routeRef.current.slice(-(MAX_ROUTE_POINTS - 1)),
      next,
    ];
    setRoute([...routeRef.current]);
  }, [droneId]);

  // ── Handler de detecciones/alertas de misión ───────────────────────────────
  const handleMissionMsg = useCallback((raw: unknown) => {
    const msg = raw as { type: string } & DetectionWSMessage;

    if (msg.type === "detection" || msg.type === "alert") {
      setDetections((prev) => {
        // Evitar duplicados por detection_id
        if (prev.some((d) => d.detection_id === msg.detection_id)) return prev;
        const next = [msg, ...prev].slice(0, MAX_DETECTIONS);
        return next;
      });

      if (msg.type === "alert") {
        setAlertIds((prev) => { const s = new Set(prev); s.add(msg.detection_id); return s; });
      }
    }
  }, []);

  // ── URLs de WebSocket ──────────────────────────────────────────────────────
  const wsBase       = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000";
  // Token puede ser null mientras la sesión carga; useWebSocket acepta null y espera
  const telemetryUrl = accessToken
    ? `${wsBase}/ws/telemetry/${droneId}?token=${accessToken}`
    : null;
  const missionUrl   = accessToken
    ? `${wsBase}/ws/missions/${missionId}?token=${accessToken}`
    : null;

  const { isConnected: telemetryOk } = useWebSocket(telemetryUrl, handleTelemetry);
  const { isConnected: missionOk   } = useWebSocket(missionUrl,   handleMissionMsg);

  // ── Últimas 5 detecciones para el panel lateral ────────────────────────────
  const recentDetections = detections.slice(0, 5);

  const typeLabel: Record<string, string> = {
    person_silhouette: "Silueta",
    face_candidate:    "Posible rostro",
    face_match:        "Coincidencia",
  };
  const typeColor: Record<string, string> = {
    person_silhouette: "bg-blue-100 text-blue-700",
    face_candidate:    "bg-yellow-100 text-yellow-700",
    face_match:        "bg-red-100 text-red-700",
  };

  return (
    <div className="relative flex h-full w-full">
      {/* Mapa (ocupa todo el espacio) */}
      <div className="flex-1">
        <MapInner
          droneId={droneId}
          droneState={droneState}
          route={route}
          searchArea={searchArea}
          detections={detections}
          alertIds={alertIds}
          userRole={userRole}
          centerLat={centerLat}
          centerLng={centerLng}
        />
      </div>

      {/* Panel lateral flotante: estado de conexión + últimas detecciones */}
      <div className="pointer-events-none absolute right-3 top-3 z-[1000] flex w-56 flex-col gap-2">
        {/* Estado de conexión */}
        <div className="pointer-events-auto rounded-lg border border-gray-200 bg-white/90 px-3 py-2 shadow-md backdrop-blur-sm">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
            Conexión
          </p>
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-600">Telemetría</span>
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                telemetryOk ? "bg-green-500" : "bg-red-400"
              }`}
            />
          </div>
          <div className="mt-0.5 flex items-center justify-between text-xs">
            <span className="text-gray-600">Misión</span>
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                missionOk ? "bg-green-500" : "bg-red-400"
              }`}
            />
          </div>
        </div>

        {/* Dron en vuelo */}
        {droneState && (
          <div className="pointer-events-auto rounded-lg border border-gray-200 bg-white/90 px-3 py-2 shadow-md backdrop-blur-sm">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
              Dron
            </p>
            <div className="grid grid-cols-2 gap-x-2 text-xs">
              <span className="text-gray-500">Alt.</span>
              <span className="font-medium">{droneState.altitude_m.toFixed(1)} m</span>
              <span className="text-gray-500">Vel.</span>
              <span className="font-medium">{droneState.speed_mps.toFixed(1)} m/s</span>
              <span className="text-gray-500">Bat.</span>
              <span
                className={`font-bold ${
                  droneState.battery_pct <= 20
                    ? "text-red-600"
                    : droneState.battery_pct <= 40
                    ? "text-amber-500"
                    : "text-green-600"
                }`}
              >
                {droneState.battery_pct}%
              </span>
            </div>
          </div>
        )}

        {/* Últimas 5 detecciones */}
        {recentDetections.length > 0 && (
          <div className="pointer-events-auto rounded-lg border border-gray-200 bg-white/90 px-3 py-2 shadow-md backdrop-blur-sm">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
              Últimas detecciones
            </p>
            <ul className="space-y-1.5">
              {recentDetections.map((det) => (
                <li key={det.detection_id} className="flex items-center gap-2">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${
                      typeColor[det.detection_type] ?? "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {typeLabel[det.detection_type] ?? det.detection_type}
                  </span>
                  <span className="truncate text-[10px] text-gray-500">
                    {new Date(det.frame_timestamp).toLocaleTimeString("es-BO", {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </span>
                  {alertIds.has(det.detection_id) && (
                    <span className="ml-auto text-[9px] font-bold text-red-600">!</span>
                  )}
                </li>
              ))}
            </ul>
            {detections.length > 5 && (
              <p className="mt-1.5 text-[10px] text-gray-400">
                +{detections.length - 5} más
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

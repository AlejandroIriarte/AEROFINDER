// =============================================================================
// AEROFINDER Frontend — MissionMap (componente raíz del mapa)
// Gestiona el WS de misión (detecciones), acumula markers, e importa
// MapInner dinámicamente. El estado de telemetría de drones llega desde
// el padre (useMultiDroneTelemetry) para evitar conexiones duplicadas.
// =============================================================================

"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useWebSocket } from "@/lib/websocket";
import type { DetectionWSMessage } from "@/components/map/DetectionMarker";
import type { DroneState } from "@/lib/useMultiDroneTelemetry";
import type { GeoJsonPolygon, RoleName } from "@/lib/types";
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
const MAX_DETECTIONS = 100;

// ── Props ─────────────────────────────────────────────────────────────────────

interface MissionMapProps {
  missionId:        string;
  droneStates:      Record<string, DroneState>;
  routes:           Record<string, [number, number][]>;
  connectedCount:   number;
  userRole:         RoleName;
}

// ── Componente principal ──────────────────────────────────────────────────────

export function MissionMap({
  missionId,
  droneStates,
  routes,
  connectedCount,
  userRole,
}: MissionMapProps) {
  const accessToken = useAuthStore((s) => s.accessToken);

  const [searchArea,  setSearchArea]  = useState<GeoJsonPolygon | null>(null);
  const [detections,  setDetections]  = useState<DetectionWSMessage[]>([]);
  const [alertIds,    setAlertIds]    = useState<Set<string>>(new Set());
  const [centerLat,   setCenterLat]   = useState(0);
  const [centerLng,   setCenterLng]   = useState(0);
  const [userPos,     setUserPos]     = useState<[number, number] | null>(null);

  // ── Geolocalización del usuario ───────────────────────────────────────────
  useEffect(() => {
    if (!navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => setUserPos([pos.coords.latitude, pos.coords.longitude]),
      () => {/* permiso denegado — silencioso */},
      { enableHighAccuracy: true, maximumAge: 5000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // ── Área de búsqueda ──────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    missionsApi.get(missionId).then((mission) => {
      if (cancelled) return;
      if (mission.search_area) {
        setSearchArea(mission.search_area);
        const coords = mission.search_area.coordinates[0];
        if (coords?.length) {
          const avgLat = coords.reduce((s, c) => s + c[1], 0) / coords.length;
          const avgLng = coords.reduce((s, c) => s + c[0], 0) / coords.length;
          setCenterLat(avgLat);
          setCenterLng(avgLng);
        }
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [missionId]);

  // ── Handler de detecciones/alertas de misión ──────────────────────────────
  const handleMissionMsg = useCallback((raw: unknown) => {
    const msg = raw as { type: string } & DetectionWSMessage;
    if (msg.type !== "detection" && msg.type !== "alert") return;

    setDetections((prev) => {
      if (prev.some((d) => d.detection_id === msg.detection_id)) return prev;
      return [msg, ...prev].slice(0, MAX_DETECTIONS);
    });

    if (msg.type === "alert") {
      setAlertIds((prev) => { const s = new Set(prev); s.add(msg.detection_id); return s; });
    }
  }, []);

  // ── WS de misión (solo detecciones para el mapa) ──────────────────────────
  const wsBase = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000";
  const missionUrl = useMemo(
    () => (accessToken ? `${wsBase}/ws/missions/${missionId}?token=${accessToken}` : null),
    [wsBase, missionId, accessToken],
  );
  const { isConnected: missionOk } = useWebSocket(missionUrl, handleMissionMsg);

  // ── Últimas 5 detecciones para el panel lateral ───────────────────────────
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

  const totalDrones = Object.keys(droneStates).length;

  return (
    <div className="relative flex h-full w-full">
      <div className="flex-1">
        <MapInner
          droneStates={droneStates}
          routes={routes}
          searchArea={searchArea}
          detections={detections}
          alertIds={alertIds}
          userRole={userRole}
          centerLat={centerLat}
          centerLng={centerLng}
          userPos={userPos}
        />
      </div>

      {/* Panel flotante: estado de conexión + drones + detecciones */}
      <div className="pointer-events-none absolute right-3 top-3 z-[1000] flex w-56 flex-col gap-2">
        {/* Estado de conexión */}
        <div className="pointer-events-auto rounded-lg border border-gray-200 bg-white/90 px-3 py-2 shadow-md backdrop-blur-sm">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
            Conexión
          </p>
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-600">
              Telemetría{totalDrones > 1 ? ` (${connectedCount}/${totalDrones})` : ""}
            </span>
            <span className={`inline-block h-2 w-2 rounded-full ${connectedCount > 0 ? "bg-green-500" : "bg-red-400"}`} />
          </div>
          <div className="mt-0.5 flex items-center justify-between text-xs">
            <span className="text-gray-600">Misión</span>
            <span className={`inline-block h-2 w-2 rounded-full ${missionOk ? "bg-green-500" : "bg-red-400"}`} />
          </div>
        </div>

        {/* Estado de cada dron */}
        {totalDrones > 0 && (
          <div className="pointer-events-auto rounded-lg border border-gray-200 bg-white/90 px-3 py-2 shadow-md backdrop-blur-sm">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
              {totalDrones === 1 ? "Dron" : `Drones (${totalDrones})`}
            </p>
            <div className="space-y-2">
              {Object.entries(droneStates).map(([id, state]) => {
                const batteryColor =
                  state.battery_pct <= 20 ? "text-red-600"
                  : state.battery_pct <= 40 ? "text-amber-500"
                  : "text-green-600";
                return (
                  <div key={id}>
                    {totalDrones > 1 && (
                      <p className="mb-0.5 font-mono text-[9px] text-gray-400 truncate">{id.slice(-8)}</p>
                    )}
                    <div className="grid grid-cols-2 gap-x-2 text-xs">
                      <span className="text-gray-500">Alt.</span>
                      <span className="font-medium">{state.altitude_m.toFixed(1)} m</span>
                      <span className="text-gray-500">Vel.</span>
                      <span className="font-medium">{state.speed_mps.toFixed(1)} m/s</span>
                      <span className="text-gray-500">Bat.</span>
                      <span className={`font-bold ${batteryColor}`}>{state.battery_pct}%</span>
                    </div>
                  </div>
                );
              })}
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
                  <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${typeColor[det.detection_type] ?? "bg-gray-100 text-gray-600"}`}>
                    {typeLabel[det.detection_type] ?? det.detection_type}
                  </span>
                  <span className="truncate text-[10px] text-gray-500">
                    {new Date(det.frame_timestamp).toLocaleTimeString("es-BO", {
                      hour: "2-digit", minute: "2-digit", second: "2-digit",
                    })}
                  </span>
                  {alertIds.has(det.detection_id) && (
                    <span className="ml-auto text-[9px] font-bold text-red-600">!</span>
                  )}
                </li>
              ))}
            </ul>
            {detections.length > 5 && (
              <p className="mt-1.5 text-[10px] text-gray-400">+{detections.length - 5} más</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

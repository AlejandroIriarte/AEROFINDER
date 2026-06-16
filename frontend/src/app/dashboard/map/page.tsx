// frontend/src/app/dashboard/map/page.tsx
// =============================================================================
// AEROFINDER — Mapa en tiempo real con posiciones GPS del equipo de búsqueda
// =============================================================================

"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuthStore } from "@/store/auth";
import { useWebSocket } from "@/lib/websocket";
import { useLocationSharing } from "@/hooks/useLocationSharing";
import { missionsApi } from "@/lib/api";
import { RoleGuard } from "@/components/ui/RoleGuard";
import type { Mission, UserLocationState, WSMessage } from "@/lib/types";

const MapView = dynamic(() => import("@/components/map/MapView"), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center bg-slate-900">
      <p className="text-slate-400 text-sm">Cargando mapa...</p>
    </div>
  ),
});

const ROLE_COLOR: Record<string, string> = {
  admin: "#3b82f6",
  super_admin: "#3b82f6",
  buscador: "#22c55e",
  ayudante: "#f59e0b",
  familiar: "#a855f7",
};

function roleLabel(role: string): string {
  const map: Record<string, string> = {
    admin: "Admin",
    super_admin: "Admin",
    buscador: "Rescatista",
    ayudante: "Ayudante",
    familiar: "Familiar",
  };
  return map[role] ?? role;
}

export default function MapPage() {
  const { user, accessToken } = useAuthStore();
  const wsUrl =
    process.env.NEXT_PUBLIC_WS_URL ??
    process.env.NEXT_PUBLIC_API_URL?.replace(/^http/, "ws") ??
    "";

  const [missions, setMissions] = useState<Mission[]>([]);
  const [selectedMissionId, setSelectedMissionId] = useState<string>("");
  const [visibleUsers, setVisibleUsers] = useState<Set<string> | null>(null);
  const [focusUserId, setFocusUserId] = useState<string | null>(null);

  // Cargar lista de misiones al montar
  useEffect(() => {
    missionsApi
      .list()
      .then((list) => {
        setMissions(list);
        if (list.length > 0) setSelectedMissionId(list[0].id);
      })
      .catch(() => {});
  }, []);

  const wsEndpoint =
    selectedMissionId && accessToken
      ? `${wsUrl}/ws/missions/${selectedMissionId}?token=${accessToken}`
      : null;

  // sendRef permite pasar send estable a useLocationSharing antes de que WS esté listo
  const sendRef = useRef<((data: string | object) => void) | null>(null);
  const stableSend = useCallback((data: string | object) => {
    sendRef.current?.(data);
  }, []);

  // Un solo llamado al hook de localización
  const { locations, ownLocation, geoError, handleIncomingLocation } =
    useLocationSharing({ send: stableSend });

  // Handler de mensajes WS entrantes
  const handleMessage = useCallback(
    (msg: WSMessage) => {
      if (msg.type === "user_location") {
        handleIncomingLocation(msg as unknown as UserLocationState);
      }
    },
    [handleIncomingLocation]
  );

  const { isConnected, send } = useWebSocket(wsEndpoint, handleMessage);

  // Mantener sendRef actualizado con la función send real del WS
  useEffect(() => {
    sendRef.current = send;
  }, [send]);

  // Resetear estado visual al cambiar de misión
  useEffect(() => {
    setVisibleUsers(null);
    setFocusUserId(null);
  }, [selectedMissionId]);

  const locationList = Object.values(locations);

  function toggleChip(userId: string) {
    setFocusUserId(userId);
    setVisibleUsers((prev) => {
      if (prev === null) return new Set([userId]);
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
        return next.size === 0 ? null : next;
      }
      next.add(userId);
      return next;
    });
  }

  const visibleLocations =
    visibleUsers === null
      ? locationList
      : locationList.filter((l) => visibleUsers.has(l.user_id));

  return (
    <RoleGuard allowedRoles={["admin", "super_admin", "buscador", "ayudante", "familiar"]}>
      <div className="flex flex-col h-full bg-slate-950">
        {/* Barra de chips y selector de misión */}
        <div className="flex items-center gap-3 px-4 py-2 bg-slate-900 border-b border-slate-800 flex-wrap">
          <select
            className="bg-slate-800 text-slate-200 text-xs rounded px-2 py-1 border border-slate-700 focus:outline-none"
            value={selectedMissionId}
            onChange={(e) => setSelectedMissionId(e.target.value)}
          >
            {missions.length === 0 && <option value="">Sin misiones</option>}
            {missions.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>

          <div className="h-4 w-px bg-slate-700" />

          {locationList.length === 0 ? (
            <span className="text-xs text-slate-500">Sin ubicaciones activas</span>
          ) : (
            locationList.map((loc) => {
              const isVisible = visibleUsers === null || visibleUsers.has(loc.user_id);
              const color = ROLE_COLOR[loc.role] ?? "#64748b";
              const isOwn = loc.user_id === user?.id;
              return (
                <button
                  key={loc.user_id}
                  onClick={() => toggleChip(loc.user_id)}
                  className="flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium transition-opacity"
                  style={{
                    backgroundColor: isVisible ? color + "33" : "transparent",
                    border: `1px solid ${color}`,
                    color: isVisible ? "#f1f5f9" : "#64748b",
                    opacity: loc.stale ? 0.5 : 1,
                  }}
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  {isOwn ? "Tú" : loc.user_name}
                  <span className="opacity-60"> · {roleLabel(loc.role)}</span>
                  {loc.stale && <span className="ml-1 opacity-50">⚠</span>}
                </button>
              );
            })
          )}

          {/* Indicador de conexión WS */}
          <div className="ml-auto flex items-center gap-1.5 text-xs">
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: isConnected ? "#22c55e" : "#ef4444" }}
            />
            <span className="text-slate-400">
              {isConnected ? "En vivo" : "Desconectado"}
            </span>
          </div>
        </div>

        {/* Mapa */}
        <div className="flex-1 relative">
          {selectedMissionId ? (
            <MapView
              locations={visibleLocations}
              ownUserId={user?.id ?? null}
              focusUserId={focusUserId}
              roleColors={ROLE_COLOR}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-slate-500 text-sm">
                Seleccioná una misión para ver el mapa
              </p>
            </div>
          )}
        </div>

        {/* Error de geolocalización */}
        {geoError && (
          <div className="px-4 py-1 bg-yellow-900/30 border-t border-yellow-800/50 text-xs text-yellow-400">
            GPS: {geoError}
          </div>
        )}

        {/* Info posición propia (debug discreto) */}
        {ownLocation && (
          <div className="px-4 py-1 bg-slate-900/60 border-t border-slate-800/50 text-xs text-slate-500">
            Tu posición: {ownLocation.lat.toFixed(5)}, {ownLocation.lng.toFixed(5)}
            {ownLocation.accuracy_m != null &&
              ` (±${Math.round(ownLocation.accuracy_m)}m)`}
          </div>
        )}
      </div>
    </RoleGuard>
  );
}

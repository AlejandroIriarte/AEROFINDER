// =============================================================================
// AEROFINDER Frontend — Panel de notificaciones (familiar)
// Feed de alertas face_match en tiempo real via WebSocket.
// Solo accesible para el rol "familiar".
// =============================================================================

"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import { useWebSocket } from "@/lib/websocket";
import { AlertCard } from "@/components/alerts/AlertCard";
import { missionsApi } from "@/lib/api";
import type { DetectionWSMessage } from "@/components/map/DetectionMarker";
import type { Mission } from "@/lib/types";

// ── Componente ────────────────────────────────────────────────────────────────

export default function NotificationsPage() {
  const router    = useRouter();
  const user      = useAuthStore((s) => s.user);
  const isLoading = useAuthStore((s) => s.isLoading);

  const [mission,    setMission]    = useState<Mission | null>(null);
  const [alerts,     setAlerts]     = useState<DetectionWSMessage[]>([]);
  const [missionId,  setMissionId]  = useState<string | null>(null);

  // Protección client-side: solo familiar
  useEffect(() => {
    if (!isLoading && user && user.role !== "familiar") {
      router.replace("/dashboard");
    }
  }, [isLoading, user, router]);

  // Buscar la misión activa asociada a este familiar
  // El backend filtra automáticamente por missing_person vinculada al familiar
  useEffect(() => {
    if (!user || user.role !== "familiar") return;
    let cancelled = false;

    missionsApi.list().then((missions) => {
      if (cancelled) return;
      // Tomar la primera misión activa disponible (el backend ya filtra por rol)
      const active = missions.find((m) => m.status === "active") ?? missions[0] ?? null;
      setMission(active ?? null);
      setMissionId(active?.id ?? null);
    }).catch(() => { /* sin misión disponible */ });

    return () => { cancelled = true; };
  }, [user]);

  // WebSocket de misión
  const wsBase     = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000";
  const wsUrl      = missionId ? `${wsBase}/ws/missions/${missionId}` : null;

  const handleWsMessage = useCallback((raw: unknown) => {
    const msg = raw as { type: string } & DetectionWSMessage;
    // Solo alertas de tipo face_match
    if (
      (msg.type === "alert" || msg.type === "detection") &&
      msg.detection_type === "face_match"
    ) {
      // Sanitizar: eliminar GPS antes de guardar (familiar nunca debe ver coords)
      const safeMsg: DetectionWSMessage = {
        ...msg,
        gps: { lat: 0, lng: 0, altitude_m: null }, // coords zeroed out
      };
      setAlerts((prev) => {
        if (prev.some((a) => a.detection_id === msg.detection_id)) return prev;
        return [safeMsg, ...prev].slice(0, 50);
      });
    }
  }, []);

  const { isConnected } = useWebSocket(wsUrl, handleWsMessage);

  // Mientras carga la sesión
  if (isLoading || !user) return null;
  // Redirección en curso
  if (user.role !== "familiar") return null;

  const personName = mission
    ? (mission as unknown as { missing_person_name?: string }).missing_person_name
    : null;

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              {personName ? `Búsqueda de ${personName}` : "Búsqueda activa"}
            </h1>
            {mission && (
              <p className="mt-0.5 text-sm text-gray-500">{mission.name}</p>
            )}
          </div>

          {/* Badge estado misión */}
          {mission && (
            <span
              className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
                mission.status === "active"
                  ? "bg-green-100 text-green-700"
                  : "bg-gray-100 text-gray-500"
              }`}
            >
              {mission.status === "active" ? "Activa" : "Inactiva"}
            </span>
          )}
        </div>

        {/* Badge de conexión WS */}
        <div className="mt-3">
          {isConnected ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700 ring-1 ring-green-200">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
              Conectado
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-600 ring-1 ring-red-200">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
              Sin conexión — reconectando...
            </span>
          )}
        </div>
      </div>

      {/* Feed de alertas */}
      {alerts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-6 py-10 text-center">
          <svg
            className="mx-auto mb-3 h-10 w-10 text-gray-300"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803 7.5 7.5 0 0015.803 15.803z"
            />
          </svg>
          <p className="text-sm font-medium text-gray-500">
            La búsqueda está en curso.
          </p>
          <p className="mt-1 text-xs text-gray-400">
            Te notificaremos cuando encontremos algo.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-xs text-gray-400">
            {alerts.length} {alerts.length === 1 ? "coincidencia detectada" : "coincidencias detectadas"}
          </p>
          {alerts.map((alert) => (
            <AlertCard
              key={alert.detection_id}
              alert={alert}
              userRole="familiar"
            />
          ))}
        </div>
      )}
    </div>
  );
}

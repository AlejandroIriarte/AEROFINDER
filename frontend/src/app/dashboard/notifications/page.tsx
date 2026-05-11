// Feed de alertas face_match en tiempo real via WebSocket. Solo rol "familiar".
"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import { useWebSocket } from "@/lib/websocket";
import { AlertCard } from "@/components/alerts/AlertCard";
import { missionsApi } from "@/lib/api";
import type { DetectionWSMessage } from "@/components/map/DetectionMarker";
import type { Mission } from "@/lib/types";
import { PageHeader } from "@/components/dashboard/PageHeader";

export default function NotificationsPage() {
  const router    = useRouter();
  const user      = useAuthStore((s) => s.user);
  const isLoading = useAuthStore((s) => s.isLoading);

  const [mission,   setMission]   = useState<Mission | null>(null);
  const [alerts,    setAlerts]    = useState<DetectionWSMessage[]>([]);
  const [missionId, setMissionId] = useState<string | null>(null);

  // Protección client-side: solo familiar
  useEffect(() => {
    if (!isLoading && user && user.role !== "familiar") {
      router.replace("/dashboard");
    }
  }, [isLoading, user, router]);

  // Buscar la misión activa asociada a este familiar
  useEffect(() => {
    if (!user || user.role !== "familiar") return;
    let cancelled = false;

    missionsApi.list().then((missions) => {
      if (cancelled) return;
      const active = missions.find((m) => m.status === "active") ?? missions[0] ?? null;
      setMission(active ?? null);
      setMissionId(active?.id ?? null);
    }).catch(() => { /* sin misión disponible */ });

    return () => { cancelled = true; };
  }, [user]);

  // WebSocket de misión
  const wsBase = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000";
  const wsUrl  = missionId ? `${wsBase}/ws/missions/${missionId}` : null;

  const handleWsMessage = useCallback((raw: unknown) => {
    const msg = raw as { type: string } & DetectionWSMessage;
    if (
      (msg.type === "alert" || msg.type === "detection") &&
      msg.detection_type === "face_match"
    ) {
      // Sanitizar: eliminar GPS antes de guardar (familiar nunca debe ver coords)
      const safeMsg: DetectionWSMessage = {
        ...msg,
        gps: { lat: 0, lng: 0, altitude_m: null },
      };
      setAlerts((prev) => {
        if (prev.some((a) => a.detection_id === msg.detection_id)) return prev;
        return [safeMsg, ...prev].slice(0, 50);
      });
    }
  }, []);

  const { isConnected } = useWebSocket(wsUrl, handleWsMessage);

  if (isLoading || !user) return null;
  if (user.role !== "familiar") return null;

  const personName = mission
    ? (mission as unknown as { missing_person_name?: string }).missing_person_name
    : null;

  return (
    <div className="p-5">
      <PageHeader
        title={personName ? `Búsqueda de ${personName}` : "Búsqueda activa"}
        subtitle={mission?.name}
      >
        <div className="flex items-center gap-2">
          {mission && (
            <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${
              mission.status === "active"
                ? "bg-green-100 text-green-700"
                : "bg-slate-100 text-slate-500"
            }`}>
              {mission.status === "active" ? "Activa" : "Inactiva"}
            </span>
          )}
          {isConnected ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-1 text-[10px] font-medium text-green-700 ring-1 ring-green-200">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
              En vivo
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-[10px] font-medium text-red-600 ring-1 ring-red-200">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
              Reconectando…
            </span>
          )}
        </div>
      </PageHeader>

      {/* Feed de alertas */}
      {alerts.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 py-14 text-center">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-slate-100">
            <svg className="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803 7.5 7.5 0 0015.803 15.803z" />
            </svg>
          </div>
          <p className="text-[13px] font-semibold text-slate-700">La búsqueda está en curso</p>
          <p className="mt-1 text-[12px] text-slate-400">Te notificaremos cuando encontremos algo.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-[11px] text-slate-400">
            {alerts.length} {alerts.length === 1 ? "coincidencia detectada" : "coincidencias detectadas"}
          </p>
          {alerts.map((alert) => (
            <AlertCard key={alert.detection_id} alert={alert} userRole="familiar" />
          ))}
        </div>
      )}
    </div>
  );
}

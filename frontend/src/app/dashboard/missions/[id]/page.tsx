// =============================================================================
// AEROFINDER Frontend — Página de detalle de misión (client-side)
// Layout: mapa 70% | panel derecho 30% (video + info + alertas)
// Controles de estado (start/pause/complete/cancel) y asignación de drones.
// Acceso: admin, buscador, ayudante (familiar redirigido)
// =============================================================================

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import { missionsApi, dronesApi, alertsApi, systemApi } from "@/lib/api";
import { MissionMap } from "@/components/map/MissionMap";
import { DroneStream } from "@/components/video/DroneStream";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { Modal } from "@/components/ui/Modal";
import type { Alert, Drone, Mission, MissionDrone, MissionStatus } from "@/lib/types";

// ── Helpers de presentación ───────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  planned:     "Planificada",
  active:      "Activa",
  paused:      "Pausada",
  completed:   "Completada",
  interrupted: "Interrumpida",
  cancelled:   "Cancelada",
};

const STATUS_COLOR: Record<string, string> = {
  planned:     "bg-gray-100 text-gray-600",
  active:      "bg-green-100 text-green-700",
  paused:      "bg-amber-100 text-amber-700",
  completed:   "bg-blue-100 text-blue-700",
  interrupted: "bg-orange-100 text-orange-700",
  cancelled:   "bg-red-100 text-red-600",
};

const ALERT_LEVEL_LABEL: Record<string, string> = {
  full:              "Coincidencia confirmada",
  partial:           "Coincidencia probable",
  confirmation_only: "Posible coincidencia",
};

const ALERT_LEVEL_COLOR: Record<string, string> = {
  full:              "text-red-700 bg-red-50 border border-red-200",
  partial:           "text-orange-700 bg-orange-50 border border-orange-200",
  confirmation_only: "text-amber-700 bg-amber-50 border border-amber-200",
};

// Transiciones de estado válidas
const STATUS_TRANSITIONS: Record<string, { status: MissionStatus; label: string; color: string }[]> = {
  planned:     [
    { status: "active",    label: "Iniciar",    color: "bg-green-600 hover:bg-green-700 text-white" },
    { status: "cancelled", label: "Cancelar",   color: "bg-red-600 hover:bg-red-700 text-white" },
  ],
  active:      [
    { status: "paused",    label: "Pausar",     color: "bg-amber-600 hover:bg-amber-700 text-white" },
    { status: "completed", label: "Completar",  color: "bg-blue-600 hover:bg-blue-700 text-white" },
    { status: "interrupted", label: "Interrumpir", color: "bg-orange-600 hover:bg-orange-700 text-white" },
  ],
  paused:      [
    { status: "active",    label: "Reanudar",   color: "bg-green-600 hover:bg-green-700 text-white" },
    { status: "completed", label: "Completar",  color: "bg-blue-600 hover:bg-blue-700 text-white" },
    { status: "cancelled", label: "Cancelar",   color: "bg-red-600 hover:bg-red-700 text-white" },
  ],
  interrupted: [
    { status: "active",    label: "Reanudar",   color: "bg-green-600 hover:bg-green-700 text-white" },
    { status: "cancelled", label: "Cancelar",   color: "bg-red-600 hover:bg-red-700 text-white" },
  ],
};

// ── Página ────────────────────────────────────────────────────────────────────

export default function MissionDetailPage() {
  const router = useRouter();
  const params = useParams();
  const missionId = params.id as string;

  const user      = useAuthStore((s) => s.user);
  const isLoading = useAuthStore((s) => s.isLoading);

  const [mission, setMission]             = useState<Mission | null>(null);
  const [recentAlerts, setRecentAlerts]   = useState<Alert[]>([]);
  const [assignedDrones, setAssignedDrones] = useState<MissionDrone[]>([]);
  const [allDrones, setAllDrones]         = useState<Drone[]>([]);
  const [loading, setLoading]             = useState(true);
  const [statusLoading, setStatusLoading] = useState(false);
  const [recognitionLoading, setRecognitionLoading] = useState(false);
  const [showDroneModal, setShowDroneModal] = useState(false);
  const [selectedDroneId, setSelectedDroneId] = useState("");
  const [rtmpBaseUrl, setRtmpBaseUrl]     = useState<string | null>(null);
  const [copiedSerial, setCopiedSerial]   = useState<string | null>(null);
  const copyTimeoutRef                    = useRef<ReturnType<typeof setTimeout> | null>(null);

  const canManage = user?.role === "admin" || user?.role === "buscador";

  // Carga inicial
  useEffect(() => {
    if (!missionId) return;
    setLoading(true);

    Promise.all([
      missionsApi.get(missionId),
      alertsApi.list(missionId),
      missionsApi.listDrones(missionId),
      dronesApi.list(),
      systemApi.getConfig("rtmp.base_url").catch(() => null),
    ])
      .then(([m, a, d, drones, rtmpCfg]) => {
        setMission(m);
        setRecentAlerts(Array.isArray(a) ? a.slice(0, 10) : []);
        setAssignedDrones(d);
        setAllDrones(drones);
        if (rtmpCfg) setRtmpBaseUrl(rtmpCfg.value_text);
      })
      .catch(() => router.replace("/dashboard/missions"))
      .finally(() => setLoading(false));
  }, [missionId, router]);

  // Redirigir familiar
  useEffect(() => {
    if (!isLoading && user?.role === "familiar") {
      router.replace("/dashboard");
    }
  }, [isLoading, user, router]);

  // Cambio de estado de misión
  const handleStatusChange = useCallback(async (newStatus: MissionStatus) => {
    if (!mission) return;
    setStatusLoading(true);
    try {
      const updates: Partial<Mission> = { status: newStatus };
      if (newStatus === "active" && !mission.started_at) {
        updates.started_at = new Date().toISOString();
      }
      if (newStatus === "completed" || newStatus === "cancelled") {
        updates.completed_at = new Date().toISOString();
      }
      const updated = await missionsApi.update(mission.id, updates);
      setMission(updated);
    } catch {
      // Silencioso
    } finally {
      setStatusLoading(false);
    }
  }, [mission]);

  // Asignar dron
  const handleAssignDrone = useCallback(async () => {
    if (!mission || !selectedDroneId) return;
    try {
      const assignment = await missionsApi.assignDrone(mission.id, selectedDroneId);
      setAssignedDrones((prev) => [...prev, assignment]);
      setShowDroneModal(false);
      setSelectedDroneId("");
    } catch {
      // Silencioso
    }
  }, [mission, selectedDroneId]);

  // Desasignar dron
  const handleUnassignDrone = useCallback(async (droneId: string) => {
    if (!mission) return;
    try {
      await missionsApi.unassignDrone(mission.id, droneId);
      setAssignedDrones((prev) => prev.filter((d) => d.drone_id !== droneId));
    } catch {
      // Silencioso
    }
  }, [mission]);

  // Activar / desactivar reconocimiento facial
  const handleToggleRecognition = useCallback(async () => {
    if (!mission) return;
    setRecognitionLoading(true);
    try {
      const updated = await missionsApi.setRecognition(mission.id, !mission.recognition_active);
      setMission(updated);
    } catch {
      // Silencioso
    } finally {
      setRecognitionLoading(false);
    }
  }, [mission]);

  // Copiar URL RTMP al portapapeles
  const handleCopyRtmp = useCallback((serial: string) => {
    if (!rtmpBaseUrl) return;
    const url = `${rtmpBaseUrl}/${serial}`;
    navigator.clipboard.writeText(url).catch(() => {});
    setCopiedSerial(serial);
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    copyTimeoutRef.current = setTimeout(() => setCopiedSerial(null), 2000);
  }, [rtmpBaseUrl]);

  if (loading || !mission) {
    return (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  // Primer dron asignado activo para el mapa y stream
  const activeDrone = assignedDrones.find((d) => !d.left_at);
  const droneId     = activeDrone?.drone_id ?? "";
  const streamDrone = allDrones.find((d) => d.id === droneId) ??
    (droneId ? { serial_number: droneId } : null);
  const streamKey   = streamDrone?.serial_number ?? null;
  const transitions = STATUS_TRANSITIONS[mission.status] ?? [];

  // Drones disponibles (no asignados activamente a esta misión)
  const assignedDroneIds = new Set(assignedDrones.filter((d) => !d.left_at).map((d) => d.drone_id));
  const availableDrones  = allDrones.filter((d) => !assignedDroneIds.has(d.id));

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* Encabezado compacto */}
      <div className="flex shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-6 py-3">
        <button
          onClick={() => router.push("/dashboard/missions")}
          className="shrink-0 rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="truncate text-lg font-semibold text-gray-900">{mission.name}</h1>
          {mission.description && (
            <p className="truncate text-xs text-gray-500">{mission.description}</p>
          )}
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
            STATUS_COLOR[mission.status] ?? "bg-gray-100 text-gray-600"
          }`}
        >
          {STATUS_LABEL[mission.status] ?? mission.status}
        </span>

        {/* Botones de cambio de estado */}
        {canManage && transitions.length > 0 && (
          <div className="flex gap-1.5">
            {transitions.map((t) => (
              <button
                key={t.status}
                onClick={() => handleStatusChange(t.status)}
                disabled={statusLoading}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${t.color}`}
              >
                {statusLoading ? "…" : t.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Cuerpo: mapa 70% + panel derecho 30% */}
      <div className="flex flex-1 overflow-hidden">
        {/* Mapa */}
        <div className="relative h-full" style={{ width: "70%" }}>
          {droneId ? (
            <MissionMap
              missionId={missionId}
              droneId={droneId}
              userRole={user?.role ?? "buscador"}
            />
          ) : (
            <div className="flex h-full items-center justify-center bg-gray-50">
              <div className="text-center">
                <p className="text-sm text-gray-500">Sin dron asignado a esta misión</p>
                {canManage && (
                  <button
                    onClick={() => setShowDroneModal(true)}
                    className="mt-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    Asignar dron
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Panel derecho */}
        <div
          className="flex h-full flex-col overflow-hidden border-l border-gray-200 bg-white"
          style={{ width: "30%" }}
        >
          {/* Stream de video HLS */}
          <div className="shrink-0 border-b border-gray-100">
            {streamKey && droneId ? (
              <DroneStream
                streamKey={streamKey}
                droneId={droneId}
                userRole={user?.role ?? "buscador"}
                className="h-44 w-full"
              />
            ) : (
              <div className="flex h-44 items-center justify-center bg-gray-900">
                <div className="text-center">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="mx-auto mb-2 h-8 w-8 text-gray-600"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  >
                    <path d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"/>
                  </svg>
                  <p className="text-xs text-gray-500">
                    {droneId ? "Sin stream configurado" : "Sin dron asignado"}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Drones asignados + URLs RTMP */}
          <div className="shrink-0 border-b border-gray-100 px-4 py-2.5">
            <div className="mb-1.5 flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                Drones ({assignedDrones.filter((d) => !d.left_at).length})
              </p>
              {canManage && (
                <button
                  onClick={() => setShowDroneModal(true)}
                  className="text-[10px] font-semibold text-blue-600 hover:text-blue-700"
                >
                  + Asignar
                </button>
              )}
            </div>
            {assignedDrones.filter((d) => !d.left_at).length === 0 ? (
              <p className="text-xs text-gray-400">Sin drones asignados</p>
            ) : (
              <ul className="space-y-2">
                {assignedDrones
                  .filter((d) => !d.left_at)
                  .map((d) => {
                    const droneInfo = allDrones.find((x) => x.id === d.drone_id);
                    const serial    = droneInfo?.serial_number ?? d.drone_id.slice(0, 8);
                    const rtmpUrl   = rtmpBaseUrl ? `${rtmpBaseUrl}/${serial}` : null;
                    const copied    = copiedSerial === serial;
                    return (
                      <li key={d.drone_id} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-gray-700 truncate">
                            {droneInfo ? `${droneInfo.model} — ${serial}` : serial}
                          </span>
                          {canManage && (
                            <button
                              onClick={() => handleUnassignDrone(d.drone_id)}
                              className="text-red-400 hover:text-red-600 text-[10px] ml-2 shrink-0"
                            >
                              Retirar
                            </button>
                          )}
                        </div>
                        {rtmpUrl && (
                          <div className="flex items-center gap-1.5">
                            <code className="flex-1 truncate rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">
                              {rtmpUrl}
                            </code>
                            <button
                              onClick={() => handleCopyRtmp(serial)}
                              title="Copiar URL para app DJI"
                              className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold transition-colors ${
                                copied
                                  ? "bg-green-100 text-green-700"
                                  : "bg-blue-50 text-blue-600 hover:bg-blue-100"
                              }`}
                            >
                              {copied ? "✓" : "Copiar"}
                            </button>
                          </div>
                        )}
                      </li>
                    );
                  })}
              </ul>
            )}

            {/* Botón Activar / Detener Reconocimiento */}
            {canManage && mission.status === "active" && assignedDrones.filter((d) => !d.left_at).length > 0 && (
              <div className="mt-3">
                <button
                  onClick={handleToggleRecognition}
                  disabled={recognitionLoading}
                  className={`w-full rounded-lg px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-50 ${
                    mission.recognition_active
                      ? "bg-red-50 text-red-700 hover:bg-red-100 border border-red-200"
                      : "bg-green-600 text-white hover:bg-green-700"
                  }`}
                >
                  {recognitionLoading
                    ? "…"
                    : mission.recognition_active
                    ? "⏹ Detener reconocimiento"
                    : "▶ Activar reconocimiento IA"}
                </button>
                {mission.recognition_active && (
                  <p className="mt-1 text-center text-[10px] text-green-600 font-medium">
                    ● IA procesando stream
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Info de la misión */}
          <div className="shrink-0 border-b border-gray-100 px-4 py-2.5">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
              Misión
            </p>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
              {mission.started_at && (
                <>
                  <dt className="text-gray-500">Inicio</dt>
                  <dd className="font-medium">
                    {new Date(mission.started_at).toLocaleString("es-BO", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </dd>
                </>
              )}
              {mission.planned_at && !mission.started_at && (
                <>
                  <dt className="text-gray-500">Planificada</dt>
                  <dd className="font-medium">
                    {new Date(mission.planned_at).toLocaleString("es-BO", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </dd>
                </>
              )}
              {mission.completed_at && (
                <>
                  <dt className="text-gray-500">Fin</dt>
                  <dd className="font-medium">
                    {new Date(mission.completed_at).toLocaleString("es-BO", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </dd>
                </>
              )}
            </dl>
          </div>

          {/* Alertas recientes */}
          <div className="flex-1 overflow-y-auto px-4 py-2.5">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
              Alertas recientes
            </p>
            {recentAlerts.length === 0 ? (
              <p className="text-xs text-gray-400">Sin alertas registradas</p>
            ) : (
              <ul className="space-y-2">
                {recentAlerts.map((alert) => (
                  <li
                    key={alert.id}
                    className={`rounded-md px-3 py-2 text-xs ${
                      ALERT_LEVEL_COLOR[alert.content_level] ?? "bg-gray-50 text-gray-700 border border-gray-100"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-semibold leading-tight">
                        {ALERT_LEVEL_LABEL[alert.content_level] ?? alert.content_level}
                      </span>
                      <span className="shrink-0 text-[10px] opacity-60">
                        {new Date(alert.generated_at).toLocaleTimeString("es-BO", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    {alert.message_text && (
                      <p className="mt-0.5 opacity-80 line-clamp-2">{alert.message_text}</p>
                    )}
                    <p className="mt-0.5 text-[10px] capitalize opacity-50">
                      Estado: {alert.status}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Modal de asignación de dron */}
      <Modal open={showDroneModal} title="Asignar dron a misión" onClose={() => setShowDroneModal(false)}>
        <div className="space-y-4">
          <select
            value={selectedDroneId}
            onChange={(e) => setSelectedDroneId(e.target.value)}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Seleccionar dron…</option>
            {availableDrones.map((d) => (
              <option key={d.id} value={d.id}>
                {d.model} — {d.serial_number} ({d.status.replace(/_/g, " ")})
              </option>
            ))}
          </select>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowDroneModal(false)}
              className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
            >
              Cancelar
            </button>
            <button
              onClick={handleAssignDrone}
              disabled={!selectedDroneId}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Asignar
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

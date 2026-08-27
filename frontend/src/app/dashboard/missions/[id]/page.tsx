// =============================================================================
// AEROFINDER Frontend — Página de detalle de misión (client-side)
// Layout: mapa 70% | panel derecho 30% (video + info + alertas)
// Controles de estado (start/pause/complete/cancel) y asignación de drones.
// Acceso: admin, buscador, ayudante (familiar redirigido)
// =============================================================================

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import { useWebSocket } from "@/lib/websocket";
import { useMultiDroneTelemetry } from "@/lib/useMultiDroneTelemetry";
import { missionsApi, dronesApi, alertsApi, systemApi, fieldReportsApi, photosApi, mapAccessApi, usersApi } from "@/lib/api";
import { MissionMap } from "@/components/map/MissionMap";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { Modal } from "@/components/ui/Modal";
import { DroneVideoMosaic } from "@/components/mission/DroneVideoMosaic";
import { FieldReportPanel } from "@/components/mission/FieldReportPanel";
import { FieldReportResultModal } from "@/components/mission/FieldReportResultModal";
import { MissionAlertCard } from "@/components/mission/MissionAlertCard";
import type { Alert, Drone, FieldReport, MapAccessGrant, Mission, MissionDrone, MissionStatus, PhotoResponse, StreamInfo, User } from "@/lib/types";

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

const CONFIRM_REQUIRED = new Set<MissionStatus>(["paused", "completed", "interrupted", "cancelled"]);

// ── Página ────────────────────────────────────────────────────────────────────

export default function MissionDetailPage() {
  const router = useRouter();
  const params = useParams();
  const missionId = params.id as string;

  const user        = useAuthStore((s) => s.user);
  const isLoading   = useAuthStore((s) => s.isLoading);
  const accessToken = useAuthStore((s) => s.accessToken);

  const [mission, setMission]             = useState<Mission | null>(null);
  const [recentAlerts, setRecentAlerts]   = useState<Alert[]>([]);
  const [assignedDrones, setAssignedDrones] = useState<MissionDrone[]>([]);
  const [allDrones, setAllDrones]         = useState<Drone[]>([]);
  const [loading, setLoading]             = useState(true);
  const [statusLoading, setStatusLoading] = useState(false);
  const [recognitionLoading, setRecognitionLoading] = useState(false);
  const [faceRecognitionLoading, setFaceRecognitionLoading] = useState(false);
  const [showDroneModal, setShowDroneModal] = useState(false);
  const [selectedDroneId, setSelectedDroneId] = useState("");
  const [rtmpBaseUrl, setRtmpBaseUrl]     = useState<string | null>(null);
  const [copiedSerial, setCopiedSerial]   = useState<string | null>(null);
  const copyTimeoutRef                    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [fieldReports, setFieldReports]   = useState<FieldReport[]>([]);
  const [viewingReport, setViewingReport] = useState<FieldReport | null>(null);
  const [streams, setStreams]             = useState<StreamInfo[]>([]);
  const [confirmAction, setConfirmAction] = useState<{ status: MissionStatus; label: string } | null>(null);
  const [viewMode, setViewMode]           = useState<"map" | "video">("video");
  const [latestDetections, setLatestDetections] = useState<Record<string, Array<{ bbox: { x: number; y: number; w: number; h: number }; detection_type: string; confidence: number; similarity?: number }>>>({});
  const [missingPersonPhotos, setMissingPersonPhotos] = useState<PhotoResponse[]>([]);
  const [mapAccess, setMapAccess] = useState<MapAccessGrant[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [grantingAccess, setGrantingAccess] = useState(false);

  const canManage = user?.role === "admin" || user?.role === "buscador";

  // WebSocket — misión
  const wsBase  = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000";
  const wsUrl   = accessToken && missionId
    ? `${wsBase}/ws/missions/${missionId}?token=${accessToken}`
    : null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleWsMessage = useCallback((raw: any) => {
    const msg = raw as { type: string; [key: string]: unknown };
    switch (msg.type) {
      case "detection": {
        // Actualizar recuadros en vivo por drone
        const droneId = msg.drone_id as string | undefined;
        const bbox    = msg.bbox as { x: number; y: number; w: number; h: number } | undefined;
        if (droneId && bbox) {
          const detType   = (msg.detection_type as string) ?? "person_silhouette";
          const conf      = (msg.yolo_confidence as number) ?? (msg.confidence as number) ?? 0;
          const sim       = (msg.similarity_score as number) ?? 0;
          setLatestDetections((prev) => ({
            ...prev,
            [droneId]: [{ bbox, detection_type: detType, confidence: conf, similarity: sim }],
          }));
          // Limpiar recuadro después de 5s
          setTimeout(() => {
            setLatestDetections((prev) => {
              const next = { ...prev };
              delete next[droneId];
              return next;
            });
          }, 5_000);
        }
        alertsApi.list(missionId)
          .then((a) => setRecentAlerts(Array.isArray(a) ? a.slice(0, 10) : []))
          .catch(() => {});
        break;
      }
      case "alert":
        alertsApi.list(missionId)
          .then((a) => setRecentAlerts(Array.isArray(a) ? a.slice(0, 10) : []))
          .catch(() => {});
        break;
      case "field_report_request":
      case "field_report_approved":
      case "field_report_rejected":
      case "field_report_result":
        fieldReportsApi.listForMission(missionId)
          .then(setFieldReports)
          .catch(() => {});
        break;
      case "mission_recognition":
        setMission((prev) => prev ? {
          ...prev,
          recognition_active: msg.person_detection as boolean,
          face_recognition_active: msg.face_recognition as boolean,
        } : prev);
        break;
      default:
        break;
    }
  }, [missionId]);

  useWebSocket(wsUrl, handleWsMessage);

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
      dronesApi.listStreams().catch(() => []),
      fieldReportsApi.listForMission(missionId).catch(() => []),
    ])
      .then(([m, a, d, drones, rtmpCfg, streamsData, reportsData]) => {
        setMission(m);
        setRecentAlerts(Array.isArray(a) ? a.slice(0, 10) : []);
        setAssignedDrones(d);
        setAllDrones(drones);
        if (rtmpCfg) setRtmpBaseUrl(rtmpCfg.value_text);
        setStreams(streamsData as StreamInfo[]);
        setFieldReports(reportsData as FieldReport[]);
        // Cargar fotos del desaparecido si la misión tiene uno asociado
        if (m.missing_person_id) {
          photosApi.list(m.missing_person_id)
            .then(setMissingPersonPhotos)
            .catch(() => {});
        }
        // Cargar acceso al mapa para admin/super_admin/buscador
        const role = useAuthStore.getState().user?.role;
        if (role === "admin" || role === "super_admin" || role === "buscador") {
          mapAccessApi.list(missionId).then(setMapAccess).catch(() => {});
          usersApi.list().then(setAllUsers).catch(() => {});
        }
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

  // Cambio de estado de misión — con confirmación para acciones destructivas
  const handleStatusChange = useCallback(async (newStatus: MissionStatus) => {
    if (!mission) return;
    setStatusLoading(true);
    try {
      const updates: Partial<Mission> = { status: newStatus };
      if (newStatus === "active" && !mission.started_at) {
        updates.started_at = new Date().toISOString();
      }
      if (newStatus === "completed" || newStatus === "cancelled" || newStatus === "interrupted") {
        updates.completed_at = new Date().toISOString();
      }
      const updated = await missionsApi.update(mission.id, updates);
      setMission(updated);
      if (newStatus === "completed") {
        router.push(`/dashboard/missions/${mission.id}/summary`);
      }
    } catch {
      // Silencioso
    } finally {
      setStatusLoading(false);
    }
  }, [mission, router]);

  const handleStatusClick = useCallback((status: MissionStatus, label: string) => {
    if (CONFIRM_REQUIRED.has(status)) {
      setConfirmAction({ status, label });
    } else {
      handleStatusChange(status);
    }
  }, [handleStatusChange]);

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

  // Activar / desactivar detección de personas
  const handleToggleRecognition = useCallback(async () => {
    if (!mission) return;
    setRecognitionLoading(true);
    try {
      const updated = await missionsApi.setRecognition(mission.id, !mission.recognition_active, mission.face_recognition_active ?? false);
      setMission(updated);
    } catch {
      // Silencioso
    } finally {
      setRecognitionLoading(false);
    }
  }, [mission]);

  // Activar / desactivar reconocimiento facial
  const handleToggleFaceRecognition = useCallback(async () => {
    if (!mission) return;
    setFaceRecognitionLoading(true);
    try {
      const updated = await missionsApi.setRecognition(mission.id, mission.recognition_active, !(mission.face_recognition_active ?? false));
      setMission(updated);
    } catch {
      // Silencioso
    } finally {
      setFaceRecognitionLoading(false);
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

  // Otorgar acceso al mapa
  async function handleGrantAccess() {
    if (!selectedUserId) return;
    setGrantingAccess(true);
    try {
      const grant = await mapAccessApi.grant(missionId, selectedUserId);
      setMapAccess((prev) => [...prev, grant]);
      setSelectedUserId("");
    } catch {
      // Silenciar: usuario ya tenía acceso
    } finally {
      setGrantingAccess(false);
    }
  }

  // Revocar acceso al mapa
  async function handleRevokeAccess(userId: string) {
    try {
      await mapAccessApi.revoke(missionId, userId);
      setMapAccess((prev) => prev.filter((a) => a.user_id !== userId));
    } catch {
      // Ignorar
    }
  }

  // Drones activos en la misión — hooks deben ir antes del early return
  const activeDroneIds = useMemo(
    () => assignedDrones.filter((d) => !d.left_at).map((d) => d.drone_id),
    [assignedDrones],
  );
  const { droneStates, routes, connectedCount } = useMultiDroneTelemetry(activeDroneIds, accessToken);

  if (loading || !mission) {
    return (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }
  const hasDrones = activeDroneIds.length > 0;
  const transitions  = STATUS_TRANSITIONS[mission.status] ?? [];
  const isVideoPaused = mission.status === "paused" || mission.status === "completed" || mission.status === "cancelled" || mission.status === "interrupted";

  // Contadores de detecciones en vivo para el panel
  // Drones disponibles (no asignados activamente a esta misión)
  const assignedDroneIds = new Set(assignedDrones.filter((d) => !d.left_at).map((d) => d.drone_id));
  const availableDrones  = allDrones.filter((d) => !assignedDroneIds.has(d.id));

  // Drones para el mosaico (reutilizado en primary + secondary)
  const mosaicDrones = assignedDrones
    .filter((d) => !d.left_at)
    .map((d) => allDrones.find((x) => x.id === d.drone_id))
    .filter(Boolean) as Drone[];

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

        {/* Toggle mapa / video */}
        <div className="flex shrink-0 rounded-lg border border-gray-200 bg-gray-100 p-0.5">
          <button
            onClick={() => setViewMode("map")}
            className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors ${
              viewMode === "map"
                ? "bg-white text-gray-800 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            🗺 Mapa
          </button>
          <button
            onClick={() => setViewMode("video")}
            className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors ${
              viewMode === "video"
                ? "bg-white text-gray-800 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            📹 Video
          </button>
        </div>

        {/* Botones de cambio de estado */}
        {canManage && transitions.length > 0 && (
          <div className="flex gap-1.5">
            {transitions.map((t) => (
              <button
                key={t.status}
                onClick={() => handleStatusClick(t.status, t.label)}
                disabled={statusLoading}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${t.color}`}
              >
                {statusLoading ? "…" : t.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Banner de pausa — visible en todo el dashboard cuando la misión está pausada */}
      {isVideoPaused && (
        <div className="shrink-0 flex items-center gap-3 bg-amber-50 border-b border-amber-200 px-6 py-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white text-sm font-bold">⏸</span>
          <p className="flex-1 text-sm font-semibold text-amber-800">
            MISIÓN PAUSADA — Análisis IA y video congelados. Pulsa <strong>Reanudar</strong> para continuar.
          </p>
          {canManage && (
            <button
              onClick={() => handleStatusClick("active", "Reanudar")}
              disabled={statusLoading}
              className="shrink-0 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50"
            >
              {statusLoading ? "…" : "▶ Reanudar"}
            </button>
          )}
        </div>
      )}

      {/* Cuerpo: primario 70% + panel derecho 30% — ambos siempre visibles */}
      <div className="flex flex-1 overflow-hidden">

        {/* Área primaria — grande (70%) */}
        <div className="relative h-full" style={{ width: "70%" }}>
          {/* Overlay de pausa sobre el área primaria */}
          {isVideoPaused && (
            <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-black/30">
              <div className="flex flex-col items-center gap-2">
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/90 text-3xl font-bold text-white shadow-lg">⏸</span>
                <span className="rounded-full bg-black/60 px-4 py-1 text-sm font-semibold text-white">Pausada</span>
              </div>
            </div>
          )}
          {viewMode === "video" ? (
            <DroneVideoMosaic
              mission={mission}
              assignedDrones={mosaicDrones}
              streams={streams}
              canManage={canManage}
              onMissionUpdate={setMission}
              latestDetections={latestDetections}
              isPaused={isVideoPaused}
            />
          ) : hasDrones ? (
            <MissionMap
              missionId={missionId}
              droneStates={droneStates}
              routes={routes}
              connectedCount={connectedCount}
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

        {/* Panel derecho (30%) */}
        <div
          className="flex h-full flex-col overflow-hidden border-l border-gray-200 bg-white"
          style={{ width: "30%" }}
        >
          {/* Vista secundaria — intercambia con la primaria */}
          <div className="shrink-0 border-b border-gray-100" style={{ height: "40%" }}>
            {viewMode === "video" ? (
              hasDrones ? (
                <MissionMap
                  missionId={missionId}
                  droneStates={droneStates}
                  routes={routes}
                  connectedCount={connectedCount}
                  userRole={user?.role ?? "buscador"}
                />
              ) : (
                <div className="flex h-full items-center justify-center bg-gray-100">
                  <p className="text-[11px] text-gray-400">Sin dron asignado</p>
                </div>
              )
            ) : (
              <DroneVideoMosaic
                mission={mission}
                assignedDrones={mosaicDrones}
                streams={streams}
                canManage={canManage}
                onMissionUpdate={setMission}
                latestDetections={latestDetections}
                isPaused={isVideoPaused}
              />
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
                              title="Copiar URL RTMP para el dron"
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
                <button
                  onClick={handleToggleFaceRecognition}
                  disabled={faceRecognitionLoading || !mission.recognition_active}
                  title={!mission.recognition_active ? "Activa primero la detección de personas" : undefined}
                  className={`mt-2 w-full rounded-lg px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-50 ${
                    mission.face_recognition_active
                      ? "bg-red-50 text-red-700 hover:bg-red-100 border border-red-200"
                      : "bg-blue-600 text-white hover:bg-blue-700"
                  }`}
                >
                  {faceRecognitionLoading
                    ? "…"
                    : mission.face_recognition_active
                    ? "⏹ Detener reconocimiento facial"
                    : "▶ Activar reconocimiento facial"}
                </button>
                {mission.face_recognition_active && (
                  <p className="mt-1 text-center text-[10px] text-blue-600 font-medium">
                    ● Comparando rostros con FaceNet
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Field Reports */}
          <div className="shrink-0 border-b border-gray-100 px-4 py-2">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
              Reportes de campo ({fieldReports.filter((r) => r.status === "pending").length} pendientes)
            </p>
            <FieldReportPanel
              reports={fieldReports}
              canManage={canManage}
              onUpdate={(updated) =>
                setFieldReports((prev) => prev.map((r) => r.id === updated.id ? updated : r))
              }
              onViewResult={setViewingReport}
            />
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
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                Alertas recientes
              </p>
              {recentAlerts.length > 0 && (
                <button
                  onClick={() => router.push("/dashboard/alerts")}
                  className="text-[10px] font-semibold text-blue-600 transition-colors hover:text-blue-800"
                >
                  Ver todas →
                </button>
              )}
            </div>
            {recentAlerts.length === 0 ? (
              <p className="text-xs text-gray-400">Sin alertas registradas</p>
            ) : (
              <ul className="space-y-2">
                {recentAlerts.map((alert) => (
                  <MissionAlertCard
                    key={alert.id}
                    alert={alert}
                    missingPersonPhotos={missingPersonPhotos}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Acceso al mapa */}
      {(user?.role === "admin" || user?.role === "super_admin" || user?.role === "buscador") && (
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-4 mx-6 mb-4">
          <h3 className="text-sm font-semibold text-slate-300 mb-1">Acceso al mapa</h3>
          <p className="text-xs text-slate-500 mb-3">
            Ayudantes y familiares solo ven el mapa si se los autoriza explícitamente.
          </p>

          {mapAccess.length === 0 ? (
            <p className="text-xs text-slate-600 mb-3">Sin usuarios autorizados todavía.</p>
          ) : (
            <ul className="space-y-1.5 mb-3">
              {mapAccess.map((grant) => (
                <li
                  key={grant.user_id}
                  className="flex items-center justify-between bg-slate-800 rounded px-3 py-2"
                >
                  <div>
                    <span className="text-xs text-slate-200">{grant.user_full_name}</span>
                    <span className="text-xs text-slate-500 ml-2">· {grant.user_role}</span>
                  </div>
                  {(user?.role === "admin" || user?.role === "super_admin") && (
                    <button
                      onClick={() => handleRevokeAccess(grant.user_id)}
                      className="text-xs text-red-400 hover:text-red-300 transition-colors"
                    >
                      Revocar
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {(user?.role === "admin" || user?.role === "super_admin") && (
            <div className="flex gap-2">
              <select
                className="flex-1 bg-slate-800 text-slate-200 text-xs rounded px-2 py-1.5 border border-slate-700 focus:outline-none"
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
              >
                <option value="">Seleccionar usuario...</option>
                {allUsers
                  .filter(
                    (u) =>
                      (u.role === "ayudante" || u.role === "familiar") &&
                      !mapAccess.some((a) => a.user_id === u.id)
                  )
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name} ({u.role})
                    </option>
                  ))}
              </select>
              <button
                onClick={handleGrantAccess}
                disabled={!selectedUserId || grantingAccess}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs rounded transition-colors"
              >
                {grantingAccess ? "..." : "Autorizar"}
              </button>
            </div>
          )}
        </section>
      )}

      {/* Modal resultado field report */}
      <FieldReportResultModal
        report={viewingReport}
        onClose={() => setViewingReport(null)}
      />

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

      {/* Modal de confirmación de cambio de estado */}
      <Modal
        open={!!confirmAction}
        title={`¿${confirmAction?.label} la misión?`}
        onClose={() => setConfirmAction(null)}
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            {confirmAction?.status === "completed" && "La misión se marcará como completada y serás redirigido al resumen."}
            {confirmAction?.status === "paused" && "La misión se pausará y el AI worker dejará de procesar el stream."}
            {confirmAction?.status === "interrupted" && "La misión se marcará como interrumpida. Podrás reanudarla más adelante."}
            {confirmAction?.status === "cancelled" && "La misión se cancelará. Esta acción no se puede deshacer."}
          </p>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setConfirmAction(null)}
              className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              onClick={() => {
                if (confirmAction) {
                  handleStatusChange(confirmAction.status);
                  setConfirmAction(null);
                }
              }}
              disabled={statusLoading}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {statusLoading ? "…" : `Sí, ${confirmAction?.label}`}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// =============================================================================
// AEROFINDER Frontend — Detecciones (tabs: Por revisar + Historial)
// "Por revisar": triaje visual con confirmación/descarte en tiempo real (WS).
// "Historial":   tabla paginada con filtros, solo lectura.
// =============================================================================

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import { alertsApi, detectionsApi, missionsApi } from "@/lib/api";
import { drawDetectionBox } from "@/lib/drawDetectionBox";
import type { Alert, Detection, Mission } from "@/lib/types";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { useWebSocket } from "@/lib/websocket";

// ── Helpers comunes ───────────────────────────────────────────────────────────

const TYPE_LABEL: Record<string, string> = {
  person_silhouette: "Silueta",
  face_candidate:    "Posible rostro",
  face_match:        "Coincidencia facial",
};

const TYPE_COLOR: Record<string, string> = {
  person_silhouette: "bg-blue-100 text-blue-700",
  face_candidate:    "bg-amber-100 text-amber-700",
  face_match:        "bg-red-100 text-red-700",
};

const LEVEL_COLOR: Record<string, string> = {
  full:              "border-red-400 bg-red-50",
  partial:           "border-amber-400 bg-amber-50",
  confirmation_only: "border-blue-300 bg-blue-50",
};

const LEVEL_BADGE: Record<string, string> = {
  full:              "bg-red-100 text-red-700",
  partial:           "bg-amber-100 text-amber-700",
  confirmation_only: "bg-blue-100 text-blue-700",
};

const LEVEL_LABEL: Record<string, string> = {
  full:              "Coincidencia confirmada",
  partial:           "Coincidencia probable",
  confirmation_only: "Posible coincidencia",
};

const ALERT_STATUS_LABEL: Record<string, string> = {
  confirmed: "Confirmada",
  dismissed: "Descartada",
  sent:      "Enviada",
  generated: "Pendiente",
};

const ALERT_STATUS_COLOR: Record<string, string> = {
  confirmed: "bg-green-100 text-green-700",
  dismissed: "bg-red-100 text-red-600",
  sent:      "bg-blue-100 text-blue-700",
  generated: "bg-amber-100 text-amber-700",
};

function fmtTime(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `hace ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  return d.toLocaleDateString("es-BO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function getDetectionType(facenetSimilarity: number): string {
  if (facenetSimilarity >= 0.7) return "face_match";
  if (facenetSimilarity > 0)    return "face_candidate";
  return "person_silhouette";
}

// ── Componentes tab "Por revisar" ─────────────────────────────────────────────

function ConfidenceBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(value * 100, 100).toFixed(0)}%` }} />
    </div>
  );
}

function PendingCard({
  alert,
  canSeeGPS,
  onConfirm,
  onDismiss,
}: {
  alert: Alert;
  canSeeGPS: boolean;
  onConfirm: (id: string) => void;
  onDismiss: (id: string) => void;
}) {
  const router = useRouter();
  const [acting, setActing] = useState<"confirm" | "dismiss" | null>(null);

  const handleConfirm = useCallback(async () => {
    setActing("confirm");
    try { await alertsApi.acknowledge(alert.id); onConfirm(alert.id); }
    catch { setActing(null); }
  }, [alert.id, onConfirm]);

  const handleDismiss = useCallback(async () => {
    setActing("dismiss");
    try { await alertsApi.dismiss(alert.id); onDismiss(alert.id); }
    catch { setActing(null); }
  }, [alert.id, onDismiss]);

  const isFace = alert.detection_type === "face_match" || alert.detection_type === "face_candidate";

  return (
    <div className={`overflow-hidden rounded-xl border-2 shadow-md transition-transform hover:-translate-y-0.5 ${LEVEL_COLOR[alert.content_level] ?? "border-gray-200 bg-white"}`}>
      {/* Snapshot */}
      <div className="relative w-full bg-gray-900" style={{ aspectRatio: "16/9" }}>
        {alert.snapshot_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={alert.snapshot_url}
            alt="Snapshot de detección"
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <svg className="h-12 w-12 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0" />
            </svg>
          </div>
        )}
        <div className="absolute left-2 top-2 flex flex-col gap-1">
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${LEVEL_BADGE[alert.content_level] ?? "bg-gray-100 text-gray-600"}`}>
            {LEVEL_LABEL[alert.content_level] ?? alert.content_level}
          </span>
          {alert.detection_type && (
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${isFace ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>
              {TYPE_LABEL[alert.detection_type] ?? alert.detection_type}
            </span>
          )}
        </div>
        <span className="absolute right-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-gray-200">
          {fmtTime(alert.generated_at)}
        </span>
      </div>

      {/* Cuerpo */}
      <div className="p-3">
        {alert.person_full_name && (
          <p className="mb-1 text-sm font-bold text-gray-900 truncate">{alert.person_full_name}</p>
        )}
        <div className="mb-2 space-y-1.5">
          {alert.yolo_confidence != null && (
            <div>
              <div className="mb-0.5 flex justify-between text-[10px] text-gray-500">
                <span>Confianza YOLO</span>
                <span className="font-semibold">{(alert.yolo_confidence * 100).toFixed(0)}%</span>
              </div>
              <ConfidenceBar value={alert.yolo_confidence} color="bg-blue-500" />
            </div>
          )}
          {alert.facenet_similarity != null && alert.facenet_similarity > 0 && (
            <div>
              <div className="mb-0.5 flex justify-between text-[10px] text-gray-500">
                <span>Similitud facial</span>
                <span className="font-semibold text-purple-700">{(alert.facenet_similarity * 100).toFixed(0)}%</span>
              </div>
              <ConfidenceBar value={alert.facenet_similarity} color="bg-purple-500" />
            </div>
          )}
        </div>
        {canSeeGPS && alert.gps_latitude != null && alert.gps_longitude != null && (
          <p className="mb-2 rounded bg-gray-100 px-2 py-1 font-mono text-[10px] text-gray-600">
            {alert.gps_latitude.toFixed(6)}, {alert.gps_longitude.toFixed(6)}
          </p>
        )}
        <div className="flex gap-2">
          <button
            onClick={handleConfirm}
            disabled={acting !== null}
            className="flex-1 rounded-lg bg-green-600 py-2 text-xs font-bold text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            {acting === "confirm" ? "…" : "✓ Confirmar"}
          </button>
          <button
            onClick={handleDismiss}
            disabled={acting !== null}
            className="flex-1 rounded-lg border border-gray-300 bg-white py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            {acting === "dismiss" ? "…" : "Falso positivo"}
          </button>
        </div>
        {alert.mission_id && (
          <button
            onClick={() => router.push(`/dashboard/missions/${alert.mission_id}`)}
            className="mt-2 w-full text-center text-[10px] font-medium text-blue-600 hover:text-blue-800 transition-colors"
          >
            Ver misión →
          </button>
        )}
      </div>
    </div>
  );
}

function ReviewedRow({ alert }: { alert: Alert }) {
  const router = useRouter();
  const isConfirmed = alert.status === "confirmed";
  return (
    <div className={`flex items-center gap-3 border-b border-gray-100 px-4 py-2.5 last:border-0 ${isConfirmed ? "" : "opacity-60"}`}>
      {alert.snapshot_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={alert.snapshot_url} alt="" className="h-10 w-10 shrink-0 rounded object-cover" loading="lazy" />
      ) : (
        <div className="h-10 w-10 shrink-0 rounded bg-gray-100" />
      )}
      <div className="flex-1 min-w-0">
        <p className="truncate text-xs font-semibold text-gray-800">
          {alert.person_full_name ?? (LEVEL_LABEL[alert.content_level] ?? alert.content_level)}
        </p>
        <p className="text-[10px] text-gray-400">{fmtTime(alert.generated_at)}</p>
      </div>
      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${isConfirmed ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
        {isConfirmed ? "Confirmada" : "Descartada"}
      </span>
      {alert.mission_id && (
        <button
          onClick={() => router.push(`/dashboard/missions/${alert.mission_id}`)}
          className="shrink-0 text-[10px] font-medium text-blue-600 hover:text-blue-800"
        >
          Ver →
        </button>
      )}
    </div>
  );
}

// ── Componentes tab "Historial" ───────────────────────────────────────────────

function SnapshotCanvas({ url, bbox, detectionType, confidence, similarity }: {
  url: string;
  bbox: { x: number; y: number; w: number; h: number; frame_w: number; frame_h: number };
  detectionType: string;
  confidence: number;
  similarity?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      canvas.width  = img.naturalWidth;
      canvas.height = img.naturalHeight;
      ctx.drawImage(img, 0, 0);
      drawDetectionBox(ctx, bbox, detectionType, confidence, similarity);
    };
    img.src = url;
  }, [url, bbox, detectionType, confidence, similarity]);

  return (
    <div className="overflow-hidden rounded-lg bg-slate-900 flex justify-center">
      <canvas ref={canvasRef} className="max-h-72 object-contain" style={{ maxWidth: "100%" }} />
    </div>
  );
}

function DetectionModal({ detection, onClose }: { detection: Detection; onClose: () => void }) {
  const detType = getDetectionType(detection.facenet_similarity);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="relative w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-2xl" style={{ maxHeight: "90vh" }}>
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-3">
            <span className={`rounded-full px-3 py-1 text-[11px] font-semibold ${TYPE_COLOR[detType]}`}>
              {TYPE_LABEL[detType]}
            </span>
            <span className="text-[12px] text-slate-500">
              {new Date(detection.created_at).toLocaleString("es-BO")}
            </span>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            ✕
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {detection.snapshot_url ? (
            <SnapshotCanvas
              url={detection.snapshot_url}
              bbox={detection.bounding_box}
              detectionType={detType}
              confidence={detection.yolo_confidence}
              similarity={detection.facenet_similarity > 0 ? detection.facenet_similarity : undefined}
            />
          ) : (
            <div className="flex h-40 items-center justify-center rounded-lg bg-slate-100 text-[12px] text-slate-400">
              Sin snapshot disponible
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-lg bg-slate-50 p-3 text-center">
              <p className="text-[11px] text-slate-500">Confianza YOLO</p>
              <p className="mt-1 text-lg font-bold text-slate-800">
                {(detection.yolo_confidence * 100).toFixed(1)}%
              </p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 text-center">
              <p className="text-[11px] text-slate-500">Similitud FaceNet</p>
              <p className={`mt-1 text-lg font-bold ${
                detection.facenet_similarity >= 0.7 ? "text-red-600"
                : detection.facenet_similarity > 0  ? "text-amber-600"
                : "text-slate-400"
              }`}>
                {detection.facenet_similarity > 0
                  ? `${(detection.facenet_similarity * 100).toFixed(1)}%`
                  : "—"}
              </p>
            </div>
            {detection.gps_latitude && detection.gps_longitude && (
              <div className="col-span-2 rounded-lg bg-slate-50 p-3 text-center">
                <p className="text-[11px] text-slate-500">Coordenadas GPS</p>
                <p className="mt-1 font-mono text-[12px] font-semibold text-slate-700">
                  {detection.gps_latitude.toFixed(6)}, {detection.gps_longitude.toFixed(6)}
                </p>
              </div>
            )}
          </div>

          <div className="rounded-lg bg-slate-50 p-3">
            <p className="mb-1 text-[11px] font-medium text-slate-500">Bounding box (px)</p>
            <p className="font-mono text-[11px] text-slate-600">
              x={detection.bounding_box.x} y={detection.bounding_box.y}{" "}
              w={detection.bounding_box.w} h={detection.bounding_box.h}{" "}
              (frame {detection.bounding_box.frame_w}×{detection.bounding_box.frame_h})
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────

type Tab = "review" | "history";

export default function DetectionsPage() {
  const router      = useRouter();
  const user        = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);

  const [tab, setTab] = useState<Tab>("review");

  // GPS visible para admin/super_admin/buscador — ayudante no
  const canSeeGPS = user?.role === "admin" || user?.role === "super_admin" || user?.role === "buscador";

  // ── Estado tab "Por revisar" ─────────────────────────────────────────────────
  const wsBase = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000";
  const wsUrl  = accessToken ? `${wsBase}/ws/alerts?token=${accessToken}` : null;

  const [alerts, setAlerts]       = useState<Alert[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(true);
  const [showReviewed, setShowReviewed]   = useState(false);

  useEffect(() => {
    alertsApi.list()
      .then(setAlerts)
      .catch(() => {})
      .finally(() => setAlertsLoading(false));
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleWsMessage = useCallback((msg: any) => {
    if (msg.type === "alert") {
      alertsApi.list().then(setAlerts).catch(() => {});
    }
  }, []);
  useWebSocket(wsUrl, handleWsMessage);

  const handleConfirm = useCallback((id: string) => {
    setAlerts((prev) => prev.map((a) => a.id === id ? { ...a, status: "confirmed" as const } : a));
  }, []);

  const handleDismiss = useCallback((id: string) => {
    setAlerts((prev) => prev.map((a) => a.id === id ? { ...a, status: "dismissed" as const } : a));
  }, []);

  const pending  = alerts.filter((a) => a.status === "generated" || a.status === "sent");
  const reviewed = alerts.filter((a) => a.status === "confirmed" || a.status === "dismissed");

  // ── Estado tab "Historial" ───────────────────────────────────────────────────
  const [detections, setDetections]   = useState<Detection[]>([]);
  const [missions, setMissions]       = useState<Mission[]>([]);
  const [detLoading, setDetLoading]   = useState(true);
  const [detError, setDetError]       = useState<string | null>(null);
  const [selected, setSelected]       = useState<Detection | null>(null);
  const [missionFilter, setMissionFilter] = useState<string>("all");
  const [page, setPage]               = useState(0);
  const pageSize = 20;

  useEffect(() => {
    missionsApi.list().then(setMissions).catch(() => {});
  }, []);

  useEffect(() => {
    if (tab !== "history") return;
    setDetLoading(true);
    setDetError(null);
    const params: Record<string, unknown> = { skip: page * pageSize, limit: pageSize };
    if (missionFilter !== "all") params.mission_id = missionFilter;
    detectionsApi
      .list(params as Parameters<typeof detectionsApi.list>[0])
      .then(setDetections)
      .catch(() => setDetError("Error al cargar detecciones"))
      .finally(() => setDetLoading(false));
  }, [tab, missionFilter, page]);

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col overflow-hidden">
      {/* Header con tabs */}
      <div className="shrink-0 border-b border-gray-200 bg-white px-6 pt-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Detecciones</h1>
            <p className="text-xs text-gray-500">
              {tab === "review"
                ? (pending.length > 0
                    ? `${pending.length} pendiente${pending.length > 1 ? "s" : ""} — confirma o descarta para limpiar la cola`
                    : "Cola de revisión limpia")
                : "Historial completo de detecciones por IA"}
            </p>
          </div>
          {tab === "review" && (
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-1 text-[10px] font-medium text-green-700">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
                En vivo
              </span>
              {reviewed.length > 0 && (
                <button
                  onClick={() => setShowReviewed((v) => !v)}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  {showReviewed ? "Ocultar revisadas" : `Ver revisadas (${reviewed.length})`}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Tab pills */}
        <div className="flex gap-0">
          <button
            onClick={() => setTab("review")}
            className={`relative px-4 py-2 text-[13px] font-medium border-b-2 transition-colors ${
              tab === "review"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            Por revisar
            {pending.length > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white min-w-[18px]">
                {pending.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setTab("history")}
            className={`px-4 py-2 text-[13px] font-medium border-b-2 transition-colors ${
              tab === "history"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            Historial
          </button>
        </div>
      </div>

      {/* Contenido scrolleable */}
      <div className="flex-1 overflow-y-auto">

        {/* ── Tab: Por revisar ──────────────────────────────────────────────── */}
        {tab === "review" && (
          <div className="p-5">
            {alertsLoading && (
              <div className="flex justify-center py-12"><LoadingSpinner /></div>
            )}

            {!alertsLoading && pending.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
                  <svg className="h-7 w-7 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-sm font-semibold text-gray-700">Cola limpia</p>
                <p className="mt-1 text-xs text-gray-400">Las nuevas alertas aparecerán aquí en tiempo real.</p>
              </div>
            )}

            {!alertsLoading && pending.length > 0 && (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {pending.map((alert) => (
                  <PendingCard
                    key={alert.id}
                    alert={alert}
                    canSeeGPS={canSeeGPS}
                    onConfirm={handleConfirm}
                    onDismiss={handleDismiss}
                  />
                ))}
              </div>
            )}

            {!alertsLoading && showReviewed && reviewed.length > 0 && (
              <div className="mt-6">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                  Revisadas ({reviewed.length})
                </p>
                <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                  {reviewed.map((alert) => (
                    <ReviewedRow key={alert.id} alert={alert} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Tab: Historial ────────────────────────────────────────────────── */}
        {tab === "history" && (
          <div className="p-5">
            {/* Filtros */}
            <div className="mb-4 flex flex-wrap gap-3">
              <select
                value={missionFilter}
                onChange={(e) => { setMissionFilter(e.target.value); setPage(0); }}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="all">Todas las misiones</option>
                {missions.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>

            {detLoading && <LoadingSpinner />}

            {!detLoading && detError && (
              <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{detError}</div>
            )}

            {!detLoading && !detError && detections.length === 0 && (
              <EmptyState title="Sin detecciones" description="No hay detecciones para los filtros seleccionados." />
            )}

            {!detLoading && !detError && detections.length > 0 && (
              <>
                <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
                  <table className="w-full min-w-[560px] text-[12px]">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-4 py-2.5 text-left text-[10px] font-medium uppercase tracking-wide text-slate-500">Tipo</th>
                        <th className="px-4 py-2.5 text-left text-[10px] font-medium uppercase tracking-wide text-slate-500">Confianza</th>
                        <th className="px-4 py-2.5 text-left text-[10px] font-medium uppercase tracking-wide text-slate-500">Similitud</th>
                        {canSeeGPS && (
                          <th className="px-4 py-2.5 text-left text-[10px] font-medium uppercase tracking-wide text-slate-500">GPS</th>
                        )}
                        <th className="px-4 py-2.5 text-left text-[10px] font-medium uppercase tracking-wide text-slate-500">Alerta</th>
                        <th className="px-4 py-2.5 text-left text-[10px] font-medium uppercase tracking-wide text-slate-500">Snapshot</th>
                        <th className="px-4 py-2.5 text-left text-[10px] font-medium uppercase tracking-wide text-slate-500">Fecha</th>
                        <th className="px-4 py-2.5 text-left text-[10px] font-medium uppercase tracking-wide text-slate-500"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {detections.map((det) => {
                        const detType = getDetectionType(det.facenet_similarity);
                        return (
                          <tr
                            key={det.id}
                            className="cursor-pointer transition-colors hover:bg-blue-50"
                            onClick={() => setSelected(det)}
                          >
                            <td className="px-4 py-3">
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${TYPE_COLOR[detType] ?? "bg-slate-100 text-slate-600"}`}>
                                {TYPE_LABEL[detType] ?? detType}
                              </span>
                            </td>
                            <td className="px-4 py-3 font-mono text-slate-700">
                              {(det.yolo_confidence * 100).toFixed(1)}%
                            </td>
                            <td className="px-4 py-3">
                              {det.facenet_similarity > 0 ? (
                                <span className={`font-mono font-semibold ${det.facenet_similarity >= 0.7 ? "text-red-600" : "text-amber-600"}`}>
                                  {(det.facenet_similarity * 100).toFixed(1)}%
                                </span>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                            {canSeeGPS && (
                              <td className="px-4 py-3">
                                {det.gps_latitude && det.gps_longitude ? (
                                  <span className="font-mono text-[10px] text-slate-500">
                                    {det.gps_latitude.toFixed(5)}, {det.gps_longitude.toFixed(5)}
                                  </span>
                                ) : (
                                  <span className="text-slate-400">—</span>
                                )}
                              </td>
                            )}
                            <td className="px-4 py-3">
                              {det.alert_status ? (
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${ALERT_STATUS_COLOR[det.alert_status] ?? "bg-slate-100 text-slate-600"}`}>
                                  {ALERT_STATUS_LABEL[det.alert_status] ?? det.alert_status}
                                </span>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {det.snapshot_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={det.snapshot_url} alt="Snapshot" className="h-10 w-10 rounded object-cover" loading="lazy" />
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-slate-500">
                              {new Date(det.created_at).toLocaleString("es-BO", { dateStyle: "short", timeStyle: "short" })}
                            </td>
                            <td className="px-4 py-3">
                              <button
                                onClick={(e) => { e.stopPropagation(); router.push(`/dashboard/missions/${det.mission_id}`); }}
                                className="text-[11px] font-medium text-blue-600 hover:text-blue-800 transition-colors"
                              >
                                Ver misión
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="mt-4 flex items-center justify-between">
                  <p className="text-[11px] text-slate-500">
                    Mostrando {detections.length} detecciones (página {page + 1})
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPage(Math.max(0, page - 1))}
                      disabled={page === 0}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition-colors"
                    >
                      Anterior
                    </button>
                    <button
                      onClick={() => setPage(page + 1)}
                      disabled={detections.length < pageSize}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition-colors"
                    >
                      Siguiente
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {selected && (
        <DetectionModal detection={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

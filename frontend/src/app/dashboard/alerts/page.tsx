// =============================================================================
// AEROFINDER Frontend — Dashboard de Alertas (triaje visual)
// Pendientes: tarjetas grandes con snapshot para confirmar/descartar rápido.
// Revisadas: lista compacta colapsable al final.
// =============================================================================
"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import { alertsApi } from "@/lib/api";
import type { Alert } from "@/lib/types";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useWebSocket } from "@/lib/websocket";

// ── Helpers ───────────────────────────────────────────────────────────────────

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

const TYPE_LABEL: Record<string, string> = {
  person_silhouette: "Silueta",
  face_candidate:    "Candidato facial",
  face_match:        "Coincidencia facial",
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

function ConfidenceBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(value * 100, 100).toFixed(0)}%` }} />
    </div>
  );
}

// ── Tarjeta pendiente ─────────────────────────────────────────────────────────

function PendingCard({
  alert,
  onConfirm,
  onDismiss,
}: {
  alert: Alert;
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
        {/* Badges superpuestos */}
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
        {/* Persona */}
        {alert.person_full_name && (
          <p className="mb-1 text-sm font-bold text-gray-900 truncate">
            {alert.person_full_name}
          </p>
        )}

        {/* Métricas */}
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

        {/* GPS */}
        {alert.gps_latitude != null && alert.gps_longitude != null && (
          <p className="mb-2 rounded bg-gray-100 px-2 py-1 font-mono text-[10px] text-gray-600">
            {alert.gps_latitude.toFixed(6)}, {alert.gps_longitude.toFixed(6)}
          </p>
        )}

        {/* Acciones */}
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

        {/* Link misión */}
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

// ── Fila revisada (compacta) ──────────────────────────────────────────────────

function ReviewedRow({ alert }: { alert: Alert }) {
  const router = useRouter();
  const isConfirmed = alert.status === "confirmed";
  return (
    <div
      className={`flex items-center gap-3 border-b border-gray-100 px-4 py-2.5 last:border-0 ${isConfirmed ? "" : "opacity-60"}`}
    >
      {/* Miniatura */}
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

// ── Página ────────────────────────────────────────────────────────────────────

export default function AlertsPage() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const wsBase = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000";
  const wsUrl = accessToken ? `${wsBase}/ws/alerts?token=${accessToken}` : null;

  const [alerts, setAlerts]   = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [showReviewed, setShowReviewed] = useState(false);

  // Carga inicial
  useEffect(() => {
    alertsApi.list()
      .then(setAlerts)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // WS en vivo — prepende nuevas alertas al inicio
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleWsMessage = useCallback((msg: any) => {
    if (msg.type === "alert") {
      // Recargar la lista para obtener datos enriquecidos del backend
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

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Alertas</h1>
            <p className="text-xs text-gray-500">
              {pending.length > 0
                ? `${pending.length} pendiente${pending.length > 1 ? "s" : ""} — confirma o descarta para limpiar la cola`
                : "Sin alertas pendientes"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Indicador WS */}
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
        </div>
      </div>

      {/* Cuerpo scrolleable */}
      <div className="flex-1 overflow-y-auto p-5">
        {loading && (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        )}

        {!loading && pending.length === 0 && (
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

        {/* Grid de pendientes */}
        {!loading && pending.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {pending.map((alert) => (
              <PendingCard
                key={alert.id}
                alert={alert}
                onConfirm={handleConfirm}
                onDismiss={handleDismiss}
              />
            ))}
          </div>
        )}

        {/* Lista de revisadas */}
        {!loading && showReviewed && reviewed.length > 0 && (
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
    </div>
  );
}

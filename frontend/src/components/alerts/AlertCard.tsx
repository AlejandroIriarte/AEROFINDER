// =============================================================================
// AEROFINDER Frontend — AlertCard
// Tarjeta de alerta con contenido filtrado por rol:
//   admin/buscador : foto, confianza, persona, GPS, confirmar/falso positivo
//   ayudante       : foto, confianza, tipo. SIN GPS. Botón "Visto"
//   familiar       : foto grande, mensaje simple, timestamp. SIN técnicos.
// =============================================================================

"use client";

import { useState } from "react";
import { alertsApi } from "@/lib/api";
import type { DetectionWSMessage } from "@/components/map/DetectionMarker";
import type { RoleName } from "@/lib/types";

// ── Props ─────────────────────────────────────────────────────────────────────

interface AlertCardProps {
  alert:    DetectionWSMessage;
  userRole: RoleName;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const TYPE_LABEL: Record<string, string> = {
  person_silhouette: "Silueta detectada",
  face_candidate:    "Posible rostro",
  face_match:        "Coincidencia facial",
};

// ── Componente ────────────────────────────────────────────────────────────────

export function AlertCard({ alert, userRole }: AlertCardProps) {
  const [status, setStatus]   = useState<"pending" | "confirmed" | "dismissed" | "seen">("pending");
  const [loading, setLoading] = useState(false);

  const timestamp = new Date(alert.frame_timestamp).toLocaleString("es-BO", {
    dateStyle: "short",
    timeStyle: "medium",
  });

  const handleAction = async (action: "confirm" | "dismiss" | "seen") => {
    if (!alert.alert_id) return;
    setLoading(true);
    try {
      if (action === "confirm") {
        await alertsApi.acknowledge(alert.alert_id);
        setStatus("confirmed");
      } else if (action === "dismiss") {
        await alertsApi.dismiss(alert.alert_id);
        setStatus("dismissed");
      } else {
        await alertsApi.acknowledge(alert.alert_id);
        setStatus("seen");
      }
    } catch {
      // Silenciar: acción best-effort
    } finally {
      setLoading(false);
    }
  };

  // ── Vista FAMILIAR ────────────────────────────────────────────────────────
  if (userRole === "familiar") {
    return (
      <div className="overflow-hidden rounded-xl border border-amber-200 bg-white shadow-sm">
        {/* Foto grande */}
        {alert.snapshot_url ? (
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={alert.snapshot_url}
              alt="Imagen de detección"
              className="w-full object-cover"
              style={{ maxHeight: 240 }}
              loading="lazy"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
          </div>
        ) : (
          <div className="flex h-36 items-center justify-center bg-gray-100">
            <svg className="h-12 w-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0" />
            </svg>
          </div>
        )}

        {/* Contenido */}
        <div className="px-4 py-3">
          <p className="text-base font-semibold text-gray-900">
            {alert.person_name
              ? `Se detectó una coincidencia con ${alert.person_name}`
              : "Se detectó una posible coincidencia"}
          </p>
          <p className="mt-1 text-xs text-gray-400">{timestamp}</p>

          {/* Badge de estado */}
          {status !== "pending" && (
            <span className="mt-2 inline-block rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
              Notificación vista
            </span>
          )}
        </div>
      </div>
    );
  }

  // ── Vista AYUDANTE ────────────────────────────────────────────────────────
  if (userRole === "ayudante") {
    return (
      <div
        className={`overflow-hidden rounded-lg border bg-white shadow-sm transition-opacity ${
          status === "seen" ? "opacity-60" : "border-yellow-200"
        }`}
      >
        <div className="flex gap-3 p-3">
          {/* Foto pequeña */}
          {alert.snapshot_url ? (
            <div className="shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={alert.snapshot_url}
                alt="Snapshot"
                className="h-20 w-20 rounded object-cover"
                loading="lazy"
              />
            </div>
          ) : (
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded bg-gray-100">
              <svg className="h-8 w-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0" />
              </svg>
            </div>
          )}

          {/* Info */}
          <div className="flex flex-1 flex-col justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-800">
                {TYPE_LABEL[alert.detection_type] ?? alert.detection_type}
              </p>
              <p className="mt-0.5 text-xs text-gray-500">
                Confianza: <span className="font-medium">{(alert.yolo_confidence * 100).toFixed(1)}%</span>
              </p>
              {alert.detection_type !== "person_silhouette" && (
                <p className="text-xs text-gray-500">
                  Similitud: <span className="font-medium text-amber-600">{(alert.similarity_score * 100).toFixed(1)}%</span>
                </p>
              )}
              <p className="mt-1 text-[10px] text-gray-400">{timestamp}</p>
            </div>

            {/* Acción */}
            {status === "pending" ? (
              <button
                onClick={() => handleAction("seen")}
                disabled={loading}
                className="mt-1 self-start rounded bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-200 disabled:opacity-50 transition-colors"
              >
                {loading ? "…" : "Visto"}
              </button>
            ) : (
              <span className="mt-1 text-xs text-green-600 font-medium">✓ Visto</span>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Vista ADMIN / BUSCADOR ────────────────────────────────────────────────
  return (
    <div
      className={`overflow-hidden rounded-lg border bg-white shadow-sm transition-opacity ${
        status === "dismissed"
          ? "opacity-50 border-gray-200"
          : status === "confirmed"
          ? "border-green-300"
          : "border-red-200"
      }`}
    >
      <div className="flex gap-3 p-3">
        {/* Foto */}
        {alert.snapshot_url ? (
          <div className="shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={alert.snapshot_url}
              alt="Snapshot de detección"
              className="h-24 w-24 rounded object-cover"
              loading="lazy"
            />
          </div>
        ) : (
          <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded bg-gray-100">
            <svg className="h-10 w-10 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0" />
            </svg>
          </div>
        )}

        {/* Detalles */}
        <div className="flex flex-1 flex-col gap-1">
          {/* Encabezado */}
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-gray-900">
                {TYPE_LABEL[alert.detection_type] ?? alert.detection_type}
              </p>
              {alert.person_name && (
                <p className="text-xs font-medium text-red-700">{alert.person_name}</p>
              )}
            </div>
            <span className="shrink-0 text-[10px] text-gray-400">{timestamp}</span>
          </div>

          {/* Métricas */}
          <div className="grid grid-cols-2 gap-x-3 text-xs">
            <span className="text-gray-500">Confianza YOLO</span>
            <span className="font-medium">{(alert.yolo_confidence * 100).toFixed(1)}%</span>

            {alert.detection_type !== "person_silhouette" && (
              <>
                <span className="text-gray-500">Similitud facial</span>
                <span className="font-medium text-red-600">
                  {(alert.similarity_score * 100).toFixed(1)}%
                </span>
              </>
            )}
          </div>

          {/* Coordenadas GPS */}
          {alert.gps?.lat && alert.gps?.lng && (
            <div className="rounded bg-gray-50 px-2 py-1 font-mono text-[10px] text-gray-600">
              {alert.gps.lat.toFixed(6)}, {alert.gps.lng.toFixed(6)}
              {alert.gps.altitude_m != null && (
                <span className="ml-2 text-gray-400">↑{alert.gps.altitude_m.toFixed(0)}m</span>
              )}
            </div>
          )}

          {/* Acciones */}
          {status === "pending" && (
            <div className="mt-1 flex gap-2">
              <button
                onClick={() => handleAction("confirm")}
                disabled={loading || !alert.alert_id}
                className="rounded bg-green-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-green-500 disabled:opacity-50 transition-colors"
              >
                {loading ? "…" : "Confirmar"}
              </button>
              <button
                onClick={() => handleAction("dismiss")}
                disabled={loading || !alert.alert_id}
                className="rounded bg-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-300 disabled:opacity-50 transition-colors"
              >
                Falso positivo
              </button>
            </div>
          )}
          {status === "confirmed" && (
            <span className="text-xs font-medium text-green-600">✓ Confirmado</span>
          )}
          {status === "dismissed" && (
            <span className="text-xs text-gray-400">Marcado como falso positivo</span>
          )}
        </div>
      </div>
    </div>
  );
}

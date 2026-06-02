// =============================================================================
// AEROFINDER — MissionAlertCard
// Tarjeta de alerta en el panel de la misión: thumbnail con bbox, % confianza,
// foto del desaparecido en face_match, y link a /dashboard/alerts.
// =============================================================================

"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { detectionsApi } from "@/lib/api";
import { drawDetectionBox } from "@/lib/drawDetectionBox";
import type { Alert, Detection, PhotoResponse } from "@/lib/types";

const LEVEL_BAR: Record<string, string> = {
  full:              "bg-red-500",
  partial:           "bg-amber-500",
  confirmation_only: "bg-blue-400",
};

const LEVEL_LABEL: Record<string, string> = {
  full:              "Coincidencia confirmada",
  partial:           "Coincidencia probable",
  confirmation_only: "Posible coincidencia",
};

const TYPE_ICON: Record<string, string> = {
  face_match:        "⚠️",
  face_candidate:    "🔍",
  person_silhouette: "👤",
};

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1)  return "ahora";
  if (mins < 60) return `hace ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `hace ${hrs}h`;
  return new Date(iso).toLocaleDateString("es-BO", { day: "2-digit", month: "short" });
}

// ── Thumbnail 80×60 con bbox escalado ─────────────────────────────────────────

function AlertThumb({ detection }: { detection: Detection }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !detection.snapshot_url) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const scaleX = canvas.width  / (detection.bounding_box.frame_w || img.naturalWidth);
      const scaleY = canvas.height / (detection.bounding_box.frame_h || img.naturalHeight);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      const scaledBbox = {
        x: detection.bounding_box.x * scaleX,
        y: detection.bounding_box.y * scaleY,
        w: detection.bounding_box.w * scaleX,
        h: detection.bounding_box.h * scaleY,
      };

      const detType = detection.facenet_similarity >= 0.7
        ? "face_match"
        : detection.facenet_similarity > 0
        ? "face_candidate"
        : "person_silhouette";

      drawDetectionBox(
        ctx,
        scaledBbox,
        detType,
        detection.yolo_confidence,
        detection.facenet_similarity > 0 ? detection.facenet_similarity : undefined,
      );
    };
    img.src = detection.snapshot_url;
  }, [detection]);

  if (!detection.snapshot_url) {
    return (
      <div className="flex h-[60px] w-[80px] shrink-0 items-center justify-center rounded bg-slate-100 text-[10px] text-slate-400">
        Sin foto
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      width={80}
      height={60}
      className="shrink-0 rounded bg-slate-900"
    />
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

interface Props {
  alert: Alert;
  missingPersonPhotos: PhotoResponse[];
}

export function MissionAlertCard({ alert, missingPersonPhotos }: Props) {
  const router = useRouter();
  const [detection, setDetection] = useState<Detection | null>(null);

  // Carga lazy de la detección para obtener snapshot presigned + bounding_box
  useEffect(() => {
    if (!alert.detection_id) return;
    detectionsApi.get(alert.detection_id)
      .then(setDetection)
      .catch(() => {});
  }, [alert.detection_id]);

  const detType = detection
    ? (detection.facenet_similarity >= 0.7
        ? "face_match"
        : detection.facenet_similarity > 0
        ? "face_candidate"
        : "person_silhouette")
    : null;

  const isFaceMatch = detType === "face_match";

  // Primera foto activa del desaparecido (frontal preferida)
  const personPhoto = missingPersonPhotos.find(
    (p) => p.is_active && p.face_angle === "frontal"
  ) ?? missingPersonPhotos.find((p) => p.is_active) ?? null;

  return (
    <li className="overflow-hidden rounded-md border border-slate-100 bg-slate-50">
      <div className="flex gap-2 p-2">
        {/* Barra lateral de nivel */}
        <div className={`w-1 shrink-0 self-stretch rounded-full ${LEVEL_BAR[alert.content_level] ?? "bg-slate-300"}`} />

        {/* Thumbnail snapshot */}
        {detection ? (
          <AlertThumb detection={detection} />
        ) : (
          <div className="flex h-[60px] w-[80px] shrink-0 items-center justify-center rounded bg-slate-200">
            <svg className="h-4 w-4 animate-spin text-slate-400" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
            </svg>
          </div>
        )}

        {/* Si es face_match, foto del desaparecido para comparación */}
        {isFaceMatch && personPhoto?.view_url && (
          <div className="flex shrink-0 flex-col items-center gap-0.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={personPhoto.view_url}
              alt="Desaparecido"
              className="h-[60px] w-[45px] rounded object-cover"
            />
            <span className="text-[9px] text-slate-400">Buscado</span>
          </div>
        )}

        {/* Info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <span className="text-[11px]">{detType ? TYPE_ICON[detType] : "●"}</span>
            <span className="truncate text-[11px] font-semibold text-slate-800">
              {LEVEL_LABEL[alert.content_level] ?? alert.content_level}
            </span>
          </div>

          {detection && (
            <div className="mt-0.5 flex gap-2 text-[10px] text-slate-500">
              <span>
                YOLO:{" "}
                <span className="font-mono font-semibold text-slate-700">
                  {(detection.yolo_confidence * 100).toFixed(1)}%
                </span>
              </span>
              {detection.facenet_similarity > 0 && (
                <span>
                  Sim:{" "}
                  <span className={`font-mono font-semibold ${
                    detection.facenet_similarity >= 0.7 ? "text-red-600" : "text-amber-600"
                  }`}>
                    {(detection.facenet_similarity * 100).toFixed(1)}%
                  </span>
                </span>
              )}
            </div>
          )}

          <p className="mt-0.5 text-[10px] text-slate-400">{formatRelative(alert.generated_at)}</p>
        </div>
      </div>

      {/* Footer con link */}
      <div className="border-t border-slate-100 px-2 py-1.5">
        <button
          onClick={() => router.push("/dashboard/alerts")}
          className="text-[10px] font-semibold text-blue-600 transition-colors hover:text-blue-800"
        >
          Ver en alertas →
        </button>
      </div>
    </li>
  );
}

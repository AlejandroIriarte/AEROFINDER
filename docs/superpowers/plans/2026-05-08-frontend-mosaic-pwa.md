# Frontend: Mosaico Multi-Dron + PWA Rescatistas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar el mosaico de video multi-dron con controles de reconocimiento, el panel de field reports para el admin, el flujo completo del rescatista en PWA, y la página pública `/connect` mejorada con drones registrados.

**Architecture:** Nuevos componentes React en `components/mission/` consumen APIs ya implementadas en el plan backend. Las rutas `/app/*` son mobile-optimized sin sidebar. El manifest.json + service worker convierten el frontend Next.js en PWA instalable. Todos los componentes usan el `useWebSocket` hook existente para recibir eventos en tiempo real.

**Tech Stack:** Next.js 14 App Router, React 18, Zustand, hls.js, Tailwind CSS, Web Push API (browser nativo), `react-qr-code` (ya instalado)

**Prerequisito:** El plan backend debe estar completado y el servidor corriendo antes de ejecutar este plan.

---

## Mapa de archivos

| Acción | Archivo |
|--------|---------|
| Modify | `frontend/src/lib/types.ts` |
| Modify | `frontend/src/lib/api.ts` |
| Create | `frontend/src/components/mission/DroneStreamCard.tsx` |
| Create | `frontend/src/components/mission/DroneVideoMosaic.tsx` |
| Create | `frontend/src/components/mission/FieldReportPanel.tsx` |
| Create | `frontend/src/components/mission/FieldReportResultModal.tsx` |
| Modify | `frontend/src/app/dashboard/missions/[id]/page.tsx` |
| Modify | `frontend/src/app/dashboard/drones/page.tsx` |
| Create | `frontend/public/manifest.json` |
| Create | `frontend/public/sw.js` |
| Modify | `frontend/src/app/layout.tsx` |
| Create | `frontend/src/app/app/layout.tsx` |
| Create | `frontend/src/app/app/mission/page.tsx` |
| Create | `frontend/src/app/app/report/page.tsx` |
| Create | `frontend/src/app/app/report/photos/page.tsx` |
| Create | `frontend/src/app/app/report/result/page.tsx` |
| Modify | `frontend/src/app/connect/page.tsx` |

---

## Task 1: Tipos y API client

**Files:**
- Modify: `frontend/src/lib/types.ts`
- Modify: `frontend/src/lib/api.ts`

- [ ] **Agregar tipos nuevos al final de `frontend/src/lib/types.ts`:**

```typescript
// ── Field Reports ─────────────────────────────────────────────────────────────

export interface FieldReportMatch {
  person_id: string;
  person_name: string;
  similarity_score: number;   // 0.0 a 1.0
  rank: number;
  photo_url: string | null;
}

export interface FieldReportPhoto {
  id: string;
  minio_object: string;
  uploaded_at: string;
}

export interface FieldReport {
  id: string;
  mission_id: string;
  rescuer_id: string;
  rescuer_name: string;
  status: "pending" | "approved" | "rejected" | "analyzing" | "completed";
  notes: string | null;
  location_lat: number | null;
  location_lon: number | null;
  approved_by: string | null;
  approved_at: string | null;
  completed_at: string | null;
  created_at: string;
  photos: FieldReportPhoto[];
  matches: FieldReportMatch[];
}

export interface UploadUrlResponse {
  presigned_url: string;
  object_name: string;
  photo_index: number;
}

// ── Drone (actualizado) ───────────────────────────────────────────────────────

// Agregar a la interfaz Drone existente:
// auto_created: boolean;
// rtmp_url: string | null;
// hls_url: string | null;
```

En la interfaz `Drone` existente, agregar los tres campos:

```typescript
auto_created: boolean;
rtmp_url: string | null;
hls_url: string | null;
```

En la interfaz `Mission` existente, agregar:

```typescript
face_recognition_active: boolean;
```

- [ ] **Agregar `fieldReportsApi` y `pushApi` a `frontend/src/lib/api.ts`:**

```typescript
// ── Field Reports API ─────────────────────────────────────────────────────────

export const fieldReportsApi = {
  async listForMission(missionId: string): Promise<FieldReport[]> {
    const { data } = await api.get<FieldReport[]>(`/missions/${missionId}/field-reports`);
    return data;
  },

  async create(missionId: string, payload: {
    notes?: string;
    location_lat?: number;
    location_lon?: number;
  }): Promise<{ id: string; status: string }> {
    const { data } = await api.post(`/missions/${missionId}/field-reports`, payload);
    return data;
  },

  async get(reportId: string): Promise<FieldReport> {
    const { data } = await api.get<FieldReport>(`/field-reports/${reportId}`);
    return data;
  },

  async approve(reportId: string): Promise<FieldReport> {
    const { data } = await api.patch<FieldReport>(`/field-reports/${reportId}/approve`);
    return data;
  },

  async reject(reportId: string, reason: string): Promise<FieldReport> {
    const { data } = await api.patch<FieldReport>(`/field-reports/${reportId}/reject`, { reason });
    return data;
  },

  async getUploadUrl(reportId: string, photoIndex: number): Promise<UploadUrlResponse> {
    const { data } = await api.post<UploadUrlResponse>(
      `/field-reports/${reportId}/photos/upload-url`,
      null,
      { params: { photo_index: photoIndex } }
    );
    return data;
  },

  async confirmPhoto(reportId: string, objectName: string): Promise<void> {
    await api.post(`/field-reports/${reportId}/photos/confirm`, { object_name: objectName });
  },

  async analyze(reportId: string): Promise<void> {
    await api.post(`/field-reports/${reportId}/analyze`);
  },
};

// ── Push Notifications API ────────────────────────────────────────────────────

export const pushApi = {
  async subscribe(subscription: PushSubscriptionJSON): Promise<void> {
    const keys = subscription.keys as { p256dh: string; auth: string };
    await api.post("/push/subscribe", {
      endpoint: subscription.endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
    });
  },

  async unsubscribe(endpoint: string): Promise<void> {
    await api.delete("/push/subscribe", { data: { endpoint } });
  },
};
```

También actualizar `missionsApi.setRecognition`:

```typescript
async setRecognition(missionId: string, personDetection: boolean, faceRecognition: boolean): Promise<Mission> {
  const { data } = await api.post<Mission>(`/missions/${missionId}/recognition`, {
    person_detection: personDetection,
    face_recognition: faceRecognition,
  });
  return data;
},
```

- [ ] **Commit:**

```bash
git add frontend/src/lib/types.ts frontend/src/lib/api.ts
git commit -m "feat: types y api — FieldReport, face_recognition, auto_created, pushApi"
```

---

## Task 2: Componente DroneStreamCard

**Files:**
- Create: `frontend/src/components/mission/DroneStreamCard.tsx`

- [ ] **Crear el componente:**

```tsx
// =============================================================================
// AEROFINDER Frontend — DroneStreamCard
// Tarjeta individual de dron en el mosaico: video HLS + controles reconocimiento.
// Los botones de reconocimiento controlan flags a nivel misión (aplican a todos).
// =============================================================================

"use client";

import { useState } from "react";
import type { Drone } from "@/lib/types";

interface Props {
  drone: Drone;
  streamReady: boolean;
  personDetection: boolean;
  faceRecognition: boolean;
  onTogglePersonDetection: () => void;
  onToggleFaceRecognition: () => void;
  canManage: boolean;
  // El HLS URL viene del drone.hls_url o se construye en el padre
  hlsUrl: string | null;
}

export function DroneStreamCard({
  drone,
  streamReady,
  personDetection,
  faceRecognition,
  onTogglePersonDetection,
  onToggleFaceRecognition,
  canManage,
  hlsUrl,
}: Props) {
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-gray-900 shadow-sm">
      {/* Video */}
      <div className="relative aspect-video w-full bg-gray-900">
        {streamReady && hlsUrl ? (
          <HlsPlayer url={hlsUrl} />
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <svg className="mx-auto mb-2 h-8 w-8 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
              </svg>
              <p className="text-xs text-gray-500">Sin señal</p>
            </div>
          </div>
        )}

        {/* Badge en vivo */}
        {streamReady && (
          <span className="absolute left-2 top-2 rounded-full bg-green-500 px-2 py-0.5 text-[10px] font-bold text-white">
            ● EN VIVO
          </span>
        )}
      </div>

      {/* Info + controles */}
      <div className="bg-white p-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-gray-900">{drone.model}</p>
            <p className="truncate font-mono text-[10px] text-gray-400">{drone.serial_number}</p>
          </div>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${streamReady ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
            {streamReady ? "En vivo" : "Sin señal"}
          </span>
        </div>

        {canManage && (
          <div className="flex gap-2">
            <button
              onClick={onTogglePersonDetection}
              className={`flex-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold transition-colors ${
                personDetection
                  ? "bg-blue-600 text-white hover:bg-blue-700"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              👤 {personDetection ? "Detección ON" : "Detección OFF"}
            </button>
            <button
              onClick={onToggleFaceRecognition}
              className={`flex-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold transition-colors ${
                faceRecognition
                  ? "bg-purple-600 text-white hover:bg-purple-700"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              🔍 {faceRecognition ? "Facial ON" : "Facial OFF"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── HLS Player inline (reutiliza hls.js) ─────────────────────────────────────

import { useEffect, useRef } from "react";
import Hls from "hls.js";

function HlsPlayer({ url }: { url: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (Hls.isSupported()) {
      const hls = new Hls({ lowLatencyMode: true });
      hls.loadSource(url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => { video.play().catch(() => {}); });
      return () => hls.destroy();
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = url;
      video.play().catch(() => {});
    }
  }, [url]);

  return (
    <video
      ref={videoRef}
      className="h-full w-full object-contain"
      muted
      playsInline
      autoPlay
    />
  );
}
```

- [ ] **Commit:**

```bash
git add frontend/src/components/mission/DroneStreamCard.tsx
git commit -m "feat: componente DroneStreamCard — video HLS + controles reconocimiento"
```

---

## Task 3: Componente DroneVideoMosaic

**Files:**
- Create: `frontend/src/components/mission/DroneVideoMosaic.tsx`

- [ ] **Crear el componente mosaico:**

```tsx
// =============================================================================
// AEROFINDER Frontend — DroneVideoMosaic
// Grid dinámico: 1 dron=full, 2=50/50, 3-4=2x2.
// Controles de reconocimiento aplican a nivel misión completa.
// =============================================================================

"use client";

import { useCallback } from "react";
import type { Drone, Mission, StreamInfo } from "@/lib/types";
import { missionsApi } from "@/lib/api";
import { DroneStreamCard } from "./DroneStreamCard";

interface Props {
  mission: Mission;
  assignedDrones: Drone[];              // drones actualmente asignados (sin left_at)
  streams: StreamInfo[];                // streams activos en MediaMTX
  canManage: boolean;
  onMissionUpdate: (m: Mission) => void;
}

export function DroneVideoMosaic({
  mission,
  assignedDrones,
  streams,
  canManage,
  onMissionUpdate,
}: Props) {
  const streamBySerial = new Map(streams.map((s) => [s.serial, s]));

  const handleTogglePersonDetection = useCallback(async () => {
    try {
      const updated = await missionsApi.setRecognition(
        mission.id,
        !mission.recognition_active,
        mission.face_recognition_active,
      );
      onMissionUpdate(updated);
    } catch {
      // silencioso
    }
  }, [mission, onMissionUpdate]);

  const handleToggleFaceRecognition = useCallback(async () => {
    try {
      const updated = await missionsApi.setRecognition(
        mission.id,
        mission.recognition_active,
        !mission.face_recognition_active,
      );
      onMissionUpdate(updated);
    } catch {
      // silencioso
    }
  }, [mission, onMissionUpdate]);

  if (assignedDrones.length === 0) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-500">Sin drones asignados a esta misión</p>
      </div>
    );
  }

  // Determinar layout según cantidad de drones
  const gridClass =
    assignedDrones.length === 1
      ? "grid-cols-1"
      : assignedDrones.length === 2
      ? "grid-cols-2"
      : "grid-cols-2";

  return (
    <div className={`grid h-full gap-1 p-1 ${gridClass}`} style={{ alignContent: "start" }}>
      {assignedDrones.map((drone) => {
        const stream = streamBySerial.get(drone.serial_number);
        return (
          <DroneStreamCard
            key={drone.id}
            drone={drone}
            streamReady={stream?.ready ?? false}
            hlsUrl={stream?.hls_url ?? drone.hls_url ?? null}
            personDetection={mission.recognition_active}
            faceRecognition={mission.face_recognition_active}
            onTogglePersonDetection={handleTogglePersonDetection}
            onToggleFaceRecognition={handleToggleFaceRecognition}
            canManage={canManage}
          />
        );
      })}
    </div>
  );
}
```

- [ ] **Commit:**

```bash
git add frontend/src/components/mission/DroneVideoMosaic.tsx
git commit -m "feat: DroneVideoMosaic — grid dinámico 1/2/4 drones"
```

---

## Task 4: Componente FieldReportPanel

**Files:**
- Create: `frontend/src/components/mission/FieldReportPanel.tsx`

- [ ] **Crear el panel de field reports para el admin:**

```tsx
// =============================================================================
// AEROFINDER Frontend — FieldReportPanel
// Panel lateral en misión: lista solicitudes pendientes y completadas.
// Admin puede aprobar/rechazar. Muestra resultado con matches.
// =============================================================================

"use client";

import { useState } from "react";
import type { FieldReport } from "@/lib/types";
import { fieldReportsApi } from "@/lib/api";

interface Props {
  reports: FieldReport[];
  canManage: boolean;
  onUpdate: (report: FieldReport) => void;
  onViewResult: (report: FieldReport) => void;
}

export function FieldReportPanel({ reports, canManage, onUpdate, onViewResult }: Props) {
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const pending   = reports.filter((r) => r.status === "pending");
  const active    = reports.filter((r) => ["approved", "analyzing"].includes(r.status));
  const completed = reports.filter((r) => r.status === "completed");
  const rejected  = reports.filter((r) => r.status === "rejected");

  async function handleApprove(reportId: string) {
    try {
      const updated = await fieldReportsApi.approve(reportId);
      onUpdate(updated);
    } catch {
      alert("Error al aprobar el reporte");
    }
  }

  async function handleReject(reportId: string) {
    if (!rejectReason.trim()) return;
    try {
      const updated = await fieldReportsApi.reject(reportId, rejectReason);
      onUpdate(updated);
      setRejecting(null);
      setRejectReason("");
    } catch {
      alert("Error al rechazar el reporte");
    }
  }

  const statusLabel: Record<string, string> = {
    pending:   "Pendiente",
    approved:  "Aprobado",
    rejected:  "Rechazado",
    analyzing: "Analizando…",
    completed: "Completado",
  };

  if (reports.length === 0) {
    return (
      <div className="px-4 py-3 text-xs text-gray-400">Sin reportes de campo</div>
    );
  }

  return (
    <div className="space-y-1 px-4 py-2">
      {/* Pendientes — acción requerida */}
      {pending.map((r) => (
        <div key={r.id} className="rounded-lg border border-amber-200 bg-amber-50 p-2.5">
          <div className="mb-1.5 flex items-start justify-between gap-1">
            <div>
              <p className="text-xs font-semibold text-amber-800">{r.rescuer_name}</p>
              <p className="text-[10px] text-amber-600">
                {new Date(r.created_at).toLocaleTimeString("es-BO", { timeStyle: "short" })}
                {r.location_lat && ` · ${r.location_lat.toFixed(4)}, ${r.location_lon?.toFixed(4)}`}
              </p>
              {r.notes && <p className="mt-0.5 text-[10px] text-amber-700">{r.notes}</p>}
            </div>
          </div>

          {canManage && rejecting === r.id ? (
            <div className="space-y-1">
              <input
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Motivo del rechazo"
                className="w-full rounded border border-gray-200 px-2 py-1 text-xs focus:outline-none"
                autoFocus
              />
              <div className="flex gap-1">
                <button
                  onClick={() => handleReject(r.id)}
                  className="flex-1 rounded bg-red-600 py-1 text-[10px] font-semibold text-white hover:bg-red-700"
                >
                  Confirmar rechazo
                </button>
                <button
                  onClick={() => { setRejecting(null); setRejectReason(""); }}
                  className="rounded bg-gray-200 px-2 py-1 text-[10px] text-gray-600"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : canManage ? (
            <div className="flex gap-1">
              <button
                onClick={() => handleApprove(r.id)}
                className="flex-1 rounded bg-green-600 py-1 text-[10px] font-semibold text-white hover:bg-green-700"
              >
                ✓ Aprobar
              </button>
              <button
                onClick={() => setRejecting(r.id)}
                className="flex-1 rounded bg-red-50 py-1 text-[10px] font-semibold text-red-600 hover:bg-red-100"
              >
                ✗ Rechazar
              </button>
            </div>
          ) : null}
        </div>
      ))}

      {/* En proceso */}
      {active.map((r) => (
        <div key={r.id} className="rounded-lg border border-blue-100 bg-blue-50 p-2.5">
          <p className="text-xs font-medium text-blue-800">{r.rescuer_name}</p>
          <p className="text-[10px] text-blue-600">
            {r.status === "analyzing" ? "⏳ Analizando con IA…" : "✓ Aprobado — esperando fotos"}
          </p>
        </div>
      ))}

      {/* Completados */}
      {completed.map((r) => (
        <div key={r.id} className="rounded-lg border border-gray-100 bg-gray-50 p-2.5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-700">{r.rescuer_name}</p>
              {r.matches.length > 0 && (
                <p className="text-[10px] font-semibold text-green-700">
                  {(r.matches[0].similarity_score * 100).toFixed(1)}% — {r.matches[0].person_name}
                </p>
              )}
            </div>
            <button
              onClick={() => onViewResult(r)}
              className="rounded bg-blue-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-blue-700"
            >
              Ver
            </button>
          </div>
        </div>
      ))}

      {/* Rechazados */}
      {rejected.map((r) => (
        <div key={r.id} className="rounded-lg border border-red-100 bg-red-50 p-2">
          <p className="text-[10px] text-red-600 line-through">{r.rescuer_name} — Rechazado</p>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Commit:**

```bash
git add frontend/src/components/mission/FieldReportPanel.tsx
git commit -m "feat: FieldReportPanel — lista solicitudes con aprobar/rechazar/ver resultado"
```

---

## Task 5: Componente FieldReportResultModal

**Files:**
- Create: `frontend/src/components/mission/FieldReportResultModal.tsx`

- [ ] **Crear el modal de resultado:**

```tsx
// =============================================================================
// AEROFINDER Frontend — FieldReportResultModal
// Muestra top-3 coincidencias del análisis FaceNet con barras de similitud.
// =============================================================================

"use client";

import type { FieldReport } from "@/lib/types";
import { Modal } from "@/components/ui/Modal";

interface Props {
  report: FieldReport | null;
  onClose: () => void;
}

const SIMILARITY_COLOR = (score: number) => {
  if (score >= 0.85) return "bg-green-500";
  if (score >= 0.65) return "bg-amber-500";
  return "bg-red-400";
};

const SIMILARITY_LABEL = (score: number) => {
  if (score >= 0.85) return "Alta coincidencia";
  if (score >= 0.65) return "Posible coincidencia";
  return "Baja similitud";
};

export function FieldReportResultModal({ report, onClose }: Props) {
  if (!report) return null;

  return (
    <Modal open={!!report} title="Resultado del análisis" onClose={onClose}>
      <div className="space-y-4">
        {/* Info del reporte */}
        <div className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
          <p><span className="font-medium">Rescatista:</span> {report.rescuer_name}</p>
          <p><span className="font-medium">Fotos analizadas:</span> {report.photos.length}</p>
          {report.completed_at && (
            <p><span className="font-medium">Completado:</span>{" "}
              {new Date(report.completed_at).toLocaleString("es-BO", { dateStyle: "short", timeStyle: "short" })}
            </p>
          )}
        </div>

        {/* Sin resultados */}
        {report.matches.length === 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-center">
            <p className="text-sm font-medium text-amber-800">Sin coincidencias encontradas</p>
            <p className="mt-1 text-xs text-amber-600">
              Ninguna persona de la misión coincide con las fotos enviadas.
            </p>
          </div>
        )}

        {/* Top matches */}
        {report.matches.map((match) => (
          <div key={match.person_id} className="rounded-lg border border-gray-200 bg-white p-3">
            <div className="mb-2 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-gray-500">#{match.rank}</span>
                <p className="text-sm font-semibold text-gray-900">{match.person_name}</p>
              </div>
              <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-white ${
                match.similarity_score >= 0.85 ? "bg-green-600" :
                match.similarity_score >= 0.65 ? "bg-amber-500" : "bg-red-400"
              }`}>
                {(match.similarity_score * 100).toFixed(1)}%
              </span>
            </div>

            {/* Barra de similitud */}
            <div className="mb-1.5 h-2 w-full overflow-hidden rounded-full bg-gray-100">
              <div
                className={`h-full rounded-full transition-all ${SIMILARITY_COLOR(match.similarity_score)}`}
                style={{ width: `${(match.similarity_score * 100).toFixed(1)}%` }}
              />
            </div>
            <p className="text-[10px] text-gray-500">{SIMILARITY_LABEL(match.similarity_score)}</p>
          </div>
        ))}

        <button
          onClick={onClose}
          className="w-full rounded-lg bg-gray-100 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-200"
        >
          Cerrar
        </button>
      </div>
    </Modal>
  );
}
```

- [ ] **Commit:**

```bash
git add frontend/src/components/mission/FieldReportResultModal.tsx
git commit -m "feat: FieldReportResultModal — top-3 matches con barras de similitud"
```

---

## Task 6: Actualizar página de misión

**Files:**
- Modify: `frontend/src/app/dashboard/missions/[id]/page.tsx`

- [ ] **Reemplazar el área de video único por `DroneVideoMosaic`:**

En el import block, agregar:

```typescript
import { DroneVideoMosaic } from "@/components/mission/DroneVideoMosaic";
import { FieldReportPanel } from "@/components/mission/FieldReportPanel";
import { FieldReportResultModal } from "@/components/mission/FieldReportResultModal";
import { fieldReportsApi } from "@/lib/api";
import type { FieldReport } from "@/lib/types";
```

En el estado del componente, agregar:

```typescript
const [fieldReports,    setFieldReports]    = useState<FieldReport[]>([]);
const [viewingReport,   setViewingReport]   = useState<FieldReport | null>(null);
const [streams,         setStreams]         = useState<StreamInfo[]>([]);
```

En el `useEffect` de carga inicial, agregar a la lista de Promises:

```typescript
dronesApi.listStreams().catch(() => []),
fieldReportsApi.listForMission(missionId).catch(() => []),
```

Y en el `.then(...)`:

```typescript
setStreams(streamsData);
setFieldReports(reportsData);
```

Reemplazar el bloque `{/* Cuerpo: mapa 70% + panel derecho 30% */}`:

La sección de mapa (70%) mantiene el `MissionMap` existente.

En el panel derecho (30%), reemplazar el bloque de video actual con:

```tsx
{/* Mosaico de drones */}
<div className="shrink-0 border-b border-gray-100" style={{ height: "45%" }}>
  <DroneVideoMosaic
    mission={mission}
    assignedDrones={assignedDrones
      .filter((d) => !d.left_at)
      .map((d) => allDrones.find((x) => x.id === d.drone_id))
      .filter(Boolean) as Drone[]}
    streams={streams}
    canManage={canManage}
    onMissionUpdate={setMission}
  />
</div>
```

En la sección de field reports del panel derecho, agregar después de la sección de drones asignados:

```tsx
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
```

Al final del componente, antes del cierre del `return`, agregar:

```tsx
<FieldReportResultModal
  report={viewingReport}
  onClose={() => setViewingReport(null)}
/>
```

Agregar handler WebSocket para eventos nuevos en el `useWebSocket` o en el effect de WS:

```typescript
// En el handler de mensajes WS existente, agregar casos:
case "field_report_request":
case "field_report_approved":
case "field_report_rejected":
case "field_report_result":
  // Refrescar la lista de reportes
  fieldReportsApi.listForMission(missionId)
    .then(setFieldReports)
    .catch(() => {});
  break;
case "mission_recognition":
  setMission((prev) => prev ? {
    ...prev,
    recognition_active: msg.person_detection,
    face_recognition_active: msg.face_recognition,
  } : prev);
  break;
```

- [ ] **Commit:**

```bash
git add frontend/src/app/dashboard/missions/\[id\]/page.tsx
git commit -m "feat: mission detail — mosaico multi-dron + field reports panel + WS events"
```

---

## Task 7: Drones page — RTMP URL + edición + badge auto-created

**Files:**
- Modify: `frontend/src/app/dashboard/drones/page.tsx`

- [ ] **Agregar al estado de la página:**

```typescript
const [editingDrone, setEditingDrone] = useState<Drone | null>(null);
const [editForm, setEditForm] = useState({ model: "", manufacturer: "" });
const [networkInfo, setNetworkInfo] = useState<NetworkInfo | null>(null);
```

- [ ] **Cargar `networkInfo` en el `useEffect` inicial:**

```typescript
systemApi.getNetworkInfo().then(setNetworkInfo).catch(() => {});
```

- [ ] **Reemplazar el card de dron registrado** para incluir RTMP URL, badge auto-created y botón editar:

```tsx
{drones.map((drone) => {
  const isLive = streams.some((s) => s.serial === drone.serial_number && s.ready);
  const rtmpUrl = drone.rtmp_url ??
    (networkInfo ? networkInfo.rtmp_url_template.replace("{serial}", drone.serial_number) : null);

  return (
    <div key={drone.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="truncate font-semibold text-gray-900">{drone.model}</p>
            {isLive && (
              <span className="shrink-0 rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold text-green-700">
                En vivo
              </span>
            )}
            {drone.auto_created && (
              <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                ⚠ Sin configurar
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400">{drone.manufacturer}</p>
          <p className="mt-0.5 font-mono text-[10px] text-gray-400">{drone.serial_number}</p>
        </div>
        <StatusBadge value={drone.status} domain="drone" />
      </div>

      {/* URL RTMP siempre visible */}
      {rtmpUrl && (
        <div className="mb-2 flex items-center gap-1.5 rounded-lg bg-amber-50 px-2 py-1.5">
          <code className="flex-1 truncate text-[10px] text-amber-800">{rtmpUrl}</code>
          <button
            onClick={() => {
              navigator.clipboard.writeText(rtmpUrl);
            }}
            className="shrink-0 rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 hover:bg-amber-300"
          >
            Copiar
          </button>
        </div>
      )}

      {/* Botón editar (admin) */}
      {isAdmin && (
        <button
          onClick={() => {
            setEditingDrone(drone);
            setEditForm({ model: drone.model, manufacturer: drone.manufacturer });
          }}
          className="w-full rounded-lg border border-gray-200 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
        >
          ✏ Editar detalles
        </button>
      )}
    </div>
  );
})}
```

- [ ] **Agregar modal de edición:**

```tsx
{/* Modal editar dron */}
<Modal
  open={!!editingDrone}
  title="Editar dron"
  onClose={() => setEditingDrone(null)}
>
  <form
    onSubmit={async (e) => {
      e.preventDefault();
      if (!editingDrone) return;
      try {
        const updated = await dronesApi.update(editingDrone.id, editForm);
        setDrones((prev) => prev.map((d) => d.id === updated.id ? updated : d));
        setEditingDrone(null);
      } catch {
        alert("Error al actualizar el dron");
      }
    }}
    className="space-y-3"
  >
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">Nombre / Modelo</label>
      <input
        required
        value={editForm.model}
        onChange={(e) => setEditForm({ ...editForm, model: e.target.value })}
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        placeholder="DJI Mini 2 — Piloto Juan"
      />
    </div>
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">Fabricante</label>
      <input
        value={editForm.manufacturer}
        onChange={(e) => setEditForm({ ...editForm, manufacturer: e.target.value })}
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
    <div className="flex justify-end gap-2 pt-2">
      <button
        type="button"
        onClick={() => setEditingDrone(null)}
        className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
      >
        Cancelar
      </button>
      <button
        type="submit"
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
      >
        Guardar
      </button>
    </div>
  </form>
</Modal>
```

- [ ] **Commit:**

```bash
git add frontend/src/app/dashboard/drones/page.tsx
git commit -m "feat: drones page — RTMP URL siempre visible, badge auto-created, modal edición"
```

---

## Task 8: PWA — manifest + service worker

**Files:**
- Create: `frontend/public/manifest.json`
- Create: `frontend/public/sw.js`
- Modify: `frontend/src/app/layout.tsx`

- [ ] **Crear `frontend/public/manifest.json`:**

```json
{
  "name": "AEROFINDER",
  "short_name": "Aerofinder",
  "description": "Sistema de búsqueda de personas desaparecidas",
  "start_url": "/app/mission",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#2563eb",
  "orientation": "portrait",
  "icons": [
    {
      "src": "/favicon.ico",
      "sizes": "any",
      "type": "image/x-icon"
    }
  ]
}
```

- [ ] **Crear `frontend/public/sw.js`:**

```javascript
// Service Worker Aerofinder — gestiona cache + push notifications

const CACHE_NAME = "aerofinder-v1";
const STATIC_ASSETS = ["/", "/app/mission", "/app/report"];

// Instalar y cachear assets estáticos
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activar y limpiar caches viejos
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: network-first para API, cache-first para assets
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith("/api") || url.port === "8000") {
    // API: siempre red
    return;
  }
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

// Push notifications
self.addEventListener("push", (event) => {
  if (!event.data) return;
  const data = event.data.json();
  const title = data.title || "AEROFINDER";
  const options = {
    body: data.body || "Nueva notificación",
    icon: "/favicon.ico",
    badge: "/favicon.ico",
    data: { url: data.url || "/app/report/result" },
    vibrate: [200, 100, 200],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Click en notificación → abrir la app
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/app/mission";
  event.waitUntil(
    clients.matchAll({ type: "window" }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(url) && "focus" in client) return client.focus();
      }
      return clients.openWindow(url);
    })
  );
});
```

- [ ] **Agregar manifest y registro del SW en `frontend/src/app/layout.tsx`:**

En el `<head>` del layout (dentro de la función o en el export `metadata`), agregar:

```tsx
// En el <html> body, ANTES del AuthProvider, agregar un script de registro:
```

Modificar el archivo para agregar el link al manifest y el script de registro:

```tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/providers/AuthProvider";
import Script from "next/script";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: "AEROFINDER",
  description: "Sistema de búsqueda de personas desaparecidas con drones e IA",
  manifest: "/manifest.json",
  themeColor: "#2563eb",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className={inter.variable}>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#2563eb" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      </head>
      <body className="min-h-screen bg-gray-50 font-sans antialiased">
        <Script id="sw-register" strategy="afterInteractive">
          {`
            if ('serviceWorker' in navigator) {
              navigator.serviceWorker.register('/sw.js').catch(console.error);
            }
          `}
        </Script>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
```

- [ ] **Commit:**

```bash
git add frontend/public/manifest.json frontend/public/sw.js frontend/src/app/layout.tsx
git commit -m "feat: PWA — manifest.json + service worker + push notification handler"
```

---

## Task 9: PWA layout y página de misión del rescatista

**Files:**
- Create: `frontend/src/app/app/layout.tsx`
- Create: `frontend/src/app/app/mission/page.tsx`

- [ ] **Crear `frontend/src/app/app/layout.tsx`** (sin sidebar, mobile-first):

```tsx
// Layout mobile-optimized para rescatistas en campo. Sin sidebar desktop.
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Aerofinder — Campo" };

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header compacto */}
      <header className="sticky top-0 z-50 flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600">
          <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </div>
        <span className="text-sm font-bold text-gray-900">AEROFINDER</span>
      </header>
      <main className="mx-auto max-w-lg p-4">{children}</main>
    </div>
  );
}
```

- [ ] **Crear `frontend/src/app/app/mission/page.tsx`:**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/store/auth";
import { missionsApi, pushApi } from "@/lib/api";
import type { Mission } from "@/lib/types";

export default function AppMissionPage() {
  const user   = useAuthStore((s) => s.user);
  const router = useRouter();
  const [mission, setMission] = useState<Mission | null>(null);
  const [loading, setLoading] = useState(true);
  const [pushEnabled, setPushEnabled] = useState(false);

  useEffect(() => {
    if (!user) { router.replace("/login"); return; }

    // Buscar misión activa asignada al usuario
    missionsApi.list()
      .then((missions) => {
        const active = missions.find((m) => m.status === "active");
        setMission(active ?? null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user, router]);

  async function enablePushNotifications() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      alert("Tu navegador no soporta notificaciones push");
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return;

      const reg = await navigator.serviceWorker.ready;
      // VAPID public key debe venir del backend (en producción) o de .env
      const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: VAPID_PUBLIC_KEY,
      });
      await pushApi.subscribe(sub.toJSON() as PushSubscriptionJSON);
      setPushEnabled(true);
    } catch (err) {
      console.error("Error activando push:", err);
    }
  }

  if (loading) {
    return <div className="flex h-48 items-center justify-center text-gray-500">Cargando…</div>;
  }

  return (
    <div className="space-y-4">
      {/* Estado push */}
      {!pushEnabled && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
          <p className="text-sm font-medium text-blue-800">Activa las notificaciones</p>
          <p className="mt-0.5 text-xs text-blue-600">
            Recibirás alertas cuando el análisis esté listo aunque la app esté en background.
          </p>
          <button
            onClick={enablePushNotifications}
            className="mt-3 w-full rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            🔔 Activar notificaciones
          </button>
        </div>
      )}

      {/* Misión activa */}
      {mission ? (
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Misión activa</p>
          <p className="mt-1 text-lg font-bold text-gray-900">{mission.name}</p>
          {mission.description && (
            <p className="mt-0.5 text-sm text-gray-500">{mission.description}</p>
          )}
          <div className="mt-4">
            <Link
              href="/app/report"
              className="block w-full rounded-xl bg-red-600 py-4 text-center text-base font-bold text-white shadow-lg hover:bg-red-700 active:scale-95 transition-transform"
            >
              🚨 Reportar persona encontrada
            </Link>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-gray-200 bg-white p-8 text-center">
          <p className="text-sm font-medium text-gray-500">Sin misión activa asignada</p>
          <p className="mt-1 text-xs text-gray-400">Contacta al administrador de operaciones</p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Commit:**

```bash
git add frontend/src/app/app/
git commit -m "feat: PWA /app/mission — vista rescatista con push notifications"
```

---

## Task 10: PWA — flujo de reporte y captura de fotos

**Files:**
- Create: `frontend/src/app/app/report/page.tsx`
- Create: `frontend/src/app/app/report/photos/page.tsx`

- [ ] **Crear `frontend/src/app/app/report/page.tsx`:**

```tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import { missionsApi, fieldReportsApi } from "@/lib/api";
import type { Mission } from "@/lib/types";

export default function AppReportPage() {
  const user   = useAuthStore((s) => s.user);
  const router = useRouter();
  const [mission,    setMission]    = useState<Mission | null>(null);
  const [notes,      setNotes]      = useState("");
  const [location,   setLocation]   = useState<{ lat: number; lon: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [waiting,    setWaiting]    = useState(false);
  const [reportId,   setReportId]   = useState<string | null>(null);
  const [status,     setStatus]     = useState<"idle" | "pending" | "approved" | "rejected">("idle");

  useEffect(() => {
    if (!user) { router.replace("/login"); return; }
    missionsApi.list()
      .then((ms) => setMission(ms.find((m) => m.status === "active") ?? null))
      .catch(() => {});

    // Obtener ubicación GPS
    navigator.geolocation?.getCurrentPosition(
      (pos) => setLocation({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => {}
    );
  }, [user, router]);

  // Escuchar aprobación/rechazo por WebSocket
  useEffect(() => {
    if (!reportId || !mission) return;
    const wsUrl = `${process.env.NEXT_PUBLIC_WS_URL}/ws/missions/${mission.id}?token=${useAuthStore.getState().accessToken}`;
    const ws = new WebSocket(wsUrl);
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.report_id !== reportId) return;
      if (msg.type === "field_report_approved") {
        setStatus("approved");
        router.push(`/app/report/photos?report_id=${reportId}&mission_id=${mission.id}`);
      }
      if (msg.type === "field_report_rejected") {
        setStatus("rejected");
        setWaiting(false);
      }
    };
    return () => ws.close();
  }, [reportId, mission, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!mission) return;
    setSubmitting(true);
    try {
      const result = await fieldReportsApi.create(mission.id, {
        notes: notes || undefined,
        location_lat: location?.lat,
        location_lon: location?.lon,
      });
      setReportId(result.id);
      setStatus("pending");
      setWaiting(true);
    } catch {
      alert("Error al enviar la solicitud. Intenta de nuevo.");
    } finally {
      setSubmitting(false);
    }
  }

  // Estado: esperando aprobación
  if (waiting && status === "pending") {
    return (
      <div className="flex flex-col items-center justify-center gap-6 py-16 text-center">
        <div className="h-16 w-16 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        <div>
          <p className="text-lg font-bold text-gray-900">Solicitud enviada</p>
          <p className="mt-1 text-sm text-gray-500">Esperando aprobación del administrador…</p>
          <p className="mt-3 text-xs text-gray-400">Mantén esta pantalla abierta</p>
        </div>
      </div>
    );
  }

  // Estado: rechazado
  if (status === "rejected") {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-lg font-bold text-red-800">Solicitud rechazada</p>
        <p className="mt-2 text-sm text-red-600">El administrador rechazó la solicitud.</p>
        <button
          onClick={() => { setStatus("idle"); setWaiting(false); setReportId(null); }}
          className="mt-4 rounded-lg bg-red-600 px-6 py-2.5 text-sm font-semibold text-white"
        >
          Intentar de nuevo
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Reportar persona encontrada</h1>
        {mission && <p className="mt-0.5 text-sm text-gray-500">Misión: {mission.name}</p>}
      </div>

      {location && (
        <div className="rounded-lg bg-green-50 px-3 py-2 text-xs text-green-700">
          📍 Ubicación capturada: {location.lat.toFixed(5)}, {location.lon.toFixed(5)}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Notas (opcional)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Descripción de la persona, lugar exacto, condición…"
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <button
          type="submit"
          disabled={submitting || !mission}
          className="w-full rounded-xl bg-red-600 py-4 text-base font-bold text-white shadow-lg hover:bg-red-700 disabled:opacity-50 active:scale-95 transition-transform"
        >
          {submitting ? "Enviando…" : "🚨 Solicitar análisis"}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Crear `frontend/src/app/app/report/photos/page.tsx`:**

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { fieldReportsApi } from "@/lib/api";

const MIN_PHOTOS = 3;
const MAX_PHOTOS = 5;

export default function AppReportPhotosPage() {
  const router       = useRouter();
  const params       = useSearchParams();
  const reportId     = params.get("report_id") ?? "";
  const missionId    = params.get("mission_id") ?? "";
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [confirmedPhotos, setConfirmedPhotos] = useState<number>(0);
  const [uploading,       setUploading]       = useState(false);
  const [analyzing,       setAnalyzing]       = useState(false);
  const [previews,        setPreviews]        = useState<string[]>([]);

  useEffect(() => {
    if (!reportId) router.replace("/app/mission");
  }, [reportId, router]);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || confirmedPhotos >= MAX_PHOTOS) return;

    setUploading(true);
    try {
      const photoIndex = confirmedPhotos + 1;

      // 1. Obtener presigned URL
      const { presigned_url, object_name } = await fieldReportsApi.getUploadUrl(reportId, photoIndex);

      // 2. Subir foto directo a MinIO
      await fetch(presigned_url, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });

      // 3. Confirmar en backend
      await fieldReportsApi.confirmPhoto(reportId, object_name);

      // 4. Actualizar UI
      const previewUrl = URL.createObjectURL(file);
      setPreviews((prev) => [...prev, previewUrl]);
      setConfirmedPhotos((n) => n + 1);
    } catch {
      alert("Error al subir la foto. Intenta de nuevo.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleAnalyze() {
    setAnalyzing(true);
    try {
      await fieldReportsApi.analyze(reportId);
      router.push(`/app/report/result?report_id=${reportId}&mission_id=${missionId}`);
    } catch {
      alert("Error al iniciar el análisis.");
      setAnalyzing(false);
    }
  }

  const canAnalyze = confirmedPhotos >= MIN_PHOTOS && !analyzing;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Toma las fotos</h1>
        <p className="mt-1 text-sm text-gray-500">
          {MIN_PHOTOS} mínimo, {MAX_PHOTOS} máximo · Distintos ángulos: frente, perfil, 3/4
        </p>
      </div>

      {/* Progreso */}
      <div className="flex items-center gap-2">
        {Array.from({ length: MAX_PHOTOS }).map((_, i) => (
          <div
            key={i}
            className={`h-2 flex-1 rounded-full transition-colors ${
              i < confirmedPhotos ? "bg-blue-600" : "bg-gray-200"
            }`}
          />
        ))}
        <span className="shrink-0 text-xs font-semibold text-gray-600">
          {confirmedPhotos}/{MAX_PHOTOS}
        </span>
      </div>

      {/* Previews */}
      {previews.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {previews.map((src, i) => (
            <div key={i} className="relative aspect-square overflow-hidden rounded-xl border border-green-200">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt={`Foto ${i + 1}`} className="h-full w-full object-cover" />
              <span className="absolute bottom-1 right-1 rounded-full bg-green-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                ✓
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Botón tomar foto */}
      {confirmedPhotos < MAX_PHOTOS && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFileChange}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="w-full rounded-xl border-2 border-dashed border-blue-300 bg-blue-50 py-8 text-center text-blue-600 hover:bg-blue-100 disabled:opacity-50"
          >
            {uploading ? (
              <span className="text-sm font-medium">Subiendo foto…</span>
            ) : (
              <div>
                <p className="text-3xl">📷</p>
                <p className="mt-2 text-sm font-semibold">
                  Foto {confirmedPhotos + 1} de {MAX_PHOTOS}
                </p>
                <p className="text-xs text-blue-400">Toca para abrir la cámara</p>
              </div>
            )}
          </button>
        </>
      )}

      {/* Instrucciones */}
      <div className="rounded-lg bg-gray-50 p-3 text-xs text-gray-500">
        <p className="font-semibold text-gray-700 mb-1">Consejos para mejor análisis:</p>
        <ul className="space-y-0.5 list-disc list-inside">
          <li>Foto de frente (rostro completo visible)</li>
          <li>Foto de perfil izquierdo</li>
          <li>Foto de perfil derecho o 3/4</li>
          <li>Buena iluminación, sin objetos tapando el rostro</li>
        </ul>
      </div>

      {/* Botón analizar */}
      <button
        onClick={handleAnalyze}
        disabled={!canAnalyze}
        className="w-full rounded-xl bg-blue-600 py-4 text-base font-bold text-white shadow-lg hover:bg-blue-700 disabled:opacity-40 active:scale-95 transition-transform"
      >
        {analyzing
          ? "Enviando para análisis…"
          : confirmedPhotos < MIN_PHOTOS
          ? `Necesitas ${MIN_PHOTOS - confirmedPhotos} foto${MIN_PHOTOS - confirmedPhotos > 1 ? "s" : ""} más`
          : `Analizar con IA (${confirmedPhotos} fotos)`}
      </button>
    </div>
  );
}
```

- [ ] **Commit:**

```bash
git add frontend/src/app/app/report/
git commit -m "feat: PWA /app/report + /app/report/photos — flujo completo de reporte de campo"
```

---

## Task 11: PWA — página de resultado

**Files:**
- Create: `frontend/src/app/app/report/result/page.tsx`

- [ ] **Crear `frontend/src/app/app/report/result/page.tsx`:**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { fieldReportsApi } from "@/lib/api";
import type { FieldReport } from "@/lib/types";

export default function AppReportResultPage() {
  const router    = useRouter();
  const params    = useSearchParams();
  const reportId  = params.get("report_id") ?? "";
  const missionId = params.get("mission_id") ?? "";

  const [report,   setReport]   = useState<FieldReport | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [polling,  setPolling]  = useState(true);

  useEffect(() => {
    if (!reportId) { router.replace("/app/mission"); return; }

    // Poll cada 3s hasta que el reporte esté completado
    const interval = setInterval(async () => {
      try {
        const r = await fieldReportsApi.get(reportId);
        setReport(r);
        if (r.status === "completed") {
          setPolling(false);
          clearInterval(interval);
        }
      } catch {
        // continuar
      } finally {
        setLoading(false);
      }
    }, 3000);

    // Primera carga inmediata
    fieldReportsApi.get(reportId)
      .then((r) => { setReport(r); if (r.status === "completed") { setPolling(false); clearInterval(interval); } })
      .catch(() => {})
      .finally(() => setLoading(false));

    return () => clearInterval(interval);
  }, [reportId, router]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        <p className="text-sm text-gray-500">Procesando análisis con IA…</p>
      </div>
    );
  }

  if (polling && report?.status !== "completed") {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-purple-600 border-t-transparent" />
        <div>
          <p className="text-base font-semibold text-gray-900">Analizando con IA</p>
          <p className="mt-1 text-sm text-gray-500">FaceNet está comparando las fotos…</p>
          <p className="mt-3 text-xs text-gray-400">Esto puede demorar hasta 30 segundos</p>
        </div>
      </div>
    );
  }

  const matches = report?.matches ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Resultado del análisis</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          {report?.photos.length ?? 0} fotos analizadas · {matches.length} coincidencias encontradas
        </p>
      </div>

      {matches.length === 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
          <p className="text-3xl mb-3">🔍</p>
          <p className="font-semibold text-amber-800">Sin coincidencias</p>
          <p className="mt-1 text-sm text-amber-600">
            Ninguna persona registrada en la misión coincide con las fotos.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {matches.map((match) => {
            const pct = (match.similarity_score * 100).toFixed(1);
            const isHigh = match.similarity_score >= 0.85;
            const isMed  = match.similarity_score >= 0.65;

            return (
              <div
                key={match.person_id}
                className={`rounded-xl border p-4 ${
                  isHigh ? "border-green-300 bg-green-50" :
                  isMed  ? "border-amber-200 bg-amber-50" :
                           "border-gray-200 bg-white"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <span className="text-xs font-bold text-gray-400">#{match.rank}</span>
                    <p className={`text-base font-bold ${isHigh ? "text-green-900" : "text-gray-900"}`}>
                      {match.person_name}
                    </p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-sm font-bold text-white ${
                    isHigh ? "bg-green-600" : isMed ? "bg-amber-500" : "bg-gray-400"
                  }`}>
                    {pct}%
                  </span>
                </div>

                {/* Barra */}
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-200">
                  <div
                    className={`h-full rounded-full ${isHigh ? "bg-green-500" : isMed ? "bg-amber-400" : "bg-gray-400"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className={`mt-1 text-xs ${isHigh ? "text-green-700 font-semibold" : "text-gray-500"}`}>
                  {isHigh ? "⚠ Alta coincidencia — reportar al equipo" :
                   isMed  ? "Posible coincidencia" : "Baja similitud"}
                </p>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <Link
          href="/app/report"
          className="flex-1 rounded-xl border border-gray-200 py-3 text-center text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          Nuevo reporte
        </Link>
        <Link
          href="/app/mission"
          className="flex-1 rounded-xl bg-blue-600 py-3 text-center text-sm font-semibold text-white hover:bg-blue-700"
        >
          Volver a misión
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Commit:**

```bash
git add frontend/src/app/app/report/result/page.tsx
git commit -m "feat: PWA /app/report/result — top-3 matches con polling hasta completado"
```

---

## Task 12: Rebuild y verificación final

- [ ] **Agregar VAPID key a `.env` (necesaria para push notifications):**

```bash
# Generar VAPID keys
cd backend && python3 -c "
from pywebpush import Vapid
v = Vapid()
v.generate_keys()
print('VAPID_PRIVATE_KEY =', v.private_key)
print('VAPID_PUBLIC_KEY  =', v.public_key)
"
```

Agregar al `.env`:
```
NEXT_PUBLIC_VAPID_PUBLIC_KEY=<clave_publica_generada>
VAPID_PRIVATE_KEY=<clave_privada_generada>
VAPID_CLAIMS_EMAIL=mailto:admin@aerofinder.local
```

- [ ] **Rebuild frontend:**

```bash
./aerofinder.sh ip $(ip route get 1.1.1.1 | awk '{for(i=1;i<=NF;i++) if($i=="src") print $(i+1)}')
```

- [ ] **Verificar PWA en Chrome Android:**

```
1. Abrir http://IP:3000/app/mission en Chrome Android
2. Menú → "Agregar a pantalla de inicio"
3. Verificar que aparece como app (sin barra de navegador)
4. Verificar pestaña Application → Manifest en DevTools
5. Verificar Service Worker registrado en Application → Service Workers
```

- [ ] **Verificar mosaico de drones:**

```
1. Abrir http://IP:3000/dashboard/missions
2. Entrar a una misión con drones asignados
3. Verificar que aparece el grid de video
4. Verificar botones 👤 y 🔍 en cada card
```

- [ ] **Verificar auto-discovery:**

```bash
curl -X POST "http://localhost:8000/drones/stream-event?serial=MINI2_TEST&event=connect"
# Abrir /dashboard/drones → verificar que aparece con badge "⚠ Sin configurar"
# Hacer clic en Editar → guardar nombre → verificar que el badge desaparece
```

- [ ] **Commit final:**

```bash
git add .
git commit -m "feat: frontend completo — mosaico multi-dron, PWA rescatista, field reports, auto-discovery"
```

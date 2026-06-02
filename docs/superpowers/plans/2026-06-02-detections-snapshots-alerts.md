# Detections Snapshots con Bboxes + Panel Alertas en Misión

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar bounding boxes en todos los snapshots (automáticos y manuales), panel de alertas en tiempo real con thumbnail + % + foto del desaparecido, y modal de confirmación al capturar snapshot en el video.

**Architecture:** El AI worker guarda el frame completo (sin dibujar). El frontend dibuja los bboxes usando `drawDetectionBox` utilitaria reutilizable. `MissionAlertCard` muestra cada alerta con thumbnail canvas, métricas y foto del desaparecido lazy-fetched desde `detectionsApi.get`.

**Tech Stack:** Next.js 14, React canvas API, TypeScript, FastAPI (Python), OpenCV (ai-worker)

---

## Archivos a tocar

| Archivo | Acción |
|---|---|
| `frontend/src/lib/drawDetectionBox.ts` | Crear — función utilitaria de dibujo reutilizable |
| `frontend/src/components/mission/DroneStreamCard.tsx` | Modificar — agregar SnapshotPreviewModal |
| `frontend/src/app/dashboard/detections/page.tsx` | Modificar — canvas con bboxes en DetectionModal |
| `frontend/src/components/mission/MissionAlertCard.tsx` | Crear — nuevo componente de alerta en misión |
| `frontend/src/app/dashboard/missions/[id]/page.tsx` | Modificar — cargar fotos desaparecido, usar MissionAlertCard, fix WS handler |
| `ai-worker/main.py` | Modificar — frame completo en lugar de crop para snapshots |

---

## Task 1: Utilidad `drawDetectionBox`

**Files:**
- Create: `frontend/src/lib/drawDetectionBox.ts`

- [ ] **Crear el archivo utilitario**

```ts
// frontend/src/lib/drawDetectionBox.ts
// Dibuja un bounding box con etiqueta sobre un CanvasRenderingContext2D.
// Reutilizado en DroneStreamCard, DetectionModal y MissionAlertCard.

export function drawDetectionBox(
  ctx: CanvasRenderingContext2D,
  bbox: { x: number; y: number; w: number; h: number },
  detectionType: string,
  confidence: number,
  similarity?: number,
): void {
  const { x, y, w, h } = bbox;
  const isFace = detectionType === "face_match" || detectionType === "face_candidate";
  const color  = isFace ? "#a855f7" : "#3b82f6";

  ctx.strokeStyle = color;
  ctx.lineWidth   = 3;
  ctx.strokeRect(x, y, w, h);

  const pct   = Math.round(((isFace ? (similarity ?? confidence) : confidence)) * 100);
  const label = detectionType === "face_match"
    ? `COINCIDENCIA ${pct}%`
    : detectionType === "face_candidate"
    ? `Cara ${pct}%`
    : `Persona ${pct}%`;

  const labelW = label.length * 7.5;
  const labelH = 20;
  ctx.fillStyle = color;
  ctx.fillRect(x, Math.max(0, y - labelH), labelW, labelH);
  ctx.fillStyle = "#ffffff";
  ctx.font      = "bold 13px monospace";
  ctx.fillText(label, x + 4, Math.max(labelH - 5, y - 5));
}
```

- [ ] **Commit**

```bash
git add frontend/src/lib/drawDetectionBox.ts
git commit -m "feat: add drawDetectionBox utility for canvas bbox rendering"
```

---

## Task 2: AI worker — snapshot frame completo

**Files:**
- Modify: `ai-worker/main.py:312-334`

Actualmente el AI worker guarda el crop (`frame[y:y+h, x:x+w]`) para ambos casos (face y silhouette). Hay que guardar el frame completo para que el frontend pueda dibujar el bbox en contexto.

- [ ] **Reemplazar crop con frame completo — bloque face (líneas ~312-321)**

Buscar:
```python
                                try:
                                    ok, buf = cv2.imencode(".jpg", crop)
                                    if ok:
                                        snapshot_b64 = base64.b64encode(
                                            buf.tobytes()
                                        ).decode("utf-8")
                                except Exception:
                                    logger.error(
                                        "Error al codificar snapshot JPEG", exc_info=True
                                    )
```

Reemplazar con:
```python
                                try:
                                    ok, buf = cv2.imencode(".jpg", frame)
                                    if ok:
                                        snapshot_b64 = base64.b64encode(
                                            buf.tobytes()
                                        ).decode("utf-8")
                                except Exception:
                                    logger.error(
                                        "Error al codificar snapshot JPEG", exc_info=True
                                    )
```

- [ ] **Reemplazar crop con frame completo — bloque person_silhouette (líneas ~324-336)**

Buscar:
```python
                    if detection_type == "person_silhouette" and snapshot_b64 is None:
                        try:
                            x, y, w, h = bbox["x"], bbox["y"], bbox["w"], bbox["h"]
                            crop = frame[
                                max(0, y): min(frame.shape[0], y + h),
                                max(0, x): min(frame.shape[1], x + w),
                            ]
                            if crop.size > 0:
                                ok, buf = cv2.imencode(".jpg", crop, [cv2.IMWRITE_JPEG_QUALITY, 70])
                                if ok:
                                    snapshot_b64 = base64.b64encode(buf.tobytes()).decode("utf-8")
                        except Exception:
                            pass  # snapshot opcional — no bloquea la detección
```

Reemplazar con:
```python
                    if detection_type == "person_silhouette" and snapshot_b64 is None:
                        try:
                            ok, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
                            if ok:
                                snapshot_b64 = base64.b64encode(buf.tobytes()).decode("utf-8")
                        except Exception:
                            pass  # snapshot opcional — no bloquea la detección
```

- [ ] **Verificar que `bbox` ya incluye `frame_w` y `frame_h`**

En `main.py`, buscar donde se construye `bbox` y confirmar que tiene:
```python
"bbox": {
    "x": int(x1), "y": int(y1),
    "w": int(x2 - x1), "h": int(y2 - y1),
    "frame_w": frame.shape[1],
    "frame_h": frame.shape[0],
}
```
Si no tiene `frame_w`/`frame_h`, agregarlos.

- [ ] **Commit**

```bash
git add ai-worker/main.py
git commit -m "fix: ai-worker saves full frame snapshot instead of crop"
```

---

## Task 3: `DroneStreamCard` — SnapshotPreviewModal

**Files:**
- Modify: `frontend/src/components/mission/DroneStreamCard.tsx`

Agregar estado `previewImage` para mostrar el canvas resultante del snapshot manual en un modal emergente.

- [ ] **Importar `drawDetectionBox` y agregar estado de preview**

Al inicio del componente `DroneStreamCard`, después de los imports existentes:
```ts
import { drawDetectionBox } from "@/lib/drawDetectionBox";
```

Dentro de la función `DroneStreamCard`, agregar junto a los otros useState:
```ts
const [previewImage, setPreviewImage] = useState<string | null>(null);
```

- [ ] **Guardar imageB64 en estado antes de llamar onCapture**

En `handleCapture`, después de la línea `const imageB64 = canvas.toDataURL("image/jpeg", 0.85);`:
```ts
      const imageB64 = canvas.toDataURL("image/jpeg", 0.85);
      setPreviewImage(imageB64);   // ← agregar esta línea
      await onCapture(drone.id, imageB64, latestDetections);
```

- [ ] **Reemplazar la lógica de dibujo en handleCapture para usar drawDetectionBox**

Reemplazar el bloque `latestDetections.forEach(...)` en `handleCapture`:
```ts
      // Dibujar cada detección
      latestDetections.forEach((det) => {
        drawDetectionBox(ctx, det.bbox, det.detection_type, det.confidence, det.similarity);
      });
```

- [ ] **Agregar el modal de preview al JSX**

Justo antes del `return` final del componente (antes del `</div>` raíz), agregar:
```tsx
      {/* Modal de confirmación de snapshot */}
      {previewImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="relative overflow-hidden rounded-xl bg-white shadow-2xl" style={{ maxWidth: 640 }}>
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
              <p className="text-sm font-semibold text-slate-800">✓ Snapshot guardado</p>
              <button
                onClick={() => setPreviewImage(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                ✕
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewImage}
              alt="Snapshot capturado"
              className="block max-h-96 w-full object-contain bg-slate-900"
            />
            <div className="flex justify-end gap-2 px-5 py-3">
              <button
                onClick={() => setPreviewImage(null)}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
```

- [ ] **Commit**

```bash
git add frontend/src/components/mission/DroneStreamCard.tsx
git commit -m "feat: snapshot preview modal in DroneStreamCard"
```

---

## Task 4: `DetectionModal` — canvas con bboxes superpuestos

**Files:**
- Modify: `frontend/src/app/dashboard/detections/page.tsx`

Reemplazar el `<img>` del snapshot en `DetectionModal` por un `<canvas>` que dibuja la imagen con el bbox encima.

- [ ] **Importar `drawDetectionBox` en detections/page.tsx**

Al principio del archivo, después de los imports de React:
```ts
import { drawDetectionBox } from "@/lib/drawDetectionBox";
```

- [ ] **Reemplazar el bloque snapshot en DetectionModal**

Buscar el bloque en `DetectionModal`:
```tsx
          {/* Snapshot */}
          {detection.snapshot_url ? (
            <div className="overflow-hidden rounded-lg bg-slate-900">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={detection.snapshot_url}
                alt="Snapshot de detección"
                className="mx-auto max-h-72 object-contain"
              />
            </div>
          ) : (
            <div className="flex h-40 items-center justify-center rounded-lg bg-slate-100 text-[12px] text-slate-400">
              Sin snapshot disponible
            </div>
          )}
```

Reemplazar con:
```tsx
          {/* Snapshot con bbox superpuesto */}
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
```

- [ ] **Agregar el componente `SnapshotCanvas` en el mismo archivo**

Antes de la función `DetectionModal`, agregar:
```tsx
// ── Canvas con snapshot + bbox superpuesto ────────────────────────────────────

function SnapshotCanvas({
  url,
  bbox,
  detectionType,
  confidence,
  similarity,
}: {
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
      <canvas
        ref={canvasRef}
        className="max-h-72 object-contain"
        style={{ maxWidth: "100%" }}
      />
    </div>
  );
}
```

- [ ] **Agregar `useRef` a los imports de React si no está**

Al inicio del archivo, asegurarse que el import de React incluye `useRef`:
```ts
import { useEffect, useRef, useState } from "react";
```

- [ ] **Commit**

```bash
git add frontend/src/app/dashboard/detections/page.tsx
git commit -m "feat: detection modal shows snapshot with bbox overlay"
```

---

## Task 5: Componente `MissionAlertCard`

**Files:**
- Create: `frontend/src/components/mission/MissionAlertCard.tsx`

Componente que muestra una alerta del panel de la misión con thumbnail canvas + %, foto del desaparecido en face_match, y botón "Ver alertas".

- [ ] **Crear el componente**

```tsx
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

// Thumbnail de 80×60 con bbox dibujado encima
function AlertThumb({
  detection,
}: {
  detection: Detection;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !detection.snapshot_url) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      // Escalar bbox al tamaño del canvas thumbnail
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
      className="shrink-0 rounded bg-slate-900 object-cover"
    />
  );
}

interface Props {
  alert: Alert;
  missingPersonPhotos: PhotoResponse[];
}

export function MissionAlertCard({ alert, missingPersonPhotos }: Props) {
  const router = useRouter();
  const [detection, setDetection] = useState<Detection | null>(null);

  // Cargar detección lazy (para obtener snapshot presigned + bounding_box)
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
    (p) => p.is_active && (p.face_angle === "front" || true)
  ) ?? missingPersonPhotos.find((p) => p.is_active) ?? null;

  return (
    <li className="rounded-md border border-slate-100 bg-slate-50 overflow-hidden">
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

        {/* Si es face_match, foto del desaparecido */}
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
              <span>YOLO: <span className="font-mono font-semibold text-slate-700">{(detection.yolo_confidence * 100).toFixed(1)}%</span></span>
              {detection.facenet_similarity > 0 && (
                <span>
                  Sim:{" "}
                  <span className={`font-mono font-semibold ${detection.facenet_similarity >= 0.7 ? "text-red-600" : "text-amber-600"}`}>
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
          className="text-[10px] font-semibold text-blue-600 hover:text-blue-800 transition-colors"
        >
          Ver en alertas →
        </button>
      </div>
    </li>
  );
}
```

- [ ] **Verificar que `detectionsApi.get` existe en `api.ts`**

En `frontend/src/lib/api.ts`, el namespace `detectionsApi` debe tener:
```ts
async get(id: string): Promise<Detection> {
  const { data } = await api.get<Detection>(`/detections/${id}`);
  return data;
},
```
Si no existe, agregarlo junto a `list` en el objeto `detectionsApi`.

- [ ] **Commit**

```bash
git add frontend/src/components/mission/MissionAlertCard.tsx frontend/src/lib/api.ts
git commit -m "feat: MissionAlertCard with thumbnail bbox, confidence %, missing person photo"
```

---

## Task 6: Página de misión — cargar fotos, usar MissionAlertCard, fix WS

**Files:**
- Modify: `frontend/src/app/dashboard/missions/[id]/page.tsx`

- [ ] **Importar MissionAlertCard y photosApi**

Agregar a los imports existentes:
```ts
import { MissionAlertCard } from "@/components/mission/MissionAlertCard";
```

En la línea de imports de API, agregar `photosApi`:
```ts
import { missionsApi, dronesApi, alertsApi, systemApi, fieldReportsApi, photosApi } from "@/lib/api";
```

- [ ] **Agregar estado de fotos del desaparecido**

Junto a los otros `useState` al inicio del componente:
```ts
const [missingPersonPhotos, setMissingPersonPhotos] = useState<import("@/lib/types").PhotoResponse[]>([]);
```

- [ ] **Cargar fotos del desaparecido en el Promise.all**

En el `Promise.all` de carga inicial, agregar como último elemento:
```ts
Promise.all([
  missionsApi.get(missionId),
  alertsApi.list(missionId),
  missionsApi.listDrones(missionId),
  dronesApi.list(),
  systemApi.getConfig("rtmp.base_url").catch(() => null),
  dronesApi.listStreams().catch(() => []),
  fieldReportsApi.listForMission(missionId).catch(() => []),
  // se resolverá después de tener la misión, pero primero cargamos el resto
])
```

Como `missing_person_id` viene de la misión cargada, hacer un segundo fetch tras resolver:
```ts
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
})
```

- [ ] **Fix WS handler — notificar inmediatamente al recibir detection**

En `handleWsMessage`, dentro del `case "detection":`, agregar un alert sintético al inicio del array `recentAlerts` con los datos del WS, antes del fetch async:

Reemplazar el bloque `case "detection":` completo:
```ts
      case "detection": {
        // Actualizar recuadros en vivo por drone
        const droneId = msg.drone_id as string | undefined;
        const bbox    = msg.bbox as { x: number; y: number; w: number; h: number } | undefined;
        if (droneId && bbox) {
          const detType   = (msg.detection_type as string) ?? "person_silhouette";
          const conf      = (msg.yolo_confidence as number) ?? (msg.confidence as number) ?? 0;
          const sim       = msg.similarity_score as number | undefined;
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
        // Refrescar lista de alertas desde backend (datos definitivos)
        alertsApi.list(missionId)
          .then((a) => setRecentAlerts(Array.isArray(a) ? a.slice(0, 10) : []))
          .catch(() => {});
        break;
      }
```

- [ ] **Reemplazar el renderizado de alertas recientes en el panel derecho**

Buscar el bloque:
```tsx
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
```

Reemplazar con:
```tsx
          {/* Alertas recientes */}
          <div className="flex-1 overflow-y-auto px-4 py-2.5">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                Alertas recientes
              </p>
              {recentAlerts.length > 0 && (
                <button
                  onClick={() => router.push("/dashboard/alerts")}
                  className="text-[10px] font-semibold text-blue-600 hover:text-blue-800 transition-colors"
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
```

- [ ] **Eliminar constantes `ALERT_LEVEL_LABEL` y `ALERT_LEVEL_COLOR` si ya no se usan en otro lugar de la página**

Buscar si `ALERT_LEVEL_LABEL` o `ALERT_LEVEL_COLOR` se usan fuera del bloque de alertas. Si no se usan, eliminarlas del archivo para limpiar.

- [ ] **Commit**

```bash
git add frontend/src/app/dashboard/missions/[id]/page.tsx
git commit -m "feat: mission panel shows MissionAlertCard with thumbnail, confidence and person photo"
```

---

## Task 7: Limpiar planes obsoletos

- [ ] **Eliminar planes completados**

```bash
cd /home/wiz/aerofinder/docs/superpowers/plans
rm 2026-05-07-backend-drone-rtmp-field-reports.md \
   2026-05-08-frontend-mosaic-pwa.md \
   2026-05-08-frontend-redesign.md \
   2026-05-11-frontend-fixes-nav-pages.md \
   2026-05-11-mobile-ui-persons-form.md \
   2026-05-22-credential-rotation.md \
   2026-05-24-auth-bugfix-sweep.md \
   2026-05-24-auth-persistence-migrations.md \
   2026-05-24-familiar-edit-photos-admin.md \
   2026-05-24-familiar-report-improvements.md \
   2026-05-24-fix-familiar-report-rls.md \
   2026-06-01-photo-validation-ocr.md
```

- [ ] **Commit**

```bash
git add -A docs/superpowers/plans/
git commit -m "chore: remove completed plan files"
```

# Spec: Snapshots con bboxes + Panel de alertas en misión

**Fecha:** 2026-06-02  
**Alcance:** AI worker, frontend misión, modal detecciones, panel alertas  

---

## Problema

1. El AI worker guarda solo el **crop** de la persona como snapshot, sin contexto del frame.
2. Los snapshots en el modal de detecciones no muestran los bounding boxes.
3. El snapshot manual en el video de misión guarda correctamente con bboxes, pero no muestra confirmación visual al usuario.
4. El panel de alertas en la misión solo muestra texto (nivel + hora) — sin thumbnail, sin %, sin foto del desaparecido.
5. Las notificaciones en vivo de siluetas/rostros en el panel tenían fallos (no se actualizaban correctamente).

---

## Decisiones de diseño

- **Opción C:** AI worker guarda el **frame completo** (sin dibujar). Frontend dibuja bboxes sobre la imagen usando `bounding_box` del schema `DetectionResponse`.
- Los bboxes se renderizan en canvas en el frontend — no en el servidor — para mantener flexibilidad visual.
- La foto del desaparecido se carga **una sola vez** al inicializar la página de misión y se cachea en estado.

---

## Sección 1 — AI Worker: frame completo en lugar de crop

**Archivo:** `ai-worker/main.py`

**Cambio:** En los dos puntos donde se codifica el snapshot JPEG, reemplazar el crop por el frame completo:

- **Face match (line ~315):** `crop = frame[y:y+h, x:x+w]` → `snapshot_frame = frame` (frame completo)
- **Person silhouette (line ~326):** igual, `crop = frame[y:y+h, ...]` → `snapshot_frame = frame`

El `bounding_box` ya contiene coordenadas absolutas del frame (`x, y, w, h, frame_w, frame_h`), así que el frontend puede dibujar exactamente donde corresponde.

**Resultado:** Snapshot guarda el frame completo con contexto visual. El bbox se renderiza en el frontend.

---

## Sección 2 — Frontend: canvas con bboxes en snapshots

### 2a. `DroneStreamCard` — modal de confirmación de snapshot

Al hacer click en "Capturar", después de guardar el snapshot:
- Mostrar un modal emergente `SnapshotPreviewModal` con:
  - La imagen resultante del canvas (frame + bboxes ya dibujados)
  - Mensaje "Snapshot guardado correctamente"
  - Botón "Cerrar"
- El modal se cierra automáticamente después de 5 segundos o con click en Cerrar.

Implementar como componente inline en `DroneStreamCard.tsx`. El `imageB64` del canvas ya existe en `handleCapture`, solo hay que mostrarlo en un modal antes de descartarlo.

### 2b. `DetectionModal` — snapshot con bboxes superpuestos

**Archivo:** `frontend/src/app/dashboard/detections/page.tsx`

Reemplazar el `<img>` del snapshot por un `<canvas>` que:
1. Carga la imagen del `detection.snapshot_url` en un `Image` object.
2. La dibuja en canvas.
3. Superpone el bbox usando `detection.bounding_box` (x, y, w, h).
4. Color: azul (`#3b82f6`) para `person_silhouette`, púrpura (`#a855f7`) para `face_candidate`/`face_match`.
5. Etiqueta sobre el bbox:
   - `face_match`: `COINCIDENCIA XX.X%` (usando `facenet_similarity`)
   - `face_candidate`: `Cara XX.X%` (usando `facenet_similarity`)
   - `person_silhouette`: `Persona XX.X%` (usando `yolo_confidence`)

Extraer la lógica de dibujo a una función `drawDetectionBox(ctx, bbox, detType, confidence, similarity)` reutilizable.

### 2c. Comparación visual face_match en modal

Si `detType === "face_match"` y hay `missing_person_id`, mostrar debajo del canvas:
- Una fila con dos imágenes: `[Snapshot con bbox]  ←→  [Foto del desaparecido]`
- Las fotos del desaparecido se cargan desde `photosApi.list(detection.missing_person_id)` al abrir el modal.

---

## Sección 3 — Panel de alertas en la misión

### 3a. Carga inicial de fotos del desaparecido

**Archivo:** `frontend/src/app/dashboard/missions/[id]/page.tsx`

En el `Promise.all` de carga inicial, agregar:
```ts
photosApi.list(mission.missing_person_id).catch(() => [])
```
Guardar en `useState<PhotoResponse[]>([])`. Solo se ejecuta si `mission.missing_person_id` existe.

### 3b. Alertas recientes — nuevo componente `MissionAlertCard`

Reemplazar el renderizado inline de alertas en el panel derecho por un componente `MissionAlertCard` que muestra:

- **Barra lateral de color** por nivel (rojo/naranja/azul).
- **Thumbnail del snapshot** si el alert tiene `detection_id`:
  - Fetch de `detectionsApi.get(alert.detection_id)` lazy (solo al renderizar).
  - Renderizado en canvas con bbox superpuesto usando `drawDetectionBox`.
  - Tamaño: 64×48px thumbnail.
- **Tipo de detección** (icono + texto):
  - 👤 Silueta detectada + `yolo_confidence`%
  - 🔍 Posible rostro + `facenet_similarity`%
  - ⚠️ Coincidencia facial + `facenet_similarity`%
- **Si es face_match:** foto del desaparecido (16×16px) + nombre al lado del thumbnail.
- **Hora relativa.**
- **Botón "Ver alertas"** → `router.push("/dashboard/alerts")`.

### 3c. Notificaciones en vivo — corrección de fallos

**Problema actual:** El WS handler en `handleWsMessage` para `detection` actualiza `recentAlerts` con `alertsApi.list()` (que es async y puede llegar tarde), pero no refleja inmediatamente los datos de la nueva detección.

**Corrección:** Al recibir `detection` por WS, agregar un alert sintético al estado `recentAlerts` inmediatamente con los datos del mensaje WS (tipo, confianza, similarity, bbox, snapshot_b64 si viene), antes de que llegue el fetch. Cuando el fetch completa, reemplazar con los datos definitivos.

El mensaje WS de detección ya incluye:
- `drone_id`, `bbox`, `detection_type`, `yolo_confidence`, `similarity_score`, `snapshot_b64`

Agregar `detection_id` al mensaje WS (el consumer ya crea la detección, solo hay que incluir el ID en el broadcast).

---

## Sección 4 — Backend: incluir detection_id en WS broadcast de detección

**Archivo:** `backend/app/services/detection_consumer.py`

En el broadcast WS del evento `detection`, agregar `detection_id` al payload para que el frontend pueda hacer fetch lazy del snapshot con bbox.

---

## Archivos modificados

| Archivo | Cambio |
|---|---|
| `ai-worker/main.py` | Snapshot = frame completo en lugar de crop |
| `backend/app/services/detection_consumer.py` | Agregar `detection_id` en WS broadcast |
| `frontend/src/app/dashboard/missions/[id]/page.tsx` | Cargar fotos desaparecido, usar MissionAlertCard, fix WS detection handler |
| `frontend/src/app/dashboard/detections/page.tsx` | Canvas con bboxes en DetectionModal, comparación face_match |
| `frontend/src/components/mission/DroneStreamCard.tsx` | SnapshotPreviewModal al capturar |
| `frontend/src/components/mission/MissionAlertCard.tsx` | Nuevo componente (thumbnail + % + foto desaparecido + link) |

---

## Función utilitaria compartida

Crear `frontend/src/lib/drawDetectionBox.ts`:
```ts
export function drawDetectionBox(
  ctx: CanvasRenderingContext2D,
  bbox: { x: number; y: number; w: number; h: number },
  detectionType: string,
  confidence: number,
  similarity?: number,
): void
```
Usada en: `DroneStreamCard`, `DetectionModal`, `MissionAlertCard`.

---

## Lo que NO cambia

- Schema `DetectionResponse` ya tiene `bounding_box` con `frame_w`/`frame_h` — no requiere migración.
- Página `/dashboard/alerts` no cambia — ya tiene el flujo correcto de confirmar/descartar.
- Página `/dashboard/detections` mantiene la tabla — solo cambia el modal interno.

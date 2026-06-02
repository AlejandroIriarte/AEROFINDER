// =============================================================================
// AEROFINDER — drawDetectionBox
// Dibuja un bounding box con etiqueta sobre un CanvasRenderingContext2D.
// Reutilizado en DroneStreamCard, DetectionModal y MissionAlertCard.
// =============================================================================

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

  const pct   = Math.round((isFace ? (similarity ?? confidence) : confidence) * 100);
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

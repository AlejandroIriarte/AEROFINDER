// =============================================================================
// AEROFINDER — DetectionRow: fila de detección con barras YOLO + FaceNet
// =============================================================================

import type { Detection } from "@/lib/types";

function ConfBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const cls = pct >= 75 ? "conf-fill-high" : pct >= 50 ? "conf-fill-mid" : "conf-fill-low";
  return (
    <span className="conf-bar">
      <span className={cls} style={{ width: `${pct}%`, display: "block" }} />
    </span>
  );
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `hace ${mins}m`;
  return `hace ${Math.floor(mins / 60)}h`;
}

interface DetectionRowProps {
  detection:   Detection;
  personName?: string;
}

export function DetectionRow({ detection, personName }: DetectionRowProps) {
  const yoloPct = Math.round(detection.yolo_confidence * 100);
  const facePct = Math.round(detection.facenet_similarity * 100);

  return (
    <div className="flex items-center gap-3 border-b border-slate-50 px-4 py-2.5 last:border-0">
      <div className="h-8 w-8 rounded-lg bg-slate-100 flex-shrink-0 flex items-center justify-center">
        <svg viewBox="0 0 24 24" className="h-4 w-4 stroke-slate-300 fill-none" strokeWidth={1.5}>
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
          <circle cx="12" cy="7" r="4"/>
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-medium text-slate-900 truncate">{personName ?? "Persona detectada"}</p>
        <div className="mt-0.5 flex items-center gap-3 text-[10px] text-slate-500">
          <span className="flex items-center gap-1">YOLO <ConfBar value={detection.yolo_confidence} /> {yoloPct}%</span>
          <span className="flex items-center gap-1">Face <ConfBar value={detection.facenet_similarity} /> {facePct}%</span>
        </div>
      </div>
      <span className="flex-shrink-0 text-[10px] text-slate-400">{formatRelative(detection.frame_timestamp)}</span>
    </div>
  );
}

// =============================================================================
// AEROFINDER — MissionRow: fila de misión con badge IA (recognition_active)
// =============================================================================

import Link from "next/link";
import type { Mission, MissionStatus } from "@/lib/types";

const STATUS_LABEL: Record<MissionStatus, string> = {
  planned:     "Planificada",
  active:      "Activa",
  paused:      "Pausada",
  completed:   "Completada",
  interrupted: "Interrumpida",
  cancelled:   "Cancelada",
};

const STATUS_CHIP: Record<MissionStatus, string> = {
  planned:     "bg-amber-100 text-amber-700",
  active:      "bg-green-100 text-green-700",
  paused:      "bg-orange-100 text-orange-700",
  completed:   "bg-blue-100  text-blue-700",
  interrupted: "bg-red-100   text-red-700",
  cancelled:   "bg-slate-100 text-slate-500",
};

const DOT_COLOR: Record<MissionStatus, string> = {
  planned:     "bg-amber-400",
  active:      "bg-green-500",
  paused:      "bg-orange-400",
  completed:   "bg-blue-400",
  interrupted: "bg-red-400",
  cancelled:   "bg-slate-300",
};

function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `hace ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  return new Date(iso).toLocaleDateString("es-BO", { day: "2-digit", month: "short" });
}

interface MissionRowProps {
  mission:     Mission;
  droneCount?: number;
}

export function MissionRow({ mission, droneCount }: MissionRowProps) {
  return (
    <Link
      href={`/dashboard/missions/${mission.id}`}
      className="flex items-center gap-3 border-b border-slate-50 px-4 py-2.5 last:border-0 hover:bg-slate-50 transition-colors"
    >
      <span className={`h-2 w-2 rounded-full flex-shrink-0 ${DOT_COLOR[mission.status]} ${mission.status === "active" ? "shadow-[0_0_0_3px_rgba(34,197,94,.2)]" : ""}`} />
      <div className="flex-1 min-w-0">
        <p className="truncate text-[12px] font-medium text-slate-900">{mission.name}</p>
        <div className="mt-0.5 flex items-center gap-3 text-[10px] text-slate-400">
          {droneCount != null && <span>{droneCount} drone{droneCount !== 1 ? "s" : ""}</span>}
          {mission.recognition_active && (
            <span className="font-semibold text-violet-600">
              ● YOLO{mission.face_recognition_active ? " + FaceNet" : ""} ON
            </span>
          )}
          <span>{formatRelative(mission.started_at ?? mission.created_at)}</span>
        </div>
      </div>
      <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_CHIP[mission.status]}`}>
        {STATUS_LABEL[mission.status]}
      </span>
    </Link>
  );
}

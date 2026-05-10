// =============================================================================
// AEROFINDER — DroneStatusRow: drone con dot animado, batería, link HLS
// =============================================================================

import type { Drone } from "@/lib/types";

interface DroneStatusRowProps {
  drone:       Drone;
  batteryPct?: number | null;
}

const STATUS_DOT: Record<string, string> = {
  available:      "bg-amber-400",
  in_mission:     "bg-green-500 drone-flying",
  maintenance:    "bg-orange-400",
  out_of_service: "bg-slate-300",
};

const STATUS_LABEL: Record<string, string> = {
  available:      "Disponible",
  in_mission:     "En misión",
  maintenance:    "Mantenimiento",
  out_of_service: "Fuera de servicio",
};

function BatteryBar({ pct }: { pct: number }) {
  const cls = pct >= 60 ? "bg-green-500" : pct >= 30 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-2 w-8 overflow-hidden rounded-sm border border-slate-200 bg-slate-100">
        <div className={`h-full rounded-sm ${cls}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-[10px] font-medium ${pct < 30 ? "text-red-600" : "text-slate-500"}`}>{pct}%</span>
    </div>
  );
}

export function DroneStatusRow({ drone, batteryPct }: DroneStatusRowProps) {
  return (
    <div className="flex items-center gap-3 border-b border-slate-50 px-4 py-2.5 last:border-0">
      <span className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${STATUS_DOT[drone.status] ?? "bg-slate-300"}`} />
      <div className="flex-1 min-w-0">
        <p className="truncate text-[12px] font-medium text-slate-900">{drone.model}</p>
        <div className="mt-0.5 flex items-center gap-2 text-[10px] text-slate-400">
          <span>{drone.serial_number}</span>
          {drone.auto_created && (
            <span className="rounded-full bg-violet-100 px-1.5 py-px text-[9px] font-semibold text-violet-600">auto</span>
          )}
          {drone.hls_url && (
            <a href={drone.hls_url} target="_blank" rel="noopener noreferrer" className="font-semibold text-blue-600 hover:underline" onClick={(e) => e.stopPropagation()}>
              ▶ HLS
            </a>
          )}
        </div>
      </div>
      <div className="flex-shrink-0">
        {batteryPct != null
          ? <BatteryBar pct={batteryPct} />
          : <span className="text-[10px] text-slate-400">{STATUS_LABEL[drone.status] ?? drone.status}</span>
        }
      </div>
    </div>
  );
}

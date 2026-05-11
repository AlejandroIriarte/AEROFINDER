// =============================================================================
// AEROFINDER — AlertRow: fila de alerta con barra lateral por content_level
// =============================================================================

import type { Alert } from "@/lib/types";

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

const STATUS_CHIP: Record<string, string> = {
  generated: "bg-red-100 text-red-700",
  sent:      "bg-blue-100 text-blue-700",
  confirmed: "bg-green-100 text-green-700",
  dismissed: "bg-slate-100 text-slate-500",
};

const STATUS_LABEL: Record<string, string> = {
  generated: "Nueva",
  sent:      "Enviada",
  confirmed: "Confirmada",
  dismissed: "Descartada",
};

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `hace ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  return new Date(iso).toLocaleDateString("es-BO", { day: "2-digit", month: "short" });
}

export function AlertRow({ alert }: { alert: Alert }) {
  return (
    <div className="flex items-start gap-3 border-b border-slate-50 px-4 py-2.5 last:border-0">
      <div className={`mt-0.5 w-1 self-stretch rounded-full flex-shrink-0 ${LEVEL_BAR[alert.content_level] ?? "bg-slate-200"}`} />
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-semibold text-slate-900">
          {LEVEL_LABEL[alert.content_level] ?? alert.content_level}
        </p>
        {alert.message_text && (
          <p className="mt-0.5 truncate text-[11px] text-slate-500">{alert.message_text}</p>
        )}
        <p className="mt-0.5 text-[10px] text-slate-400">{formatRelative(alert.generated_at)}</p>
      </div>
      <span className={`flex-shrink-0 mt-0.5 rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_CHIP[alert.status] ?? ""}`}>
        {STATUS_LABEL[alert.status] ?? alert.status}
      </span>
    </div>
  );
}

// =============================================================================
// AEROFINDER — KpiCard: ícono + valor + label + trend badge opcional
// =============================================================================

interface KpiCardProps {
  icon:       React.ReactNode;
  value:      number | string;
  label:      string;
  trend?:     string;
  trendColor?: "green" | "amber" | "slate";
  iconBg?:    "green" | "blue" | "red" | "amber" | "violet" | "slate";
}

const ICON_BG = {
  green:  "bg-green-100 text-green-600",
  blue:   "bg-blue-100  text-blue-600",
  red:    "bg-red-100   text-red-600",
  amber:  "bg-amber-100 text-amber-600",
  violet: "bg-violet-100 text-violet-600",
  slate:  "bg-slate-100 text-slate-500",
};

const TREND_COLOR = {
  green: "bg-green-100 text-green-700",
  amber: "bg-amber-100 text-amber-700",
  slate: "bg-slate-100 text-slate-500",
};

export function KpiCard({ icon, value, label, trend, trendColor = "slate", iconBg = "blue" }: KpiCardProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${ICON_BG[iconBg]}`}>
          {icon}
        </div>
        {trend && (
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${TREND_COLOR[trendColor]}`}>
            {trend}
          </span>
        )}
      </div>
      <p className="text-2xl font-extrabold text-slate-900 leading-none">{value}</p>
      <p className="mt-1 text-[11px] text-slate-500">{label}</p>
    </div>
  );
}

// =============================================================================
// AEROFINDER — FieldReportRow: field report pendiente con aprobar/rechazar
// =============================================================================

"use client";

import { useState } from "react";
import { fieldReportsApi } from "@/lib/api";
import type { FieldReport } from "@/lib/types";

interface FieldReportRowProps {
  report:     FieldReport;
  onResolved: (id: string) => void;
}

export function FieldReportRow({ report, onResolved }: FieldReportRowProps) {
  const [loading, setLoading] = useState<"approve" | "reject" | null>(null);

  const handle = async (action: "approve" | "reject") => {
    setLoading(action);
    try {
      if (action === "approve") {
        await fieldReportsApi.approve(report.id);
      } else {
        await fieldReportsApi.reject(report.id, "Rechazado desde dashboard");
      }
      onResolved(report.id);
    } catch (err) {
      console.error(`Error al ${action}:`, err);
    } finally {
      setLoading(null);
    }
  };

  const initials = report.rescuer_name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div className="flex items-center gap-3 border-b border-slate-50 px-4 py-2.5 last:border-0">
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[11px] font-bold text-indigo-600">
        {initials}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-medium text-slate-900">{report.rescuer_name}</p>
        {report.notes && (
          <p className="mt-0.5 truncate text-[11px] text-slate-500">&ldquo;{report.notes}&rdquo;</p>
        )}
        <p className="mt-0.5 text-[10px] text-slate-400">
          {report.photos.length} foto{report.photos.length !== 1 ? "s" : ""} ·{" "}
          {new Date(report.created_at).toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>
      <div className="flex flex-shrink-0 gap-1.5">
        <button
          onClick={() => handle("approve")}
          disabled={loading !== null}
          className="rounded-lg bg-green-100 px-2.5 py-1 text-[10px] font-semibold text-green-700 hover:bg-green-200 disabled:opacity-50 transition-colors"
        >
          {loading === "approve" ? "…" : "✓ Aprobar"}
        </button>
        <button
          onClick={() => handle("reject")}
          disabled={loading !== null}
          className="rounded-lg bg-red-100 px-2.5 py-1 text-[10px] font-semibold text-red-700 hover:bg-red-200 disabled:opacity-50 transition-colors"
        >
          {loading === "reject" ? "…" : "✗ Rechazar"}
        </button>
      </div>
    </div>
  );
}

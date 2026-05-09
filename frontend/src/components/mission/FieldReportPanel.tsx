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

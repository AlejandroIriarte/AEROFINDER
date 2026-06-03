// =============================================================================
// AEROFINDER Frontend — Resumen de misión completada
// Muestra estadísticas de cierre: detecciones, coincidencias, alertas, duración.
// =============================================================================
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { missionsApi, personsApi } from "@/lib/api";
import type { MissionSummary } from "@/lib/types";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

function StatCard({ label, value, sub, color }: {
  label: string;
  value: string | number;
  sub?: string;
  color: string;
}) {
  return (
    <div className={`rounded-xl border-2 p-5 text-center ${color}`}>
      <p className="text-3xl font-extrabold">{value}</p>
      <p className="mt-1 text-sm font-semibold">{label}</p>
      {sub && <p className="mt-0.5 text-xs opacity-70">{sub}</p>}
    </div>
  );
}

function fmtDuration(mins: number | null): string {
  if (mins === null) return "—";
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-BO", { dateStyle: "medium", timeStyle: "short" });
}

const PERSON_STATUS_OPTIONS = [
  { value: "found_alive",     label: "Encontrado con vida",    color: "bg-green-600 hover:bg-green-700" },
  { value: "found_deceased",  label: "Encontrado fallecido",   color: "bg-slate-600 hover:bg-slate-700" },
  { value: "archived",        label: "Archivar caso",          color: "bg-amber-600 hover:bg-amber-700" },
];

const PERSON_STATUS_LABEL: Record<string, string> = {
  pending_review: "En revisión",
  active:         "Activo",
  found_alive:    "Encontrado con vida",
  found_deceased: "Encontrado fallecido",
  false_report:   "Falsa alarma",
  archived:       "Archivado",
};

const PERSON_STATUS_COLOR: Record<string, string> = {
  active:         "bg-blue-100 text-blue-700",
  found_alive:    "bg-green-100 text-green-700",
  found_deceased: "bg-slate-100 text-slate-600",
  archived:       "bg-amber-100 text-amber-700",
  pending_review: "bg-yellow-100 text-yellow-700",
};

export default function MissionSummaryPage() {
  const params   = useParams();
  const router   = useRouter();
  const id       = params.id as string;

  const [summary, setSummary] = useState<MissionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [caseUpdating, setCaseUpdating] = useState(false);
  const [caseUpdated, setCaseUpdated]   = useState(false);

  useEffect(() => {
    missionsApi.getSummary(id)
      .then(setSummary)
      .catch(() => router.replace("/dashboard/missions"))
      .finally(() => setLoading(false));
  }, [id, router]);

  async function handleCaseOutcome(newStatus: string) {
    if (!summary?.missing_person_id || caseUpdating) return;
    setCaseUpdating(true);
    try {
      await personsApi.updateStatus(summary.missing_person_id, newStatus as never);
      setSummary((prev) => prev ? { ...prev, person_status: newStatus } : prev);
      setCaseUpdated(true);
    } catch {
      // silencioso
    } finally {
      setCaseUpdating(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (!summary) return null;

  const pendingAlerts = summary.total_detections > 0
    ? summary.total_detections - summary.confirmed_alerts - summary.dismissed_alerts
    : 0;

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      {/* Encabezado */}
      <div className="mb-8 text-center">
        <div className="mb-3 inline-flex h-16 w-16 items-center justify-center rounded-full bg-blue-100">
          <svg className="h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h1 className="text-2xl font-extrabold text-gray-900">Misión completada</h1>
        <p className="mt-1 text-lg font-semibold text-gray-700">{summary.mission_name}</p>
        {summary.person_full_name && (
          <p className="mt-0.5 text-sm text-gray-500">
            Persona buscada: <span className="font-medium text-gray-700">{summary.person_full_name}</span>
          </p>
        )}
      </div>

      {/* Fechas y duración */}
      <div className="mb-6 grid grid-cols-3 gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 text-center text-sm">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Inicio</p>
          <p className="mt-0.5 font-medium text-gray-700">{fmtDate(summary.started_at)}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Fin</p>
          <p className="mt-0.5 font-medium text-gray-700">{fmtDate(summary.completed_at)}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Duración</p>
          <p className="mt-0.5 font-bold text-gray-900">{fmtDuration(summary.duration_minutes)}</p>
        </div>
      </div>

      {/* Stats grid */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard
          label="Detecciones totales"
          value={summary.total_detections}
          color="border-blue-200 bg-blue-50 text-blue-800"
        />
        <StatCard
          label="Coincidencias faciales"
          value={summary.face_matches}
          color="border-purple-200 bg-purple-50 text-purple-800"
        />
        <StatCard
          label="Drones utilizados"
          value={summary.drones_used}
          color="border-gray-200 bg-gray-50 text-gray-700"
        />
        <StatCard
          label="Alertas confirmadas"
          value={summary.confirmed_alerts}
          color="border-green-200 bg-green-50 text-green-800"
        />
        <StatCard
          label="Falsas alarmas"
          value={summary.dismissed_alerts}
          color="border-red-100 bg-red-50 text-red-700"
        />
        <StatCard
          label="Alertas pendientes"
          value={pendingAlerts}
          sub={pendingAlerts > 0 ? "Requieren revisión" : undefined}
          color={pendingAlerts > 0
            ? "border-amber-300 bg-amber-50 text-amber-800"
            : "border-gray-200 bg-gray-50 text-gray-500"}
        />
      </div>

      {/* Cierre del caso */}
      {summary.missing_person_id && (
        <div className="mb-6 rounded-xl border-2 border-slate-200 bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[13px] font-semibold text-slate-800">Estado del caso</p>
            {summary.person_status && (
              <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${PERSON_STATUS_COLOR[summary.person_status] ?? "bg-slate-100 text-slate-600"}`}>
                {PERSON_STATUS_LABEL[summary.person_status] ?? summary.person_status}
              </span>
            )}
          </div>

          {caseUpdated ? (
            <div className="flex items-center gap-2 rounded-lg bg-green-50 px-4 py-3 text-[13px] font-semibold text-green-700">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              Caso actualizado correctamente
            </div>
          ) : ["found_alive", "found_deceased", "archived"].includes(summary.person_status ?? "") ? (
            <p className="text-[12px] text-slate-500">El caso ya fue cerrado con el estado actual.</p>
          ) : (
            <>
              <p className="mb-3 text-[12px] text-slate-500">
                Seleccioná el resultado de la búsqueda para cerrar el caso y notificar al familiar.
              </p>
              <div className="flex flex-wrap gap-2">
                {PERSON_STATUS_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => handleCaseOutcome(opt.value)}
                    disabled={caseUpdating}
                    className={`rounded-xl px-4 py-2 text-[12px] font-semibold text-white transition-colors disabled:opacity-50 ${opt.color}`}
                  >
                    {caseUpdating ? "Guardando…" : opt.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Aviso familiares */}
      <div className="mb-6 flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4">
        <svg className="mt-0.5 h-5 w-5 shrink-0 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-sm text-blue-800">
          Los familiares vinculados a la persona buscada han sido notificados automáticamente sobre el cierre de la misión.
        </p>
      </div>

      {/* Acciones */}
      <div className="flex flex-col gap-3 sm:flex-row">
        {pendingAlerts > 0 && (
          <button
            onClick={() => router.push("/dashboard/alerts")}
            className="flex-1 rounded-xl bg-amber-500 px-6 py-3 font-semibold text-white hover:bg-amber-600 transition-colors"
          >
            Revisar {pendingAlerts} alerta{pendingAlerts > 1 ? "s" : ""} pendiente{pendingAlerts > 1 ? "s" : ""}
          </button>
        )}
        <button
          onClick={() => router.push("/dashboard/alerts")}
          className="flex-1 rounded-xl border border-gray-300 bg-white px-6 py-3 font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Ver alertas
        </button>
        <button
          onClick={() => router.push("/dashboard/missions")}
          className="flex-1 rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-700 transition-colors"
        >
          Volver a misiones
        </button>
      </div>
    </div>
  );
}

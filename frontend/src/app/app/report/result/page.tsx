"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { fieldReportsApi } from "@/lib/api";
import type { FieldReport } from "@/lib/types";

export default function AppReportResultPage() {
  const router    = useRouter();
  const params    = useSearchParams();
  const reportId  = params.get("report_id") ?? "";
  const missionId = params.get("mission_id") ?? "";

  const [report,  setReport]  = useState<FieldReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState(true);

  useEffect(() => {
    if (!reportId) { router.replace("/app/mission"); return; }

    // Poll cada 3s hasta que el reporte esté completado
    const interval = setInterval(async () => {
      try {
        const r = await fieldReportsApi.get(reportId);
        setReport(r);
        if (r.status === "completed") {
          setPolling(false);
          clearInterval(interval);
        }
      } catch {
        // continuar
      }
    }, 3000);

    // Primera carga inmediata
    fieldReportsApi.get(reportId)
      .then((r) => {
        setReport(r);
        if (r.status === "completed") {
          setPolling(false);
          clearInterval(interval);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    return () => clearInterval(interval);
  }, [reportId, router]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        <p className="text-sm text-gray-500">Procesando análisis con IA…</p>
      </div>
    );
  }

  if (polling && report?.status !== "completed") {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-purple-600 border-t-transparent" />
        <div>
          <p className="text-base font-semibold text-gray-900">Analizando con IA</p>
          <p className="mt-1 text-sm text-gray-500">FaceNet está comparando las fotos…</p>
          <p className="mt-3 text-xs text-gray-400">Esto puede demorar hasta 30 segundos</p>
        </div>
      </div>
    );
  }

  const matches = report?.matches ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Resultado del análisis</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          {report?.photos.length ?? 0} fotos analizadas · {matches.length} coincidencias encontradas
        </p>
      </div>

      {matches.length === 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
          <p className="text-3xl mb-3">🔍</p>
          <p className="font-semibold text-amber-800">Sin coincidencias</p>
          <p className="mt-1 text-sm text-amber-600">
            Ninguna persona registrada en la misión coincide con las fotos.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {matches.map((match) => {
            const pct = (match.similarity_score * 100).toFixed(1);
            const isHigh = match.similarity_score >= 0.85;
            const isMed  = match.similarity_score >= 0.65;

            return (
              <div
                key={match.person_id}
                className={`rounded-xl border p-4 ${
                  isHigh ? "border-green-300 bg-green-50" :
                  isMed  ? "border-amber-200 bg-amber-50" :
                           "border-gray-200 bg-white"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <span className="text-xs font-bold text-gray-400">#{match.rank}</span>
                    <p className={`text-base font-bold ${isHigh ? "text-green-900" : "text-gray-900"}`}>
                      {match.person_name}
                    </p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-sm font-bold text-white ${
                    isHigh ? "bg-green-600" : isMed ? "bg-amber-500" : "bg-gray-400"
                  }`}>
                    {pct}%
                  </span>
                </div>

                {/* Barra de similitud */}
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-200">
                  <div
                    className={`h-full rounded-full ${isHigh ? "bg-green-500" : isMed ? "bg-amber-400" : "bg-gray-400"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className={`mt-1 text-xs ${isHigh ? "text-green-700 font-semibold" : "text-gray-500"}`}>
                  {isHigh ? "⚠ Alta coincidencia — reportar al equipo" :
                   isMed  ? "Posible coincidencia" : "Baja similitud"}
                </p>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <Link
          href="/app/report"
          className="flex-1 rounded-xl border border-gray-200 py-3 text-center text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          Nuevo reporte
        </Link>
        <Link
          href="/app/mission"
          className="flex-1 rounded-xl bg-blue-600 py-3 text-center text-sm font-semibold text-white hover:bg-blue-700"
        >
          Volver a misión
        </Link>
      </div>
    </div>
  );
}

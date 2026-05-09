// =============================================================================
// AEROFINDER Frontend — FieldReportResultModal
// Muestra top-3 coincidencias del análisis FaceNet con barras de similitud.
// =============================================================================

"use client";

import type { FieldReport } from "@/lib/types";
import { Modal } from "@/components/ui/Modal";

interface Props {
  report: FieldReport | null;
  onClose: () => void;
}

function similarityColor(score: number): string {
  if (score >= 0.85) return "bg-green-500";
  if (score >= 0.65) return "bg-amber-500";
  return "bg-red-400";
}

function similarityLabel(score: number): string {
  if (score >= 0.85) return "Alta coincidencia";
  if (score >= 0.65) return "Posible coincidencia";
  return "Baja similitud";
}

export function FieldReportResultModal({ report, onClose }: Props) {
  if (!report) return null;

  return (
    <Modal open={!!report} title="Resultado del análisis" onClose={onClose}>
      <div className="space-y-4">
        {/* Info del reporte */}
        <div className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
          <p><span className="font-medium">Rescatista:</span> {report.rescuer_name}</p>
          <p><span className="font-medium">Fotos analizadas:</span> {report.photos.length}</p>
          {report.completed_at && (
            <p><span className="font-medium">Completado:</span>{" "}
              {new Date(report.completed_at).toLocaleString("es-BO", { dateStyle: "short", timeStyle: "short" })}
            </p>
          )}
        </div>

        {/* Sin resultados */}
        {report.matches.length === 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-center">
            <p className="text-sm font-medium text-amber-800">Sin coincidencias encontradas</p>
            <p className="mt-1 text-xs text-amber-600">
              Ninguna persona de la misión coincide con las fotos enviadas.
            </p>
          </div>
        )}

        {/* Top matches */}
        {report.matches.map((match) => (
          <div key={match.person_id} className="rounded-lg border border-gray-200 bg-white p-3">
            <div className="mb-2 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-gray-500">#{match.rank}</span>
                <p className="text-sm font-semibold text-gray-900">{match.person_name}</p>
              </div>
              <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-white ${
                match.similarity_score >= 0.85 ? "bg-green-600" :
                match.similarity_score >= 0.65 ? "bg-amber-500" : "bg-red-400"
              }`}>
                {(match.similarity_score * 100).toFixed(1)}%
              </span>
            </div>

            {/* Barra de similitud */}
            <div className="mb-1.5 h-2 w-full overflow-hidden rounded-full bg-gray-100">
              <div
                className={`h-full rounded-full transition-all ${similarityColor(match.similarity_score)}`}
                style={{ width: `${(match.similarity_score * 100).toFixed(1)}%` }}
              />
            </div>
            <p className="text-[10px] text-gray-500">{similarityLabel(match.similarity_score)}</p>
          </div>
        ))}

        <button
          onClick={onClose}
          className="w-full rounded-lg bg-gray-100 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-200"
        >
          Cerrar
        </button>
      </div>
    </Modal>
  );
}

// =============================================================================
// AEROFINDER Frontend — Lista de detecciones con filtros
// Tabla paginada con filtros por misión, tipo, estado de revisión.
// Acceso: admin, buscador, ayudante (GPS oculto para ayudante via backend)
// =============================================================================

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import { detectionsApi, missionsApi } from "@/lib/api";
import type { Detection, Mission } from "@/lib/types";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";

const TYPE_LABEL: Record<string, string> = {
  person_silhouette: "Silueta",
  face_candidate:    "Posible rostro",
  face_match:        "Coincidencia facial",
};

const TYPE_COLOR: Record<string, string> = {
  person_silhouette: "bg-blue-100 text-blue-700",
  face_candidate:    "bg-amber-100 text-amber-700",
  face_match:        "bg-red-100 text-red-700",
};

type ReviewFilter = "all" | "reviewed" | "pending";

export default function DetectionsPage() {
  const router = useRouter();
  const user   = useAuthStore((s) => s.user);

  const [detections, setDetections] = useState<Detection[]>([]);
  const [missions, setMissions]     = useState<Mission[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);

  // Filtros
  const [missionFilter, setMissionFilter] = useState<string>("all");
  const [reviewFilter, setReviewFilter]   = useState<ReviewFilter>("all");
  const [page, setPage]                   = useState(0);
  const pageSize = 20;

  // Cargar misiones para el selector
  useEffect(() => {
    missionsApi.list().then(setMissions).catch(() => {});
  }, []);

  // Cargar detecciones con filtros
  useEffect(() => {
    setLoading(true);
    setError(null);

    const params: Record<string, unknown> = {
      skip: page * pageSize,
      limit: pageSize,
    };
    if (missionFilter !== "all") params.mission_id = missionFilter;
    if (reviewFilter === "reviewed") params.is_reviewed = true;
    if (reviewFilter === "pending") params.is_reviewed = false;

    detectionsApi
      .list(params as Parameters<typeof detectionsApi.list>[0])
      .then(setDetections)
      .catch(() => setError("Error al cargar detecciones"))
      .finally(() => setLoading(false));
  }, [missionFilter, reviewFilter, page]);

  const canSeeGPS = user?.role === "admin" || user?.role === "buscador";

  // Inferir tipo de detección basado en similitud
  function getDetectionType(det: Detection): string {
    if (det.facenet_similarity >= 0.7) return "face_match";
    if (det.facenet_similarity > 0) return "face_candidate";
    return "person_silhouette";
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Detecciones"
        description="Historial de detecciones de personas por IA"
      />

      <div className="flex-1 overflow-auto p-6">
        {/* Filtros */}
        <div className="mb-4 flex flex-wrap gap-3">
          <select
            value={missionFilter}
            onChange={(e) => { setMissionFilter(e.target.value); setPage(0); }}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">Todas las misiones</option>
            {missions.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>

          <div className="flex gap-1">
            {(["all", "pending", "reviewed"] as ReviewFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => { setReviewFilter(f); setPage(0); }}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  reviewFilter === f
                    ? "bg-blue-600 text-white"
                    : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                {f === "all" ? "Todas" : f === "pending" ? "Sin revisar" : "Revisadas"}
              </button>
            ))}
          </div>
        </div>

        {loading && <LoadingSpinner />}

        {!loading && error && (
          <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</div>
        )}

        {!loading && !error && detections.length === 0 && (
          <EmptyState
            title="Sin detecciones"
            description="No hay detecciones que coincidan con los filtros seleccionados."
          />
        )}

        {!loading && !error && detections.length > 0 && (
          <>
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-left">
                    <th className="px-4 py-3 font-semibold text-gray-600">Tipo</th>
                    <th className="px-4 py-3 font-semibold text-gray-600">Confianza</th>
                    <th className="px-4 py-3 font-semibold text-gray-600">Similitud</th>
                    {canSeeGPS && (
                      <th className="px-4 py-3 font-semibold text-gray-600">GPS</th>
                    )}
                    <th className="px-4 py-3 font-semibold text-gray-600">Snapshot</th>
                    <th className="px-4 py-3 font-semibold text-gray-600">Estado</th>
                    <th className="px-4 py-3 font-semibold text-gray-600">Fecha</th>
                    <th className="px-4 py-3 font-semibold text-gray-600">Misión</th>
                  </tr>
                </thead>
                <tbody>
                  {detections.map((det) => {
                    const detType = getDetectionType(det);
                    return (
                      <tr
                        key={det.id}
                        className="border-b border-gray-50 transition-colors hover:bg-gray-50"
                      >
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${TYPE_COLOR[detType] ?? "bg-gray-100 text-gray-600"}`}>
                            {TYPE_LABEL[detType] ?? detType}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-700">
                          {(det.yolo_confidence * 100).toFixed(1)}%
                        </td>
                        <td className="px-4 py-3">
                          {det.facenet_similarity > 0 ? (
                            <span className={`font-mono text-xs font-semibold ${
                              det.facenet_similarity >= 0.7 ? "text-red-600" : "text-amber-600"
                            }`}>
                              {(det.facenet_similarity * 100).toFixed(1)}%
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>
                        {canSeeGPS && (
                          <td className="px-4 py-3">
                            {det.gps_latitude && det.gps_longitude ? (
                              <span className="font-mono text-[10px] text-gray-500">
                                {det.gps_latitude.toFixed(5)}, {det.gps_longitude.toFixed(5)}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-400">—</span>
                            )}
                          </td>
                        )}
                        <td className="px-4 py-3">
                          {det.snapshot_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={det.snapshot_url}
                              alt="Snapshot"
                              className="h-10 w-10 rounded object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {det.is_reviewed ? (
                            <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                              Revisada
                            </span>
                          ) : (
                            <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700">
                              Pendiente
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">
                          {new Date(det.created_at).toLocaleString("es-BO", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => router.push(`/dashboard/missions/${det.mission_id}`)}
                            className="text-xs font-medium text-blue-600 hover:text-blue-800"
                          >
                            Ver misión
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Paginación */}
            <div className="mt-4 flex items-center justify-between">
              <p className="text-xs text-gray-500">
                Mostrando {detections.length} detecciones (página {page + 1})
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(Math.max(0, page - 1))}
                  disabled={page === 0}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                >
                  Anterior
                </button>
                <button
                  onClick={() => setPage(page + 1)}
                  disabled={detections.length < pageSize}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                >
                  Siguiente
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

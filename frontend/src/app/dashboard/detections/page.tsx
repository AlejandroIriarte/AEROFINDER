// =============================================================================
// AEROFINDER Frontend — Lista de detecciones con filtros + modal de detalle
// Tabla paginada con filtros por misión, tipo, estado de revisión.
// Acceso: admin, buscador, ayudante (GPS oculto para ayudante via backend)
// =============================================================================

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import { detectionsApi, missionsApi } from "@/lib/api";
import type { Detection, DetectionReview, DetectionVerdict, Mission } from "@/lib/types";
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

const VERDICT_LABEL: Record<DetectionVerdict, string> = {
  confirmed:      "Confirmada",
  false_positive: "Falso positivo",
  uncertain:      "Incierto",
};

const VERDICT_COLOR: Record<DetectionVerdict, string> = {
  confirmed:      "bg-green-100 text-green-700",
  false_positive: "bg-red-100 text-red-700",
  uncertain:      "bg-yellow-100 text-yellow-700",
};

type ReviewFilter = "all" | "reviewed" | "pending";

// ── Modal de detalle ──────────────────────────────────────────────────────────

function DetectionModal({
  detection,
  canReview,
  onClose,
  onReviewed,
}: {
  detection: Detection;
  canReview: boolean;
  onClose: () => void;
  onReviewed: (id: string) => void;
}) {
  const [reviews, setReviews]       = useState<DetectionReview[]>([]);
  const [loadingReviews, setLR]     = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [verdict, setVerdict]       = useState<DetectionVerdict>("confirmed");
  const [notes, setNotes]           = useState("");
  const [error, setError]           = useState<string | null>(null);

  useEffect(() => {
    detectionsApi.listReviews(detection.id)
      .then(setReviews)
      .catch(() => {})
      .finally(() => setLR(false));
  }, [detection.id]);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const rev = await detectionsApi.submitReview(detection.id, verdict, notes || undefined);
      setReviews((prev) => [rev, ...prev]);
      onReviewed(detection.id);
    } catch {
      setError("Error al guardar la revisión");
    } finally {
      setSubmitting(false);
    }
  }

  function getDetectionType(det: Detection): string {
    if (det.facenet_similarity >= 0.7) return "face_match";
    if (det.facenet_similarity > 0)    return "face_candidate";
    return "person_silhouette";
  }

  const detType = getDetectionType(detection);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="relative w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-2xl" style={{ maxHeight: "90vh" }}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div className="flex items-center gap-3">
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${TYPE_COLOR[detType]}`}>
              {TYPE_LABEL[detType]}
            </span>
            <span className="text-sm text-gray-500">
              {new Date(detection.created_at).toLocaleString("es-BO")}
            </span>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Snapshot */}
          {detection.snapshot_url ? (
            <div className="overflow-hidden rounded-lg bg-gray-900">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={detection.snapshot_url}
                alt="Snapshot de detección"
                className="mx-auto max-h-72 object-contain"
              />
            </div>
          ) : (
            <div className="flex h-40 items-center justify-center rounded-lg bg-gray-100 text-sm text-gray-400">
              Sin snapshot disponible
            </div>
          )}

          {/* Métricas */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-lg bg-gray-50 p-3 text-center">
              <p className="text-xs text-gray-500">Confianza YOLO</p>
              <p className="mt-1 text-lg font-bold text-gray-800">
                {(detection.yolo_confidence * 100).toFixed(1)}%
              </p>
            </div>
            <div className="rounded-lg bg-gray-50 p-3 text-center">
              <p className="text-xs text-gray-500">Similitud FaceNet</p>
              <p className={`mt-1 text-lg font-bold ${
                detection.facenet_similarity >= 0.7 ? "text-red-600"
                : detection.facenet_similarity > 0  ? "text-amber-600"
                : "text-gray-400"
              }`}>
                {detection.facenet_similarity > 0
                  ? `${(detection.facenet_similarity * 100).toFixed(1)}%`
                  : "—"}
              </p>
            </div>
            {detection.gps_latitude && detection.gps_longitude ? (
              <div className="col-span-2 rounded-lg bg-gray-50 p-3 text-center">
                <p className="text-xs text-gray-500">Coordenadas GPS</p>
                <p className="mt-1 font-mono text-sm font-semibold text-gray-700">
                  {detection.gps_latitude.toFixed(6)}, {detection.gps_longitude.toFixed(6)}
                </p>
              </div>
            ) : null}
          </div>

          {/* Bounding box */}
          <div className="rounded-lg bg-gray-50 p-3">
            <p className="mb-1 text-xs font-medium text-gray-500">Bounding box (px)</p>
            <p className="font-mono text-xs text-gray-600">
              x={detection.bounding_box.x} y={detection.bounding_box.y}{" "}
              w={detection.bounding_box.w} h={detection.bounding_box.h}{" "}
              (frame {detection.bounding_box.frame_w}×{detection.bounding_box.frame_h})
            </p>
          </div>

          {/* Historial de revisiones */}
          <div>
            <p className="mb-2 text-sm font-semibold text-gray-700">
              Revisiones ({loadingReviews ? "…" : reviews.length})
            </p>
            {loadingReviews ? (
              <LoadingSpinner />
            ) : reviews.length === 0 ? (
              <p className="text-xs text-gray-400">Sin revisiones aún</p>
            ) : (
              <div className="space-y-2">
                {reviews.map((r) => (
                  <div key={r.id} className="flex items-start gap-3 rounded-lg border border-gray-100 p-3">
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${VERDICT_COLOR[r.verdict]}`}>
                      {VERDICT_LABEL[r.verdict]}
                    </span>
                    <div className="min-w-0">
                      {r.notes && <p className="text-xs text-gray-600">{r.notes}</p>}
                      <p className="mt-0.5 text-[10px] text-gray-400">
                        {new Date(r.reviewed_at).toLocaleString("es-BO")}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Formulario de revisión (solo admin/buscador) */}
          {canReview && !detection.is_reviewed && (
            <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
              <p className="mb-3 text-sm font-semibold text-blue-800">Agregar revisión</p>
              <div className="space-y-3">
                <div className="flex gap-2">
                  {(["confirmed", "uncertain", "false_positive"] as DetectionVerdict[]).map((v) => (
                    <button
                      key={v}
                      onClick={() => setVerdict(v)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                        verdict === v
                          ? VERDICT_COLOR[v].replace("100", "600").replace("700", "white") + " ring-2 ring-offset-1"
                          : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      {VERDICT_LABEL[v]}
                    </button>
                  ))}
                </div>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Notas (opcional)"
                  rows={2}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {error && <p className="text-xs text-red-600">{error}</p>}
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {submitting ? "Guardando…" : "Guardar revisión"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function DetectionsPage() {
  const router = useRouter();
  const user   = useAuthStore((s) => s.user);

  const [detections, setDetections]   = useState<Detection[]>([]);
  const [missions, setMissions]       = useState<Mission[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [selected, setSelected]       = useState<Detection | null>(null);

  // Filtros
  const [missionFilter, setMissionFilter] = useState<string>("all");
  const [reviewFilter, setReviewFilter]   = useState<ReviewFilter>("all");
  const [page, setPage]                   = useState(0);
  const pageSize = 20;

  const canReview = user?.role === "admin" || user?.role === "buscador";
  const canSeeGPS = user?.role === "admin" || user?.role === "buscador";

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

  function getDetectionType(det: Detection): string {
    if (det.facenet_similarity >= 0.7) return "face_match";
    if (det.facenet_similarity > 0)    return "face_candidate";
    return "person_silhouette";
  }

  function handleReviewed(detectionId: string) {
    setDetections((prev) =>
      prev.map((d) => d.id === detectionId ? { ...d, is_reviewed: true } : d)
    );
    if (selected?.id === detectionId) {
      setSelected((s) => s ? { ...s, is_reviewed: true } : s);
    }
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
                    <th className="px-4 py-3 font-semibold text-gray-600">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {detections.map((det) => {
                    const detType = getDetectionType(det);
                    return (
                      <tr
                        key={det.id}
                        className="cursor-pointer border-b border-gray-50 transition-colors hover:bg-blue-50"
                        onClick={() => setSelected(det)}
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
                            onClick={(e) => { e.stopPropagation(); router.push(`/dashboard/missions/${det.mission_id}`); }}
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

      {/* Modal de detalle */}
      {selected && (
        <DetectionModal
          detection={selected}
          canReview={canReview}
          onClose={() => setSelected(null)}
          onReviewed={handleReviewed}
        />
      )}
    </div>
  );
}

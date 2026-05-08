"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useAuthStore } from "@/store/auth";
import { Toast } from "@/components/ui/Toast";
import { personsApi, photosApi } from "@/lib/api";
import type { MissingPerson } from "@/lib/types";

export default function PendingReviewPage() {
  const { accessToken } = useAuthStore();
  const [cases, setCases] = useState<MissingPerson[]>([]);
  const [photoCounts, setPhotoCounts] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [toastMessage, setToastMessage] = useState("");
  const [toastType, setToastType] = useState<"success" | "error">("success");
  const [showToast, setShowToast] = useState(false);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [showRejectModal, setShowRejectModal] = useState(false);

  // Cargar casos pendientes
  const fetchPendingCases = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await personsApi.listPending();
      setCases(data);

      // Cargar conteo de fotos en paralelo para cada caso
      const counts = await Promise.all(
        data.map(async (p) => {
          try {
            const photos = await photosApi.list(p.id);
            return { id: p.id, count: photos.length };
          } catch {
            return { id: p.id, count: 0 };
          }
        })
      );
      setPhotoCounts(Object.fromEntries(counts.map((c) => [c.id, c.count])));
    } catch (error) {
      console.error("Error fetching pending cases:", error);
      setToastMessage("Error al cargar los casos pendientes");
      setToastType("error");
      setShowToast(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (accessToken) {
      fetchPendingCases();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  // Aprobar caso
  const handleApprove = async (personId: string) => {
    try {
      await personsApi.updateStatus(personId, "active");

      setToastMessage("Caso aprobado exitosamente");
      setToastType("success");
      setShowToast(true);

      // Recargar casos
      await fetchPendingCases();
    } catch (error) {
      console.error("Error approving case:", error);
      setToastMessage("Error al aprobar el caso");
      setToastType("error");
      setShowToast(true);
    }
  };

  // Rechazar caso
  const handleRejectConfirm = async () => {
    if (!rejectingId) return;

    try {
      await personsApi.updateStatus(rejectingId, "false_report");

      setToastMessage("Caso rechazado");
      setToastType("success");
      setShowToast(true);
      setShowRejectModal(false);
      setRejectingId(null);

      // Recargar casos
      await fetchPendingCases();
    } catch (error) {
      console.error("Error rejecting case:", error);
      setToastMessage("Error al rechazar el caso");
      setToastType("error");
      setShowToast(true);
    }
  };

  return (
    <div className="space-y-6 p-6">
      {showToast && (
        <Toast
          type={toastType}
          title={toastType === "success" ? "Éxito" : "Error"}
          message={toastMessage}
          onClose={() => setShowToast(false)}
        />
      )}

      {/* Modal de rechazo */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              Rechazar Caso
            </h2>
            <p className="text-gray-600 mb-4">
              ¿Está seguro que desea rechazar este caso?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowRejectModal(false);
                  setRejectingId(null);
                }}
                className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-50 transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleRejectConfirm}
                className="flex-1 bg-red-600 text-white py-2 rounded-lg hover:bg-red-700 transition"
              >
                Rechazar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">
          Revisión de Casos Pendientes
        </h1>
        <p className="text-gray-600 mt-2">
          Revisa y aprueba nuevos casos reportados por familias
        </p>
      </div>

      {/* Stats */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-gray-600 text-sm font-medium">Casos Pendientes</p>
            <p className="text-4xl font-bold text-gray-900 mt-1">{cases.length}</p>
          </div>
          <svg
            className="h-12 w-12 text-yellow-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
      </div>

      {/* Tabla de casos */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-500">
            <p>Cargando casos pendientes...</p>
          </div>
        ) : cases.length === 0 ? (
          <div className="p-8 text-center">
            <svg
              className="h-12 w-12 mx-auto text-gray-400 mb-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"
              />
            </svg>
            <p className="text-gray-600 font-medium">No hay casos pendientes de revisión</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                    Nombre
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                    Edad
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                    Género
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                    Última Ubicación
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                    Fotos
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                    Reportado
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody>
                {cases.map((person) => (
                  <tr
                    key={person.id}
                    className="border-b border-gray-200 hover:bg-gray-50 transition"
                  >
                    <td className="px-6 py-4 font-medium text-gray-900">
                      {person.full_name}
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {person.age_at_disappearance || "—"}
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {person.gender || "—"}
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {person.last_known_location || "—"}
                    </td>
                    <td className="px-6 py-4">
                      {photoCounts[person.id] === undefined ? (
                        <span className="text-xs text-gray-400">…</span>
                      ) : photoCounts[person.id] === 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                          Sin fotos
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
                          {photoCounts[person.id]} foto{photoCounts[person.id] !== 1 ? "s" : ""}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {new Date(person.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 space-y-2 flex flex-col">
                      <button
                        onClick={() => handleApprove(person.id)}
                        className="inline-flex items-center justify-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition text-sm font-medium"
                      >
                        <svg
                          className="h-4 w-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                        Aprobar
                      </button>
                      <button
                        onClick={() => {
                          setRejectingId(person.id);
                          setShowRejectModal(true);
                        }}
                        className="inline-flex items-center justify-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition text-sm font-medium"
                      >
                        <svg
                          className="h-4 w-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                        Rechazar
                      </button>
                      <Link
                        href={`/dashboard/persons/${person.id}`}
                        className="inline-flex items-center justify-center gap-2 border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 transition text-sm font-medium"
                      >
                        <svg
                          className="h-4 w-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                          />
                        </svg>
                        Ver detalles
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {cases.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex gap-3">
            <svg
              className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M18 5v8a2 2 0 01-2 2h-5l-5 4v-4H4a2 2 0 01-2-2V5a2 2 0 012-2h12a2 2 0 012 2zm-11-1a1 1 0 11-2 0 1 1 0 012 0z"
                clipRule="evenodd"
              />
            </svg>
            <div>
              <h3 className="font-semibold text-blue-900">Información importante</h3>
              <p className="text-sm text-blue-700 mt-1">
                Revisa cuidadosamente cada reporte. Solo apropia información verificable y
                completa. Los casos rechazados se archivarán automáticamente.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

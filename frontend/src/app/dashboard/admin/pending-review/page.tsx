"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useAuthStore } from "@/store/auth";
import { Toast } from "@/components/ui/Toast";
import { personsApi, photosApi } from "@/lib/api";
import type { MissingPerson } from "@/lib/types";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

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
      await fetchPendingCases();
    } catch (error) {
      console.error("Error approving case:", error);
      setToastMessage("Error al aprobar el caso");
      setToastType("error");
      setShowToast(true);
    }
  };

  // Solicitar fotos adicionales al familiar
  const handleRequestPhotos = async (personId: string) => {
    try {
      await personsApi.requestMorePhotos(personId);
      setToastMessage("Solicitud de fotos enviada al familiar");
      setToastType("success");
      setShowToast(true);
    } catch (error) {
      console.error("Error al solicitar fotos:", error);
      setToastMessage("Error al enviar la solicitud de fotos");
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
      await fetchPendingCases();
    } catch (error) {
      console.error("Error rejecting case:", error);
      setToastMessage("Error al rechazar el caso");
      setToastType("error");
      setShowToast(true);
    }
  };

  return (
    <div className="p-5">
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full shadow-xl">
            <h2 className="text-[15px] font-bold text-slate-900 mb-2">Rechazar caso</h2>
            <p className="text-[13px] text-slate-600 mb-4">
              ¿Está seguro que desea rechazar este caso?
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => { setShowRejectModal(false); setRejectingId(null); }}
                className="flex-1 rounded-lg border border-slate-200 bg-white py-2 text-[12px] font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleRejectConfirm}
                className="flex-1 rounded-lg bg-red-600 py-2 text-[12px] font-semibold text-white hover:bg-red-700 transition-colors"
              >
                Rechazar
              </button>
            </div>
          </div>
        </div>
      )}

      <PageHeader
        title="Revisión de casos"
        subtitle={`${cases.length} caso${cases.length !== 1 ? "s" : ""} pendiente${cases.length !== 1 ? "s" : ""} de revisión`}
      />

      {isLoading && <LoadingSpinner />}

      {!isLoading && cases.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
            <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-[13px] font-semibold text-slate-700">Sin casos pendientes</p>
          <p className="mt-1 text-[12px] text-slate-400">Todos los casos han sido revisados.</p>
        </div>
      )}

      {!isLoading && cases.length > 0 && (
        <>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
            <table className="min-w-[640px] w-full text-[12px]">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-2.5 text-left text-[10px] font-medium uppercase tracking-wide text-slate-500">Nombre</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-medium uppercase tracking-wide text-slate-500">Edad</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-medium uppercase tracking-wide text-slate-500">Género</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-medium uppercase tracking-wide text-slate-500">Última ubicación</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-medium uppercase tracking-wide text-slate-500">Fotos</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-medium uppercase tracking-wide text-slate-500">Reportado</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-medium uppercase tracking-wide text-slate-500">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {cases.map((person) => (
                  <tr key={person.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-900">{person.full_name}</td>
                    <td className="px-4 py-3 text-slate-500">{person.age_at_disappearance || "—"}</td>
                    <td className="px-4 py-3 text-slate-500">{person.gender || "—"}</td>
                    <td className="px-4 py-3 text-slate-500 max-w-[160px] truncate">{person.last_known_location || "—"}</td>
                    <td className="px-4 py-3">
                      {photoCounts[person.id] === undefined ? (
                        <span className="text-[10px] text-slate-400">…</span>
                      ) : photoCounts[person.id] === 0 ? (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                          Sin fotos
                        </span>
                      ) : (
                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700">
                          {photoCounts[person.id]} foto{photoCounts[person.id] !== 1 ? "s" : ""}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {new Date(person.created_at).toLocaleDateString("es-BO")}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1.5">
                        <button
                          onClick={() => handleApprove(person.id)}
                          className="rounded-lg bg-green-100 px-2.5 py-1 text-[10px] font-semibold text-green-700 hover:bg-green-200 transition-colors"
                        >
                          ✓ Aprobar
                        </button>
                        <button
                          onClick={() => { setRejectingId(person.id); setShowRejectModal(true); }}
                          className="rounded-lg bg-red-100 px-2.5 py-1 text-[10px] font-semibold text-red-700 hover:bg-red-200 transition-colors"
                        >
                          ✗ Rechazar
                        </button>
                        <button
                          onClick={() => handleRequestPhotos(person.id)}
                          className="rounded-lg bg-blue-100 px-2.5 py-1 text-[10px] font-semibold text-blue-700 hover:bg-blue-200 transition-colors whitespace-nowrap"
                        >
                          Solicitar fotos
                        </button>
                        <Link
                          href={`/dashboard/persons/${person.id}`}
                          className="rounded-lg border border-slate-200 px-2.5 py-1 text-center text-[10px] font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                        >
                          Ver perfil
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>

          <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4">
            <div className="flex gap-3">
              <svg className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 5v8a2 2 0 01-2 2h-5l-5 4v-4H4a2 2 0 01-2-2V5a2 2 0 012-2h12a2 2 0 012 2zm-11-1a1 1 0 11-2 0 1 1 0 012 0z" clipRule="evenodd" />
              </svg>
              <p className="text-[12px] text-blue-700">
                Revisa cuidadosamente cada reporte. Solo aprueba información verificable y
                completa. Los casos rechazados se archivarán automáticamente.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

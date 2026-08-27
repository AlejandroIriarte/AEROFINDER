// =============================================================================
// AEROFINDER — Super Admin / Borrados definitivos
// Lista usuarios desactivados (is_active=False) y permite borrado permanente
// con modal de confirmación explícito.
// =============================================================================

"use client";

import { useCallback, useEffect, useState } from "react";
import { RoleGuard } from "@/components/ui/RoleGuard";
import { superadminApi } from "@/lib/api";
import type { SoftDeletedUser } from "@/lib/types";

function RelativeTime({ iso }: { iso: string }) {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days < 1) return <span>hoy</span>;
  if (days === 1) return <span>ayer</span>;
  return <span>hace {days} días</span>;
}

// ── Modal de confirmación ─────────────────────────────────────────────────────

function ConfirmModal({
  user,
  onConfirm,
  onCancel,
  deleting,
}: {
  user: SoftDeletedUser;
  onConfirm: () => void;
  onCancel:  () => void;
  deleting:  boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-2xl border border-red-200 bg-white shadow-2xl p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 text-red-600">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14H6L5 6" />
              <path d="M10 11v6M14 11v6" />
              <path d="M9 6V4h6v2" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-bold text-gray-900">Borrado definitivo</h3>
            <p className="text-xs text-red-600 font-medium">Esta acción es irreversible</p>
          </div>
        </div>

        <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-3 space-y-1">
          <p className="text-xs font-semibold text-gray-800">{user.full_name}</p>
          <p className="text-[11px] text-gray-500">{user.email}</p>
          <p className="text-[11px] text-gray-500">Rol: <span className="font-medium">{user.role}</span></p>
        </div>

        <p className="text-xs text-gray-600">
          Se eliminarán permanentemente todos los datos asociados a este usuario.
          No se podrá recuperar la información.
        </p>

        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onCancel}
            disabled={deleting}
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            className="rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 transition-colors disabled:opacity-50"
          >
            {deleting ? "Borrando…" : "Confirmar borrado definitivo"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Página ────────────────────────────────────────────────────────────────────

export default function HardDeletePage() {
  const [items,    setItems]    = useState<SoftDeletedUser[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(false);
  const [selected, setSelected] = useState<SoftDeletedUser | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const data = await superadminApi.listSoftDeleted();
      setItems(data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleConfirmDelete = async () => {
    if (!selected) return;
    setDeleting(true);
    try {
      await superadminApi.hardDeleteUser(selected.id);
      setItems((prev) => prev.filter((u) => u.id !== selected.id));
      setSelected(null);
    } catch {
      // silencioso — el modal permanece abierto
    } finally {
      setDeleting(false);
    }
  };

  return (
    <RoleGuard allowedRoles={["admin", "super_admin"]}>
      {selected && (
        <ConfirmModal
          user={selected}
          onConfirm={handleConfirmDelete}
          onCancel={() => setSelected(null)}
          deleting={deleting}
        />
      )}

      <div className="p-6 space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Borrados definitivos</h1>
            <p className="text-xs text-gray-400 mt-0.5">
              Usuarios desactivados disponibles para purga permanente
            </p>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            {loading ? "Cargando…" : "Actualizar"}
          </button>
        </div>

        {/* Aviso de zona peligrosa */}
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex items-start gap-3">
          <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0 text-red-500" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <div>
            <p className="text-xs font-semibold text-red-800">Zona de peligro — solo super_admin</p>
            <p className="text-[11px] text-red-600 mt-0.5">
              El borrado definitivo elimina al usuario y todos sus datos asociados. Esta acción no se puede deshacer.
              Solo se pueden purgar usuarios previamente desactivados (is_active=false).
            </p>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            Error al cargar usuarios desactivados.
          </div>
        )}

        {/* Lista */}
        {items.length === 0 && !loading ? (
          <div className="rounded-xl border border-gray-200 bg-white p-10 text-center shadow-sm">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
              <svg viewBox="0 0 24 24" className="h-6 w-6 text-green-600" fill="none" stroke="currentColor" strokeWidth={2}>
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <p className="text-sm font-semibold text-gray-700">Sin usuarios para purgar</p>
            <p className="text-xs text-gray-400 mt-1">
              Todos los usuarios están activos o ya fueron borrados definitivamente.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 text-[10px] uppercase tracking-wide text-gray-400">
                    <th className="px-4 py-2.5 text-left font-semibold">Usuario</th>
                    <th className="px-4 py-2.5 text-left font-semibold hidden sm:table-cell">Email</th>
                    <th className="px-4 py-2.5 text-left font-semibold">Rol</th>
                    <th className="px-4 py-2.5 text-left font-semibold hidden md:table-cell">Desactivado</th>
                    <th className="px-4 py-2.5 text-left font-semibold">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {items.map((u) => (
                    <tr key={u.id} className="hover:bg-red-50/30">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-400 text-[11px] font-bold">
                            {u.full_name.charAt(0).toUpperCase()}
                          </div>
                          <span className="font-semibold text-gray-500">{u.full_name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-400 hidden sm:table-cell">{u.email}</td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">
                          {u.role}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-400 hidden md:table-cell">
                        {u.deactivated_at ? <RelativeTime iso={u.deactivated_at} /> : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setSelected(u)}
                          className="rounded border border-red-300 bg-white px-2.5 py-1 text-[10px] font-semibold text-red-700 hover:bg-red-50 transition-colors"
                        >
                          Borrar definitivamente
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>
    </RoleGuard>
  );
}

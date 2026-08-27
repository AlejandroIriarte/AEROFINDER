// =============================================================================
// AEROFINDER — Super Admin / Sesiones activas
// Lista todas las sesiones activas, con filtro por rol y revocación individual.
// =============================================================================

"use client";

import { useCallback, useEffect, useState } from "react";
import { RoleGuard } from "@/components/ui/RoleGuard";
import { superadminApi } from "@/lib/api";
import type { AdminSession } from "@/lib/types";

function RelativeTime({ iso }: { iso: string }) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  const hrs  = Math.floor(mins / 60);
  if (mins < 1)  return <span>ahora</span>;
  if (mins < 60) return <span>hace {mins} min</span>;
  if (hrs < 24)  return <span>hace {hrs} h</span>;
  return <span>hace {Math.floor(hrs / 24)} d</span>;
}

function RoleBadge({ role }: { role: string }) {
  const styles: Record<string, string> = {
    super_admin: "bg-red-100 text-red-700",
    admin:       "bg-violet-100 text-violet-700",
    buscador:    "bg-blue-100 text-blue-700",
    ayudante:    "bg-green-100 text-green-700",
    familiar:    "bg-amber-100 text-amber-700",
  };
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${styles[role] ?? "bg-gray-100 text-gray-600"}`}>
      {role}
    </span>
  );
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState<AdminSession[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [filter,   setFilter]   = useState<string>("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const data = await superadminApi.listSessions();
      setSessions(data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleRevoke = async (id: string) => {
    setRevoking(id);
    try {
      await superadminApi.revokeSession(id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
    } catch {
      // silencioso
    } finally {
      setRevoking(null);
    }
  };

  const handleRevokeAll = async () => {
    const target = filtered.filter(s => s.id !== undefined);
    if (!confirm(`¿Revocar las ${target.length} sesiones filtradas? Los usuarios serán desconectados.`)) return;
    for (const s of target) {
      try { await superadminApi.revokeSession(s.id); } catch { /* continúa */ }
    }
    await load();
  };

  const roles = ["all", ...Array.from(new Set(sessions.map(s => s.user_role)))];
  const filtered = filter === "all" ? sessions : sessions.filter(s => s.user_role === filter);

  return (
    <RoleGuard allowedRoles={["admin", "super_admin"]}>
      <div className="p-6 space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Sesiones activas</h1>
            <p className="text-xs text-gray-400 mt-0.5">
              {sessions.length} sesión(es) activa(s) en todo el sistema
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={load}
              disabled={loading}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              {loading ? "Cargando…" : "Actualizar"}
            </button>
            {filtered.length > 0 && (
              <button
                onClick={handleRevokeAll}
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 transition-colors"
              >
                Revocar {filtered.length > 1 ? `(${filtered.length})` : ""}
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            Error al cargar sesiones.
          </div>
        )}

        {/* Filtro por rol */}
        <div className="flex flex-wrap gap-2">
          {roles.map((r) => (
            <button
              key={r}
              onClick={() => setFilter(r)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                filter === r
                  ? "border-blue-500 bg-blue-500 text-white"
                  : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              {r === "all" ? `Todos (${sessions.length})` : r}
            </button>
          ))}
        </div>

        {/* Tabla */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          {filtered.length === 0 && !loading ? (
            <p className="px-4 py-8 text-center text-sm text-gray-400">Sin sesiones activas.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 text-[10px] uppercase tracking-wide text-gray-400">
                    <th className="px-4 py-2.5 text-left font-semibold">Usuario</th>
                    <th className="px-4 py-2.5 text-left font-semibold">Rol</th>
                    <th className="px-4 py-2.5 text-left font-semibold hidden sm:table-cell">IP</th>
                    <th className="px-4 py-2.5 text-left font-semibold hidden md:table-cell">Navegador</th>
                    <th className="px-4 py-2.5 text-left font-semibold">Emitida</th>
                    <th className="px-4 py-2.5 text-left font-semibold hidden lg:table-cell">Expira</th>
                    <th className="px-4 py-2.5 text-left font-semibold">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map((s) => (
                    <tr key={s.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-gray-900 truncate max-w-[140px]">{s.user_name}</p>
                        <p className="text-[10px] text-gray-400 truncate max-w-[140px]">{s.user_email}</p>
                      </td>
                      <td className="px-4 py-3"><RoleBadge role={s.user_role} /></td>
                      <td className="px-4 py-3 text-gray-500 hidden sm:table-cell font-mono">{s.ip_address}</td>
                      <td className="px-4 py-3 text-gray-400 hidden md:table-cell truncate max-w-[120px]">
                        {s.user_agent?.split(" ").slice(0, 2).join(" ") ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                        <RelativeTime iso={s.issued_at} />
                      </td>
                      <td className="px-4 py-3 text-gray-400 whitespace-nowrap hidden lg:table-cell">
                        {new Date(s.expires_at).toLocaleDateString("es-BO")}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          disabled={revoking === s.id}
                          onClick={() => handleRevoke(s.id)}
                          className="rounded border border-red-200 bg-white px-2.5 py-1 text-[10px] font-medium text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40"
                        >
                          {revoking === s.id ? "…" : "Revocar"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </RoleGuard>
  );
}

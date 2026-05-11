// Tabla de auditoría. Si el endpoint no existe en backend, muestra mensaje claro.
"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuthStore } from "@/store/auth";
import type { AuditLog } from "@/lib/types";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { PageHeader } from "@/components/dashboard/PageHeader";
import api from "@/lib/api";

const OP_BADGE: Record<string, string> = {
  INSERT: "bg-green-100 text-green-700",
  UPDATE: "bg-blue-100 text-blue-700",
  DELETE: "bg-red-100 text-red-600",
};

export default function LogsPage() {
  const user = useAuthStore((s) => s.user);

  const [logs, setLogs]    = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);

  const isAdmin = user?.role === "admin";

  const load = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<AuditLog[]>("/audit-log/", { params: { limit: 100 } });
      setLogs(data);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status?: number } };
      if (axiosErr.response?.status === 403) {
        setError("Sin permisos para ver el log de auditoría.");
      } else {
        setError("Error al cargar el log. Intenta de nuevo.");
      }
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => { load(); }, [load]);

  if (!isAdmin) {
    return (
      <div className="p-5">
        <PageHeader title="Auditoría" />
        <p className="text-[12px] text-slate-400">Acceso restringido a administradores</p>
      </div>
    );
  }

  return (
    <div className="p-5">
      <PageHeader
        title="Auditoría"
        subtitle="Registro de cambios en la base de datos"
      />

      {loading && <LoadingSpinner />}

      {!loading && error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-center">
          <p className="text-sm text-amber-800">{error}</p>
          <button
            onClick={load}
            className="mt-3 rounded-lg bg-amber-600 px-4 py-2 text-sm text-white hover:bg-amber-700"
          >
            Reintentar
          </button>
        </div>
      )}

      {!loading && !error && logs.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-[12px]">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-2.5 text-left text-[10px] font-medium uppercase tracking-wide text-slate-500">Fecha</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-medium uppercase tracking-wide text-slate-500">Tabla</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-medium uppercase tracking-wide text-slate-500">Operación</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-medium uppercase tracking-wide text-slate-500">ID registro</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-medium uppercase tracking-wide text-slate-500">Usuario</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 tabular-nums text-slate-500">
                    {new Date(log.changed_at).toLocaleString("es-BO", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </td>
                  <td className="px-4 py-3">
                    <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-mono text-slate-700">
                      {log.table_name}
                    </code>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${
                        OP_BADGE[log.operation] ?? "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {log.operation}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px] text-slate-400">
                    {log.record_id.slice(0, 8)}…
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {log.changed_by ? log.changed_by.slice(0, 8) + "…" : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

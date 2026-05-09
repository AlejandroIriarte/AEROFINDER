// Tabla de auditoría. Si el endpoint no existe en backend, muestra mensaje claro.
"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/auth";
import type { AuditLog } from "@/lib/types";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { PageHeader } from "@/components/ui/PageHeader";
import api from "@/lib/api";

const OP_BADGE: Record<string, string> = {
  INSERT: "bg-green-100 text-green-700",
  UPDATE: "bg-blue-100 text-blue-700",
  DELETE: "bg-red-100 text-red-600",
};

export default function LogsPage() {
  const user = useAuthStore((s) => s.user);

  const [logs, setLogs]               = useState<AuditLog[]>([]);
  const [loading, setLoading]         = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  const isAdmin = user?.role === "admin";

  useEffect(() => {
    if (!isAdmin) return;
    api.get<AuditLog[]>("/audit-log/", { params: { limit: 100 } })
      .then(({ data }) => setLogs(data))
      .catch(() => setUnavailable(true))
      .finally(() => setLoading(false));
  }, [isAdmin]);

  if (!isAdmin) {
    return (
      <div className="flex h-full flex-col">
        <PageHeader title="Auditoría" />
        <div className="flex flex-1 items-center justify-center text-gray-400">
          Acceso restringido a administradores
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Auditoría"
        description="Registro de cambios en la base de datos"
      />

      <div className="flex-1 overflow-auto p-6">
        {loading && <LoadingSpinner />}

        {!loading && unavailable && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-50">
              <svg
                className="h-7 w-7 text-amber-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                />
              </svg>
            </div>
            <h3 className="mb-1 text-base font-semibold text-gray-700">
              Endpoint de auditoría no disponible
            </h3>
            <p className="max-w-xs text-sm text-gray-400">
              El módulo de auditoría aún no está implementado en el backend. Los registros de
              cambio se almacenan en la tabla{" "}
              <code className="rounded bg-gray-100 px-1">audit_log</code> y estarán
              disponibles en una próxima versión.
            </p>
          </div>
        )}

        {!loading && !unavailable && logs.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left">
                  <th className="px-4 py-3 font-semibold text-gray-600">Fecha</th>
                  <th className="px-4 py-3 font-semibold text-gray-600">Tabla</th>
                  <th className="px-4 py-3 font-semibold text-gray-600">Operación</th>
                  <th className="px-4 py-3 font-semibold text-gray-600">ID registro</th>
                  <th className="px-4 py-3 font-semibold text-gray-600">Usuario</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-3 tabular-nums text-gray-500">
                      {new Date(log.changed_at).toLocaleString("es-BO", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-mono text-gray-700">
                        {log.table_name}
                      </code>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          OP_BADGE[log.operation] ?? "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {log.operation}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-400">
                      {log.record_id.slice(0, 8)}…
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {log.changed_by ? log.changed_by.slice(0, 8) + "…" : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// AEROFINDER — Super Admin / Auditoría profunda
// Tabla completa de audit_log con paginación, filtro por operación y tabla.
// Los registros son generados por triggers de PostgreSQL (inmutables).
// =============================================================================

"use client";

import { useCallback, useEffect, useState } from "react";
import { RoleGuard } from "@/components/ui/RoleGuard";
import api from "@/lib/api";
import type { AuditLog } from "@/lib/types";

const PAGE_SIZE = 50;

const OP_STYLES: Record<string, { bg: string; text: string }> = {
  INSERT: { bg: "bg-green-100", text: "text-green-700" },
  UPDATE: { bg: "bg-blue-100",  text: "text-blue-700"  },
  DELETE: { bg: "bg-red-100",   text: "text-red-700"   },
};

function ExpandableRow({ log }: { log: AuditLog }) {
  const [open, setOpen] = useState(false);
  const st = OP_STYLES[log.operation] ?? { bg: "bg-gray-100", text: "text-gray-600" };

  return (
    <>
      <tr
        className="hover:bg-gray-50 cursor-pointer"
        onClick={() => setOpen((v) => !v)}
      >
        <td className="px-4 py-2.5 whitespace-nowrap">
          <span className={`rounded px-2 py-0.5 text-[10px] font-semibold ${st.bg} ${st.text}`}>
            {log.operation}
          </span>
        </td>
        <td className="px-4 py-2.5 font-mono text-[11px] text-gray-700">{log.table_name}</td>
        <td className="px-4 py-2.5 font-mono text-[10px] text-gray-400">
          {log.record_id.slice(0, 8)}…
        </td>
        <td className="px-4 py-2.5 text-[11px] text-gray-500 whitespace-nowrap hidden sm:table-cell">
          {new Date(log.changed_at).toLocaleString("es-BO")}
        </td>
        <td className="px-4 py-2.5 hidden md:table-cell">
          {log.changed_by ? (
            <span className="font-mono text-[10px] text-gray-500">{log.changed_by.slice(0, 8)}…</span>
          ) : (
            <span className="text-[10px] text-gray-300">sistema</span>
          )}
        </td>
        <td className="px-4 py-2.5 text-right">
          {(log.old_data || log.new_data) && (
            <span className="text-[10px] text-gray-400">{open ? "▲" : "▼"} diff</span>
          )}
        </td>
      </tr>
      {open && (log.old_data || log.new_data) && (
        <tr className="bg-slate-50">
          <td colSpan={6} className="px-4 py-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {log.old_data && (
                <div>
                  <p className="mb-1 text-[10px] font-semibold text-red-600 uppercase">Antes</p>
                  <pre className="overflow-auto rounded-lg bg-red-50 p-3 text-[10px] text-red-800 max-h-40 border border-red-100">
                    {JSON.stringify(log.old_data, null, 2)}
                  </pre>
                </div>
              )}
              {log.new_data && (
                <div>
                  <p className="mb-1 text-[10px] font-semibold text-green-600 uppercase">Después</p>
                  <pre className="overflow-auto rounded-lg bg-green-50 p-3 text-[10px] text-green-800 max-h-40 border border-green-100">
                    {JSON.stringify(log.new_data, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function AuditPage() {
  const [logs,       setLogs]       = useState<AuditLog[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(false);
  const [page,       setPage]       = useState(0);
  const [hasMore,    setHasMore]    = useState(true);
  const [opFilter,   setOpFilter]   = useState<string>("all");
  const [tableFilter,setTableFilter]= useState<string>("all");

  const load = useCallback(async (reset = false) => {
    setLoading(true);
    setError(false);
    const offset = reset ? 0 : page * PAGE_SIZE;
    try {
      const { data } = await api.get<AuditLog[]>("/audit-log/", {
        params: { limit: PAGE_SIZE, offset },
      });
      if (reset) {
        setLogs(data);
        setPage(0);
      } else {
        setLogs((prev) => [...prev, ...data]);
      }
      setHasMore(data.length === PAGE_SIZE);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { load(true); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadMore = () => {
    setPage((p) => p + 1);
  };

  useEffect(() => {
    if (page > 0) load(false);
  }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tablas únicas para filtro
  const tables = ["all", ...Array.from(new Set(logs.map((l) => l.table_name))).sort()];

  const filtered = logs.filter((l) =>
    (opFilter    === "all" || l.operation  === opFilter) &&
    (tableFilter === "all" || l.table_name === tableFilter)
  );

  return (
    <RoleGuard allowedRoles={["admin", "super_admin"]}>
      <div className="p-6 space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Auditoría profunda</h1>
            <p className="text-xs text-gray-400 mt-0.5">
              {logs.length} evento(s) cargados · registros inmutables generados por triggers
            </p>
          </div>
          <button
            onClick={() => load(true)}
            disabled={loading}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            {loading ? "Cargando…" : "Actualizar"}
          </button>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            Error al cargar registros de auditoría.
          </div>
        )}

        {/* Filtros */}
        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-semibold text-gray-400 uppercase">Operación:</span>
            {["all", "INSERT", "UPDATE", "DELETE"].map((op) => (
              <button
                key={op}
                onClick={() => setOpFilter(op)}
                className={`rounded-full border px-2.5 py-0.5 text-[10px] font-medium transition-colors ${
                  opFilter === op
                    ? "border-slate-700 bg-slate-700 text-white"
                    : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                {op === "all" ? "Todas" : op}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-semibold text-gray-400 uppercase">Tabla:</span>
            <select
              value={tableFilter}
              onChange={(e) => setTableFilter(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-[11px] text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400"
            >
              {tables.map((t) => (
                <option key={t} value={t}>{t === "all" ? "Todas las tablas" : t}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Contador de resultados filtrados */}
        {(opFilter !== "all" || tableFilter !== "all") && (
          <p className="text-xs text-gray-500">
            Mostrando <span className="font-semibold">{filtered.length}</span> de {logs.length} registros
          </p>
        )}

        {/* Tabla */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="bg-gray-50 text-[10px] uppercase tracking-wide text-gray-400">
                  <th className="px-4 py-2.5 text-left font-semibold">Operación</th>
                  <th className="px-4 py-2.5 text-left font-semibold">Tabla</th>
                  <th className="px-4 py-2.5 text-left font-semibold">ID registro</th>
                  <th className="px-4 py-2.5 text-left font-semibold hidden sm:table-cell">Fecha</th>
                  <th className="px-4 py-2.5 text-left font-semibold hidden md:table-cell">Usuario</th>
                  <th className="px-4 py-2.5 text-right font-semibold"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.length === 0 && !loading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400">
                      Sin registros de auditoría.
                    </td>
                  </tr>
                ) : (
                  filtered.map((log) => <ExpandableRow key={log.id} log={log} />)
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Cargar más */}
        {hasMore && !loading && filtered.length >= PAGE_SIZE && (
          <div className="flex justify-center">
            <button
              onClick={loadMore}
              className="rounded-lg border border-gray-200 bg-white px-5 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cargar {PAGE_SIZE} más
            </button>
          </div>
        )}

        {loading && logs.length > 0 && (
          <p className="text-center text-xs text-gray-400">Cargando…</p>
        )}

      </div>
    </RoleGuard>
  );
}

// =============================================================================
// AEROFINDER — Administrador / Parámetros del sistema
// Lista y edición de system_config (umbrales IA, retención, etc.)
// =============================================================================

"use client";

import { useEffect, useState } from "react";
import { RoleGuard } from "@/components/ui/RoleGuard";
import { systemApi } from "@/lib/api";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import type { SystemConfig } from "@/lib/types";

function EditableRow({ cfg, onSaved }: { cfg: SystemConfig; onSaved: (updated: SystemConfig) => void }) {
  const [editing, setEditing]   = useState(false);
  const [value,   setValue]     = useState(cfg.value_text);
  const [saving,  setSaving]    = useState(false);
  const [error,   setError]     = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const updated = await systemApi.updateConfig(cfg.config_key, value);
      onSaved(updated);
      setEditing(false);
    } catch {
      setError("No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    setValue(cfg.value_text);
    setEditing(false);
    setError(null);
  }

  return (
    <tr className="border-b border-slate-100 last:border-0">
      <td className="py-3 pr-4 align-top">
        <span className="font-mono text-[12px] text-slate-700">{cfg.config_key}</span>
        {cfg.description && (
          <p className="mt-0.5 text-[11px] text-slate-400">{cfg.description}</p>
        )}
      </td>
      <td className="py-3 pr-4 align-top">
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
          {cfg.value_type}
        </span>
      </td>
      <td className="py-3 pr-4 align-top w-56">
        {editing ? (
          <div className="flex flex-col gap-1.5">
            <input
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="rounded-lg border border-blue-300 px-2.5 py-1.5 text-[13px] font-mono outline-none ring-1 ring-blue-200 w-full"
              autoFocus
            />
            {cfg.min_value != null && cfg.max_value != null && (
              <p className="text-[10px] text-slate-400">Rango: {cfg.min_value} – {cfg.max_value}</p>
            )}
            {error && <p className="text-[11px] text-red-500">{error}</p>}
            <div className="flex gap-2">
              <button
                onClick={save}
                disabled={saving}
                className="rounded-lg bg-blue-600 px-3 py-1 text-[12px] font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? "Guardando…" : "Guardar"}
              </button>
              <button
                onClick={cancel}
                className="rounded-lg border border-slate-200 px-3 py-1 text-[12px] text-slate-600 hover:bg-slate-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="font-mono text-[13px] text-slate-800">{cfg.value_text}</span>
            <button
              onClick={() => setEditing(true)}
              className="ml-auto rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              title="Editar"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
          </div>
        )}
      </td>
      <td className="py-3 align-top text-[11px] text-slate-400 whitespace-nowrap">
        {new Date(cfg.updated_at).toLocaleString("es-BO", { dateStyle: "short", timeStyle: "short" })}
      </td>
    </tr>
  );
}

export default function ConfigPage() {
  const [configs,  setConfigs]  = useState<SystemConfig[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);

  useEffect(() => {
    systemApi.listConfig()
      .then(setConfigs)
      .catch(() => setError("No se pudo cargar la configuración"))
      .finally(() => setLoading(false));
  }, []);

  function handleSaved(updated: SystemConfig) {
    setConfigs((prev) => prev.map((c) => (c.config_key === updated.config_key ? updated : c)));
  }

  return (
    <RoleGuard allowedRoles={["admin", "super_admin"]}>
      <div className="p-5">
        <PageHeader
          title="Parámetros del sistema"
          subtitle="Umbrales de IA, retención de datos y configuración general"
        />

        {loading ? (
          <div className="flex justify-center py-16"><LoadingSpinner /></div>
        ) : error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-[13px] text-red-700">{error}</div>
        ) : configs.length === 0 ? (
          <p className="text-[13px] text-slate-400">No hay parámetros de configuración.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Clave</th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Tipo</th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Valor</th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Actualizado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 px-4">
                {configs.map((cfg) => (
                  <EditableRow key={cfg.config_key} cfg={cfg} onSaved={handleSaved} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </RoleGuard>
  );
}

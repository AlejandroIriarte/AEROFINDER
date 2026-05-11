// Tabla editable de parámetros del sistema. Edición inline con Enter/Escape. Solo admin.
"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/auth";
import { systemApi } from "@/lib/api";
import type { SystemConfig } from "@/lib/types";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/dashboard/PageHeader";

export default function ConfigPage() {
  const user = useAuthStore((s) => s.user);

  const [configs, setConfigs] = useState<SystemConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [saving, setSaving]   = useState<string | null>(null);

  const isAdmin = user?.role === "admin";

  useEffect(() => {
    if (!isAdmin) return;
    systemApi.listConfig()
      .then(setConfigs)
      .catch(() => setError("Error al cargar la configuración"))
      .finally(() => setLoading(false));
  }, [isAdmin]);

  if (!isAdmin) {
    return (
      <div className="p-5">
        <PageHeader title="Configuración" />
        <p className="text-[12px] text-slate-400">Acceso restringido a administradores</p>
      </div>
    );
  }

  function startEdit(config: SystemConfig) {
    setEditing((prev) => ({ ...prev, [config.config_key]: config.value_text }));
  }

  function cancelEdit(config_key: string) {
    setEditing((prev) => {
      const next = { ...prev };
      delete next[config_key];
      return next;
    });
  }

  async function saveEdit(config: SystemConfig) {
    const newValue = editing[config.config_key];
    if (newValue === undefined || newValue === config.value_text) {
      cancelEdit(config.config_key);
      return;
    }
    setSaving(config.config_key);
    try {
      const updated = await systemApi.updateConfig(config.config_key, newValue);
      setConfigs((prev) =>
        prev.map((c) => (c.config_key === config.config_key ? updated : c))
      );
      cancelEdit(config.config_key);
    } catch {
      alert("Error al guardar el valor");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="p-5">
      <PageHeader
        title="Configuración del sistema"
        subtitle="Parámetros de operación. Haz clic en un valor para editarlo."
      />

      {loading && <LoadingSpinner />}

      {!loading && error && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      {!loading && !error && configs.length === 0 && (
        <EmptyState
          title="Sin parámetros"
          description="La tabla de configuración está vacía."
        />
      )}

      {!loading && !error && configs.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-[12px]">
            <thead className="bg-slate-50">
              <tr>
                <th className="w-1/4 px-4 py-2.5 text-left text-[10px] font-medium uppercase tracking-wide text-slate-500">Parámetro</th>
                <th className="w-1/4 px-4 py-2.5 text-left text-[10px] font-medium uppercase tracking-wide text-slate-500">Valor</th>
                <th className="w-16 px-4 py-2.5 text-left text-[10px] font-medium uppercase tracking-wide text-slate-500">Tipo</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-medium uppercase tracking-wide text-slate-500">Descripción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {configs.map((config) => {
                const isEditing = config.config_key in editing;
                const isSaving  = saving === config.config_key;

                return (
                  <tr key={config.config_key} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-mono text-slate-700">
                        {config.config_key}
                      </code>
                    </td>
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <input
                          autoFocus
                          value={editing[config.config_key]}
                          onChange={(e) =>
                            setEditing((prev) => ({
                              ...prev,
                              [config.config_key]: e.target.value,
                            }))
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveEdit(config);
                            if (e.key === "Escape") cancelEdit(config.config_key);
                          }}
                          onBlur={() => saveEdit(config)}
                          disabled={isSaving}
                          className="w-full rounded-lg border border-blue-400 px-2 py-1 text-[12px] font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      ) : (
                        <button
                          onClick={() => startEdit(config)}
                          className="rounded px-1.5 py-0.5 font-mono text-[12px] text-slate-800 hover:bg-blue-50 hover:text-blue-700 transition-colors"
                          title="Clic para editar"
                        >
                          {config.value_text}
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
                        {config.value_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {config.description ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="border-t border-slate-100 px-4 py-2 text-[10px] text-slate-400">
            Enter para guardar · Escape para cancelar
          </div>
        </div>
      )}
    </div>
  );
}

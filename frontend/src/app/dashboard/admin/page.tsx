// =============================================================================
// AEROFINDER Frontend — Panel de control (admin)
// Misiones activas, flota de drones, audit log, system_config editable.
// =============================================================================

"use client";

import { useEffect, useState, useCallback } from "react";
import { missionsApi, dronesApi, systemApi } from "@/lib/api";
import { RoleGuard } from "@/components/ui/RoleGuard";
import type { Mission, Drone, AuditLog, SystemConfig } from "@/lib/types";

// ── Helpers de presentación ───────────────────────────────────────────────────

const MISSION_STATUS_LABEL: Record<string, string> = {
  planned:     "Planificada",
  active:      "Activa",
  paused:      "Pausada",
  completed:   "Completada",
  interrupted: "Interrumpida",
  cancelled:   "Cancelada",
};

const MISSION_STATUS_COLOR: Record<string, string> = {
  planned:     "bg-gray-100 text-gray-600",
  active:      "bg-green-100 text-green-700",
  paused:      "bg-amber-100 text-amber-700",
  completed:   "bg-blue-100 text-blue-700",
  interrupted: "bg-orange-100 text-orange-700",
  cancelled:   "bg-red-100 text-red-600",
};

const DRONE_STATUS_COLOR: Record<string, string> = {
  available:       "bg-green-100 text-green-700",
  in_mission:      "bg-blue-100 text-blue-700",
  maintenance:     "bg-amber-100 text-amber-700",
  out_of_service:  "bg-red-100 text-red-600",
};

// ── Sección: Misiones activas ─────────────────────────────────────────────────

function ActiveMissions({ missions }: { missions: Mission[] }) {
  const active = missions.filter((m) => m.status === "active" || m.status === "planned");

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold text-gray-700">Misiones activas</h2>
      {active.length === 0 ? (
        <p className="text-sm text-gray-400">Sin misiones activas.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-100 text-sm">
            <thead className="bg-gray-50 text-xs font-medium uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-2 text-left">Misión</th>
                <th className="px-4 py-2 text-left">Estado</th>
                <th className="px-4 py-2 text-left">Inicio</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {active.map((m) => (
                <tr key={m.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5">
                    <p className="font-medium text-gray-900 truncate max-w-48">{m.name}</p>
                    {m.description && (
                      <p className="text-xs text-gray-400 truncate max-w-48">{m.description}</p>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${MISSION_STATUS_COLOR[m.status] ?? "bg-gray-100 text-gray-600"}`}>
                      {MISSION_STATUS_LABEL[m.status] ?? m.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-gray-500 text-xs">
                    {m.started_at
                      ? new Date(m.started_at).toLocaleString("es-BO", { dateStyle: "short", timeStyle: "short" })
                      : m.planned_at
                      ? new Date(m.planned_at).toLocaleString("es-BO", { dateStyle: "short", timeStyle: "short" })
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ── Sección: Flota de drones ──────────────────────────────────────────────────

function DroneFleet({ drones }: { drones: Drone[] }) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold text-gray-700">Flota de drones</h2>
      {drones.length === 0 ? (
        <p className="text-sm text-gray-400">Sin drones registrados.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {drones.map((drone) => (
            <div key={drone.id} className="rounded-lg border border-gray-200 bg-white p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium text-gray-900">{drone.model}</p>
                  <p className="truncate text-xs text-gray-400">{drone.manufacturer}</p>
                  <p className="mt-0.5 font-mono text-[10px] text-gray-400">{drone.serial_number}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${DRONE_STATUS_COLOR[drone.status] ?? "bg-gray-100 text-gray-600"}`}>
                  {drone.status.replace(/_/g, " ")}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ── Sección: Audit log ────────────────────────────────────────────────────────

function AuditLogSection({ entries }: { entries: AuditLog[] }) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold text-gray-700">Auditoría reciente</h2>
      {entries.length === 0 ? (
        <p className="text-sm text-gray-400">Sin entradas de auditoría.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-100 text-xs">
            <thead className="bg-gray-50 font-medium uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-2 text-left">Fecha</th>
                <th className="px-4 py-2 text-left">Tabla</th>
                <th className="px-4 py-2 text-left">Operación</th>
                <th className="px-4 py-2 text-left">ID Registro</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {entries.map((entry) => (
                <tr key={entry.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-gray-500 whitespace-nowrap">
                    {new Date(entry.changed_at).toLocaleString("es-BO", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </td>
                  <td className="px-4 py-2 font-mono text-gray-700">{entry.table_name}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`rounded px-1.5 py-0.5 font-semibold ${
                        entry.operation === "INSERT"
                          ? "bg-green-100 text-green-700"
                          : entry.operation === "DELETE"
                          ? "bg-red-100 text-red-700"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {entry.operation}
                    </span>
                  </td>
                  <td className="px-4 py-2 font-mono text-gray-400 truncate max-w-40">
                    {entry.record_id}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ── Sección: System config ────────────────────────────────────────────────────

function SystemConfigTable({ configs: initial }: { configs: SystemConfig[] }) {
  const [configs,  setConfigs]  = useState(initial);
  const [editing,  setEditing]  = useState<string | null>(null); // id del config en edición
  const [editVal,  setEditVal]  = useState("");
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  const startEdit = (cfg: SystemConfig) => {
    setEditing(cfg.id);
    setEditVal(cfg.value_text);
    setError(null);
  };

  const cancelEdit = () => {
    setEditing(null);
    setEditVal("");
    setError(null);
  };

  const saveEdit = async (cfg: SystemConfig) => {
    setSaving(true);
    setError(null);
    try {
      const updated = await systemApi.updateConfig(cfg.id, editVal);
      setConfigs((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      setEditing(null);
    } catch {
      setError("Error al guardar. Verifica el valor e intenta de nuevo.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold text-gray-700">Configuración del sistema</h2>
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-100 text-sm">
          <thead className="bg-gray-50 text-xs font-medium uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-2 text-left">Parámetro</th>
              <th className="px-4 py-2 text-left">Valor</th>
              <th className="px-4 py-2 text-left">Tipo</th>
              <th className="px-4 py-2 text-left w-24">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {configs.map((cfg) => (
              <tr key={cfg.id} className="hover:bg-gray-50">
                <td className="px-4 py-2.5">
                  <p className="font-mono text-xs text-gray-800">{cfg.config_key}</p>
                  {cfg.description && (
                    <p className="text-[10px] text-gray-400">{cfg.description}</p>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  {editing === cfg.id ? (
                    <div className="flex flex-col gap-1">
                      <input
                        type="text"
                        value={editVal}
                        onChange={(e) => setEditVal(e.target.value)}
                        className="w-36 rounded border border-gray-300 px-2 py-1 font-mono text-xs focus:border-blue-500 focus:outline-none"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveEdit(cfg);
                          if (e.key === "Escape") cancelEdit();
                        }}
                      />
                      {error && <p className="text-[10px] text-red-600">{error}</p>}
                    </div>
                  ) : (
                    <span className="font-mono text-xs text-gray-700">{cfg.value_text}</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-xs text-gray-400">{cfg.value_type}</td>
                <td className="px-4 py-2.5">
                  {editing === cfg.id ? (
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => saveEdit(cfg)}
                        disabled={saving}
                        className="rounded bg-blue-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
                      >
                        {saving ? "…" : "Guardar"}
                      </button>
                      <button
                        onClick={cancelEdit}
                        disabled={saving}
                        className="rounded bg-gray-200 px-2 py-1 text-[10px] text-gray-600 hover:bg-gray-300 disabled:opacity-50"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => startEdit(cfg)}
                      className="rounded bg-gray-100 px-2 py-1 text-[10px] font-medium text-gray-600 hover:bg-gray-200"
                    >
                      Editar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function AdminPage() {
  const [missions,  setMissions]  = useState<Mission[]>([]);
  const [drones,    setDrones]    = useState<Drone[]>([]);
  const [auditLog,  setAuditLog]  = useState<AuditLog[]>([]);
  const [sysConfig, setSysConfig] = useState<SystemConfig[]>([]);
  const [loadError, setLoadError] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [m, d, a, c] = await Promise.all([
        missionsApi.list(),
        dronesApi.list(),
        systemApi.auditLog(10),
        systemApi.listConfig(),
      ]);
      setMissions(m);
      setDrones(d);
      setAuditLog(a);
      setSysConfig(c);
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return (
    <RoleGuard allowedRoles={["admin"]}>
      <div className="p-6 space-y-8">
        {/* Título */}
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">Panel de control</h1>
          <button
            onClick={loadData}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Actualizar
          </button>
        </div>

        {loadError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            Error al cargar datos. Verifica tu conexión e intenta actualizar.
          </div>
        )}

        <ActiveMissions missions={missions} />
        <DroneFleet drones={drones} />
        <AuditLogSection entries={auditLog} />
        {sysConfig.length > 0 && <SystemConfigTable configs={sysConfig} />}
      </div>
    </RoleGuard>
  );
}

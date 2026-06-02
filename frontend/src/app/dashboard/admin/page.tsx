// =============================================================================
// AEROFINDER Frontend — Panel de control (admin)
// Stats rápidos, links a herramientas, misiones activas, flota drones.
// =============================================================================

"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { missionsApi, dronesApi } from "@/lib/api";
import { RoleGuard } from "@/components/ui/RoleGuard";
import type { Mission, Drone } from "@/lib/types";

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
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold text-gray-700">Misiones activas</h2>
      {missions.length === 0 ? (
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
              {missions.map((m) => (
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

// ── Página principal ──────────────────────────────────────────────────────────

export default function AdminPage() {
  const [missions,  setMissions]  = useState<Mission[]>([]);
  const [drones,    setDrones]    = useState<Drone[]>([]);
  const [loadError, setLoadError] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [m, d] = await Promise.all([
        missionsApi.list(),
        dronesApi.list(),
      ]);
      setMissions(m);
      setDrones(d);
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const activeMissions = missions.filter((m) => m.status === "active" || m.status === "planned");
  const flyingDrones   = drones.filter((d) => d.status === "in_mission");

  return (
    <RoleGuard allowedRoles={["admin"]}>
      <div className="p-6 space-y-8">
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

        {/* Stats rápidos */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: "Misiones activas",  value: activeMissions.length,  color: "text-green-600" },
            { label: "Drones en vuelo",   value: flyingDrones.length,    color: "text-blue-600"  },
            { label: "Total misiones",    value: missions.length,        color: "text-slate-700" },
            { label: "Total drones",      value: drones.length,          color: "text-slate-700" },
          ].map((stat) => (
            <div key={stat.label} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm text-center">
              <p className={`text-3xl font-bold ${stat.color}`}>{stat.value}</p>
              <p className="mt-1 text-xs text-gray-500">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Links a herramientas admin */}
        <section>
          <h2 className="mb-3 text-sm font-semibold text-gray-700">Herramientas</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Link
              href="/dashboard/admin/pending-review"
              className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 hover:bg-slate-50 transition-colors shadow-sm"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100">
                <svg viewBox="0 0 24 24" className="h-5 w-5 stroke-amber-600 fill-none" strokeWidth={1.8}>
                  <path d="M9 11l3 3L22 4"/>
                  <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                </svg>
              </div>
              <div>
                <p className="text-[13px] font-semibold text-slate-800">Revisión pendiente</p>
                <p className="text-[11px] text-slate-500">Detecciones sin confirmar</p>
              </div>
            </Link>

            <Link
              href="/dashboard/users"
              className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 hover:bg-slate-50 transition-colors shadow-sm"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-100">
                <svg viewBox="0 0 24 24" className="h-5 w-5 stroke-green-600 fill-none" strokeWidth={1.8}>
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                  <circle cx="12" cy="7" r="4"/>
                </svg>
              </div>
              <div>
                <p className="text-[13px] font-semibold text-slate-800">Personal de campo</p>
                <p className="text-[11px] text-slate-500">Gestión de buscadores y ayudantes</p>
              </div>
            </Link>
          </div>
        </section>

        <ActiveMissions missions={activeMissions} />
        <DroneFleet drones={drones} />
      </div>
    </RoleGuard>
  );
}

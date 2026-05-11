// =============================================================================
// AEROFINDER Frontend — Panel de control (admin)
// Stats rápidos, links a herramientas, red info, misiones activas, flota drones.
// =============================================================================

"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { missionsApi, dronesApi, systemApi } from "@/lib/api";
import { RoleGuard } from "@/components/ui/RoleGuard";
import type { Mission, Drone, NetworkInfo } from "@/lib/types";

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

// ── Sección: Información de red para drones ───────────────────────────────────

function NetworkInfoSection({ info }: { info: NetworkInfo }) {
  const [copied, setCopied] = useState<string | null>(null);

  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  const rows: { label: string; value: string; key: string; hint?: string }[] = [
    {
      label: "IP del servidor",
      value: info.server_ip,
      key: "ip",
      hint: "Actualizar con: ./aerofinder.sh ip <nueva_ip>",
    },
    {
      label: "RTMP — DJI Go/Fly",
      value: info.rtmp_url_template.replace("{serial}", "SERIAL_DRON"),
      key: "rtmp",
      hint: "Reemplazar SERIAL_DRON por el número de serie del dron registrado",
    },
    {
      label: "HLS — reproductor web",
      value: info.hls_url_template.replace("{serial}", "SERIAL_DRON"),
      key: "hls",
    },
    {
      label: "RTSP — AI worker / VLC",
      value: info.rtsp_url_template.replace("{serial}", "SERIAL_DRON"),
      key: "rtsp",
      hint: "VLC: activar RTP sobre RTSP (TCP) en Preferencias → Entrada/Codecs",
    },
  ];

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold text-gray-700">Configuración de red — drones</h2>
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white divide-y divide-gray-100">
        {rows.map((row) => (
          <div key={row.key} className="flex items-start justify-between gap-4 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-gray-500">{row.label}</p>
              <p className="mt-0.5 font-mono text-sm text-gray-900 break-all">{row.value}</p>
              {row.hint && <p className="mt-0.5 text-[10px] text-gray-400">{row.hint}</p>}
            </div>
            <button
              onClick={() => copy(row.value, row.key)}
              className="shrink-0 rounded bg-gray-100 px-2.5 py-1 text-[10px] font-medium text-gray-600 hover:bg-gray-200 transition-colors"
            >
              {copied === row.key ? "Copiado ✓" : "Copiar"}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

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
  const [missions,    setMissions]    = useState<Mission[]>([]);
  const [drones,      setDrones]      = useState<Drone[]>([]);
  const [networkInfo, setNetworkInfo] = useState<NetworkInfo | null>(null);
  const [loadError,   setLoadError]   = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [m, d, n] = await Promise.all([
        missionsApi.list(),
        dronesApi.list(),
        systemApi.getNetworkInfo(),
      ]);
      setMissions(m);
      setDrones(d);
      setNetworkInfo(n);
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Link
              href="/dashboard/config"
              className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 hover:bg-slate-50 transition-colors shadow-sm"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-100">
                <svg viewBox="0 0 24 24" className="h-5 w-5 stroke-violet-600 fill-none" strokeWidth={1.8}>
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                </svg>
              </div>
              <div>
                <p className="text-[13px] font-semibold text-slate-800">Configuración</p>
                <p className="text-[11px] text-slate-500">Parámetros del sistema, umbrales IA</p>
              </div>
            </Link>

            <Link
              href="/dashboard/logs"
              className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 hover:bg-slate-50 transition-colors shadow-sm"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100">
                <svg viewBox="0 0 24 24" className="h-5 w-5 stroke-blue-600 fill-none" strokeWidth={1.8}>
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/>
                  <line x1="16" y1="17" x2="8" y2="17"/>
                </svg>
              </div>
              <div>
                <p className="text-[13px] font-semibold text-slate-800">Auditoría</p>
                <p className="text-[11px] text-slate-500">Log de cambios en la base de datos</p>
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
                <p className="text-[13px] font-semibold text-slate-800">Usuarios</p>
                <p className="text-[11px] text-slate-500">Gestión de cuentas y roles</p>
              </div>
            </Link>
          </div>
        </section>

        {networkInfo && <NetworkInfoSection info={networkInfo} />}
        <ActiveMissions missions={activeMissions} />
        <DroneFleet drones={drones} />
      </div>
    </RoleGuard>
  );
}

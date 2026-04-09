// =============================================================================
// AEROFINDER Frontend — Dashboard principal diferenciado por rol
// admin/buscador: misiones activas | ayudante: alertas | familiar: notificaciones
// =============================================================================

"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/auth";
import { missionsApi, alertsApi } from "@/lib/api";
import type { Alert, Mission, RoleName } from "@/lib/types";

// ── Helpers de formato ────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-BO", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

const STATUS_LABEL: Record<string, string> = {
  planned:     "Planificada",
  active:      "Activa",
  paused:      "Pausada",
  completed:   "Completada",
  interrupted: "Interrumpida",
  cancelled:   "Cancelada",
};

const STATUS_COLOR: Record<string, string> = {
  planned:     "bg-yellow-100 text-yellow-800",
  active:      "bg-green-100  text-green-800",
  paused:      "bg-orange-100 text-orange-800",
  completed:   "bg-blue-100   text-blue-800",
  interrupted: "bg-red-100    text-red-800",
  cancelled:   "bg-gray-100   text-gray-600",
};

const ALERT_STATUS_COLOR: Record<string, string> = {
  generated: "bg-amber-100 text-amber-800",
  sent:      "bg-blue-100  text-blue-800",
  confirmed: "bg-green-100 text-green-800",
  dismissed: "bg-gray-100  text-gray-600",
};

// ── Vistas por rol ────────────────────────────────────────────────────────────

function MissionsSummary() {
  const [missions, setMissions] = useState<Mission[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    missionsApi.list()
      .then(setMissions)
      .catch(() => setMissions([]))
      .finally(() => setIsLoading(false));
  }, []);

  const active = missions.filter((m) => m.status === "active");

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-gray-500">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
        Cargando misiones…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Tarjetas resumen */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard label="Misiones activas" value={active.length} color="green" />
        <StatCard label="Total misiones"   value={missions.length} color="blue" />
        <StatCard
          label="Completadas"
          value={missions.filter((m) => m.status === "completed").length}
          color="gray"
        />
      </div>

      {/* Lista de misiones activas */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Misiones en curso
        </h2>
        {active.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-400">
            No hay misiones activas en este momento.
          </p>
        ) : (
          <ul className="divide-y divide-gray-200 rounded-xl border border-gray-200 bg-white shadow-sm">
            {active.map((m) => (
              <li key={m.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">{m.name}</p>
                  <p className="text-xs text-gray-400">Inicio: {formatDate(m.started_at)}</p>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[m.status]}`}>
                  {STATUS_LABEL[m.status]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Todas las misiones */}
      {missions.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Historial reciente
          </h2>
          <ul className="divide-y divide-gray-200 rounded-xl border border-gray-200 bg-white shadow-sm">
            {missions.slice(0, 10).map((m) => (
              <li key={m.id} className="flex items-center justify-between px-4 py-3">
                <p className="text-sm text-gray-700">{m.name}</p>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[m.status]}`}>
                  {STATUS_LABEL[m.status]}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function AlertsSummary() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    alertsApi.list()
      .then(setAlerts)
      .catch(() => setAlerts([]))
      .finally(() => setIsLoading(false));
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-gray-500">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
        Cargando alertas…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <StatCard
          label="Alertas pendientes"
          value={alerts.filter((a) => a.status === "generated").length}
          color="amber"
        />
        <StatCard label="Total alertas" value={alerts.length} color="blue" />
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Alertas recientes
        </h2>
        {alerts.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-400">
            Sin alertas recientes.
          </p>
        ) : (
          <ul className="divide-y divide-gray-200 rounded-xl border border-gray-200 bg-white shadow-sm">
            {alerts.slice(0, 10).map((a) => (
              <li key={a.id} className="px-4 py-3">
                <div className="flex items-start justify-between">
                  <p className="text-sm text-gray-700 line-clamp-2">
                    {a.message_text || "Alerta sin descripción"}
                  </p>
                  <span className={`ml-2 shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${ALERT_STATUS_COLOR[a.status]}`}>
                    {a.status}
                  </span>
                </div>
                <p className="mt-1 text-xs text-gray-400">
                  {formatDate(a.generated_at)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function FamiliarPanel() {
  return (
    <div className="rounded-xl border border-dashed border-gray-300 p-10 text-center">
      <p className="text-4xl">🔔</p>
      <h2 className="mt-3 text-lg font-semibold text-gray-700">
        Panel de notificaciones
      </h2>
      <p className="mt-2 text-sm text-gray-400">
        Recibirás una alerta aquí cuando haya novedades sobre el caso.
      </p>
    </div>
  );
}

// ── Tarjeta de estadística ────────────────────────────────────────────────────

const COLOR_MAP: Record<string, string> = {
  green: "bg-green-50 text-green-700 border-green-200",
  blue:  "bg-blue-50  text-blue-700  border-blue-200",
  gray:  "bg-gray-50  text-gray-600  border-gray-200",
  amber: "bg-amber-50 text-amber-700 border-amber-200",
};

function StatCard({
  label, value, color,
}: {
  label: string; value: number; color: string;
}) {
  return (
    <div className={`rounded-xl border px-4 py-5 ${COLOR_MAP[color] ?? COLOR_MAP.gray}`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="mt-0.5 text-xs font-medium opacity-80">{label}</p>
    </div>
  );
}

// ── Vista diferenciada por rol ────────────────────────────────────────────────

const HEADING: Record<RoleName, string> = {
  admin:    "Panel de administración",
  buscador: "Panel de operaciones",
  ayudante: "Panel de ayudante",
  familiar: "Mis notificaciones",
};

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  if (!user) return null;

  const role = user.role;

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">{HEADING[role]}</h1>
        <p className="mt-1 text-sm text-gray-500">
          Bienvenido, {user.full_name}
        </p>
      </header>

      {(role === "admin" || role === "buscador") && <MissionsSummary />}
      {role === "ayudante" && <AlertsSummary />}
      {role === "familiar" && <FamiliarPanel />}
    </div>
  );
}

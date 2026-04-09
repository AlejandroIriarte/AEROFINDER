// =============================================================================
// AEROFINDER Frontend — Página de detalle de misión
// Layout dos paneles: mapa 70% | stream HLS + alertas 30%
// Acceso: admin, buscador, ayudante (familiar redirigido al dashboard)
// =============================================================================

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import type { RoleName, Mission, Alert, Drone } from "@/lib/types";
import { MissionMap } from "@/components/map/MissionMap";
import { DroneStream } from "@/components/video/DroneStream";

// ── Props de página Next.js App Router ───────────────────────────────────────

interface PageProps {
  params: { id: string };
}

// ── Helpers de fetch (server-side) ───────────────────────────────────────────

async function getMission(id: string, token: string): Promise<Mission | null> {
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/missions/${id}`,
      { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }
    );
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

async function getDrone(droneId: string, token: string): Promise<Drone | null> {
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/drones/${droneId}`,
      { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }
    );
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

async function getRecentAlerts(missionId: string, token: string): Promise<Alert[]> {
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/alerts/?mission_id=${missionId}&limit=10`,
      { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : (data.items ?? []);
  } catch {
    return [];
  }
}

// ── Helpers de presentación ───────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  planned:     "Planificada",
  active:      "Activa",
  paused:      "Pausada",
  completed:   "Completada",
  interrupted: "Interrumpida",
  cancelled:   "Cancelada",
};

const STATUS_COLOR: Record<string, string> = {
  planned:     "bg-gray-100 text-gray-600",
  active:      "bg-green-100 text-green-700",
  paused:      "bg-amber-100 text-amber-700",
  completed:   "bg-blue-100 text-blue-700",
  interrupted: "bg-orange-100 text-orange-700",
  cancelled:   "bg-red-100 text-red-600",
};

const ALERT_LEVEL_LABEL: Record<string, string> = {
  full:              "Coincidencia confirmada",
  partial:           "Coincidencia probable",
  confirmation_only: "Posible coincidencia",
};

const ALERT_LEVEL_COLOR: Record<string, string> = {
  full:              "text-red-700 bg-red-50 border border-red-200",
  partial:           "text-orange-700 bg-orange-50 border border-orange-200",
  confirmation_only: "text-amber-700 bg-amber-50 border border-amber-200",
};

// ── Página ────────────────────────────────────────────────────────────────────

export default async function MissionDetailPage({ params }: PageProps) {
  const cookieStore  = cookies();
  const accessToken  = cookieStore.get("aerofinder_access")?.value ?? "";

  const mission = await getMission(params.id, accessToken);
  if (!mission) redirect("/dashboard");

  // Inferir rol desde cookie (el middleware JWT es la barrera real)
  let userRole: RoleName = "buscador";
  try {
    const roleCookie = cookieStore.get("aerofinder_role")?.value;
    if (roleCookie && ["admin", "buscador", "ayudante", "familiar"].includes(roleCookie)) {
      userRole = roleCookie as RoleName;
    }
  } catch { /* sin cookie de rol */ }

  if (userRole === "familiar") redirect("/dashboard");

  // El drone_id viene en la misión como campo extra del backend
  const droneId: string = (mission as unknown as { drone_id?: string }).drone_id ?? "";

  // Fetch en paralelo: dron y alertas
  const [drone, recentAlerts] = await Promise.all([
    droneId ? getDrone(droneId, accessToken) : Promise.resolve(null),
    getRecentAlerts(params.id, accessToken),
  ]);

  const streamKey = drone?.rtmp_stream_key ?? null;

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* Encabezado compacto */}
      <div className="flex shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-6 py-3">
        <div className="flex-1 min-w-0">
          <h1 className="truncate text-lg font-semibold text-gray-900">{mission.name}</h1>
          {mission.description && (
            <p className="truncate text-xs text-gray-500">{mission.description}</p>
          )}
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
            STATUS_COLOR[mission.status] ?? "bg-gray-100 text-gray-600"
          }`}
        >
          {STATUS_LABEL[mission.status] ?? mission.status}
        </span>
      </div>

      {/* Cuerpo: mapa 70% + panel derecho 30% */}
      <div className="flex flex-1 overflow-hidden">
        {/* Mapa */}
        <div className="relative h-full" style={{ width: "70%" }}>
          {droneId ? (
            <MissionMap
              missionId={params.id}
              droneId={droneId}
              userRole={userRole}
            />
          ) : (
            <div className="flex h-full items-center justify-center bg-gray-50">
              <div className="text-center">
                <p className="text-sm text-gray-500">Sin dron asignado a esta misión</p>
                <p className="mt-1 text-xs text-gray-400">
                  Asigna un dron para ver el mapa en tiempo real
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Panel derecho */}
        <div
          className="flex h-full flex-col overflow-hidden border-l border-gray-200 bg-white"
          style={{ width: "30%" }}
        >
          {/* Stream de video HLS */}
          <div className="shrink-0 border-b border-gray-100">
            {streamKey && droneId ? (
              <DroneStream
                streamKey={streamKey}
                droneId={droneId}
                userRole={userRole}
                className="h-44 w-full"
              />
            ) : (
              <div className="flex h-44 items-center justify-center bg-gray-900">
                <div className="text-center">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="mx-auto mb-2 h-8 w-8 text-gray-600"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  >
                    <path d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"/>
                  </svg>
                  <p className="text-xs text-gray-500">
                    {droneId ? "Sin stream configurado" : "Sin dron asignado"}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Info del dron */}
          {drone && (
            <div className="shrink-0 border-b border-gray-100 px-4 py-2.5">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                Dron
              </p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
                <span className="text-gray-500">Modelo</span>
                <span className="truncate font-medium">{drone.model}</span>
                <span className="text-gray-500">Estado</span>
                <span className="font-medium capitalize">{drone.status.replace(/_/g, " ")}</span>
              </div>
            </div>
          )}

          {/* Info de la misión */}
          <div className="shrink-0 border-b border-gray-100 px-4 py-2.5">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
              Misión
            </p>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
              {mission.started_at && (
                <>
                  <dt className="text-gray-500">Inicio</dt>
                  <dd className="font-medium">
                    {new Date(mission.started_at).toLocaleString("es-BO", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </dd>
                </>
              )}
              {mission.planned_at && !mission.started_at && (
                <>
                  <dt className="text-gray-500">Planificada</dt>
                  <dd className="font-medium">
                    {new Date(mission.planned_at).toLocaleString("es-BO", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </dd>
                </>
              )}
              {mission.search_area && (
                <>
                  <dt className="text-gray-500">Área</dt>
                  <dd className="font-medium">Definida</dd>
                </>
              )}
            </dl>
          </div>

          {/* Alertas recientes */}
          <div className="flex-1 overflow-y-auto px-4 py-2.5">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
              Alertas recientes
            </p>
            {recentAlerts.length === 0 ? (
              <p className="text-xs text-gray-400">Sin alertas registradas</p>
            ) : (
              <ul className="space-y-2">
                {recentAlerts.map((alert) => (
                  <li
                    key={alert.id}
                    className={`rounded-md px-3 py-2 text-xs ${
                      ALERT_LEVEL_COLOR[alert.content_level] ?? "bg-gray-50 text-gray-700 border border-gray-100"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-semibold leading-tight">
                        {ALERT_LEVEL_LABEL[alert.content_level] ?? alert.content_level}
                      </span>
                      <span className="shrink-0 text-[10px] opacity-60">
                        {new Date(alert.generated_at).toLocaleTimeString("es-BO", {
                          hour:   "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    {alert.message_text && (
                      <p className="mt-0.5 opacity-80 line-clamp-2">{alert.message_text}</p>
                    )}
                    <p className="mt-0.5 text-[10px] capitalize opacity-50">
                      Estado: {alert.status}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

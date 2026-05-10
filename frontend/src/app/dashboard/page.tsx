// =============================================================================
// AEROFINDER — Dashboard principal con datos reales del backend
// admin/buscador: KPIs + misiones + feed WS + detecciones + alertas + drones + field reports
// ayudante: alertas recientes
// familiar: redirect a /dashboard/familiar
// =============================================================================

"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import { useDashboardData } from "@/hooks/useDashboardData";
import { KpiCard }         from "@/components/dashboard/KpiCard";
import { SectionCard }     from "@/components/dashboard/SectionCard";
import { PageHeader }      from "@/components/dashboard/PageHeader";
import { MissionRow }      from "@/components/dashboard/MissionRow";
import { AlertRow }        from "@/components/dashboard/AlertRow";
import { DetectionRow }    from "@/components/dashboard/DetectionRow";
import { DroneStatusRow }  from "@/components/dashboard/DroneStatusRow";
import { FieldReportRow }  from "@/components/dashboard/FieldReportRow";
import { LiveFeed }        from "@/components/dashboard/LiveFeed";
import type { FeedEvent }  from "@/components/dashboard/LiveFeed";
import { useWebSocket }    from "@/lib/websocket";
import type { RoleName }   from "@/lib/types";

// ── Íconos SVG inline ────────────────────────────────────────────────────────

const IcoMissions = () => (
  <svg viewBox="0 0 24 24" className="h-[15px] w-[15px] stroke-current fill-none flex-shrink-0" strokeWidth={2}>
    <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
    <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
  </svg>
);
const IcoDrones = () => (
  <svg viewBox="0 0 24 24" className="h-[15px] w-[15px] stroke-current fill-none flex-shrink-0" strokeWidth={2}>
    <circle cx="12" cy="12" r="3"/>
    <path d="M5 5l3 3M19 5l-3 3M5 19l3-3M19 19l-3-3"/>
    <circle cx="5" cy="5" r="2"/><circle cx="19" cy="5" r="2"/>
    <circle cx="5" cy="19" r="2"/><circle cx="19" cy="19" r="2"/>
  </svg>
);
const IcoAlerts = () => (
  <svg viewBox="0 0 24 24" className="h-[15px] w-[15px] stroke-current fill-none flex-shrink-0" strokeWidth={2}>
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
    <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>
);
const IcoDetections = () => (
  <svg viewBox="0 0 24 24" className="h-[15px] w-[15px] stroke-current fill-none flex-shrink-0" strokeWidth={2}>
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
  </svg>
);
const IcoReports = () => (
  <svg viewBox="0 0 24 24" className="h-[15px] w-[15px] stroke-current fill-none flex-shrink-0" strokeWidth={2}>
    <path d="M9 11l3 3L22 4"/>
    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
  </svg>
);
const IcoUsers = () => (
  <svg viewBox="0 0 24 24" className="h-[15px] w-[15px] stroke-current fill-none flex-shrink-0" strokeWidth={2}>
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
);

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(): string {
  return new Date().toLocaleDateString("es-BO", {
    weekday: "long", day: "2-digit", month: "long",
  });
}

// ── Vista admin/buscador ──────────────────────────────────────────────────────

function AdminBuscadorDashboard({ role }: { role: "admin" | "buscador" }) {
  const {
    missions, drones, alerts, detectionsToday,
    fieldReportsPending, usersActive, isLoading, error, reload,
  } = useDashboardData();

  const [feedEvents, setFeedEvents]         = useState<FeedEvent[]>([]);
  const [pendingReports, setPendingReports] = useState(fieldReportsPending);
  const accessToken = useAuthStore((s) => s.accessToken);

  // Sincronizar field reports pendientes cuando carga
  useEffect(() => {
    setPendingReports(fieldReportsPending);
  }, [fieldReportsPending]);

  // WS de la primera misión activa para el feed en vivo
  const firstActiveMission = missions.find((m) => m.status === "active");
  const wsBase = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000";
  const wsUrl = firstActiveMission && accessToken
    ? `${wsBase}/ws/missions/${firstActiveMission.id}?token=${accessToken}`
    : null;

  const handleWsMessage = useCallback((msg: Record<string, unknown>) => {
    const type = msg.type as FeedEvent["type"];
    if (!["detection", "alert", "telemetry", "mission_update"].includes(type)) return;

    let message = "";
    if (type === "detection") {
      const yolo = typeof msg.yolo_confidence === "number" ? Math.round(msg.yolo_confidence * 100) : "?";
      const face = typeof msg.facenet_similarity === "number" ? Math.round(msg.facenet_similarity * 100) : "?";
      message = `YOLO ${yolo}% · FaceNet ${face}%`;
    } else if (type === "alert") {
      message = (msg.message_text as string) ?? "Alerta generada";
    } else if (type === "telemetry") {
      const lat = typeof msg.lat === "number" ? msg.lat.toFixed(4) : "?";
      const lng = typeof msg.lng === "number" ? msg.lng.toFixed(4) : "?";
      const bat = msg.battery_pct != null ? ` · bat ${msg.battery_pct}%` : "";
      message = `GPS (${lat}, ${lng})${bat}`;
    } else {
      message = (msg.status as string) ?? "Actualización de misión";
    }

    setFeedEvents((prev) => [
      ...prev.slice(-49),
      { type, message, timestamp: Date.now() },
    ]);
  }, []);

  useWebSocket(wsUrl, handleWsMessage);

  // Datos derivados
  const activeMissions  = missions.filter((m) => m.status === "active");
  const flyingDrones    = drones.filter((d) => d.status === "in_mission");
  const generatedAlerts = alerts.filter((a) => a.status === "generated");
  const recentAlerts    = alerts.slice(0, 5);
  const recentDets      = detectionsToday.slice(0, 5);
  const displayDrones   = drones.filter((d) => d.status !== "out_of_service").slice(0, 5);

  const handleReportResolved = (id: string) => {
    setPendingReports((prev) => prev.filter((r) => r.id !== id));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-400">
        <div className="text-center">
          <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-500" />
          <p className="text-sm">Cargando datos…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-sm text-red-700">{error}</p>
        <button onClick={reload} className="mt-3 rounded-lg bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700">
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* KPI row */}
      <div className={`mb-5 grid gap-3 ${role === "admin" ? "grid-cols-6" : "grid-cols-4"}`}>
        <KpiCard icon={<IcoMissions />}   value={activeMissions.length}  label="Misiones activas"  iconBg="green"  trend={`${missions.length} total`}    trendColor="slate" />
        <KpiCard icon={<IcoDrones />}     value={flyingDrones.length}    label="Drones volando"    iconBg="blue"   trend={`${drones.length} registrados`} trendColor="slate" />
        <KpiCard icon={<IcoAlerts />}     value={generatedAlerts.length} label="Alertas generadas" iconBg="red"    trend={generatedAlerts.length > 0 ? "sin revisar" : "al día"} trendColor={generatedAlerts.length > 0 ? "amber" : "green"} />
        <KpiCard icon={<IcoDetections />} value={detectionsToday.length} label="Detecciones hoy"   iconBg="amber"  trend="hoy"                            trendColor="slate" />
        {role === "admin" && <>
          <KpiCard icon={<IcoReports />} value={pendingReports.length}  label="Field reports"     iconBg="violet" trend={pendingReports.length > 0 ? "pendientes" : "al día"} trendColor={pendingReports.length > 0 ? "amber" : "green"} />
          <KpiCard icon={<IcoUsers />}   value={usersActive.length}     label="Usuarios activos"  iconBg="slate"  trend="activos"                        trendColor="slate" />
        </>}
      </div>

      {/* Grid principal: misiones + feed WS */}
      <div className="mb-4 grid grid-cols-[1fr_320px] gap-4">
        <SectionCard title="Misiones activas" icon={<IcoMissions />} linkHref="/dashboard/missions">
          {activeMissions.length === 0 ? (
            <p className="px-4 py-6 text-center text-[12px] text-slate-400">No hay misiones activas.</p>
          ) : (
            activeMissions.slice(0, 6).map((m) => <MissionRow key={m.id} mission={m} />)
          )}
        </SectionCard>

        <SectionCard title="Feed en vivo" icon={<span className="live-dot" />}>
          <LiveFeed events={feedEvents} maxHeight="240px" />
        </SectionCard>
      </div>

      {/* Grid secundario: detecciones + alertas + drones */}
      <div className="mb-4 grid grid-cols-3 gap-4">
        <SectionCard title="Detecciones recientes" icon={<IcoDetections />} linkHref="/dashboard/detections">
          {recentDets.length === 0 ? (
            <p className="px-4 py-5 text-center text-[12px] text-slate-400">Sin detecciones hoy.</p>
          ) : (
            recentDets.map((d) => <DetectionRow key={d.id} detection={d} />)
          )}
        </SectionCard>

        <SectionCard title="Alertas pendientes" icon={<IcoAlerts />} linkHref="/dashboard/alerts" badge={generatedAlerts.length}>
          {recentAlerts.length === 0 ? (
            <p className="px-4 py-5 text-center text-[12px] text-slate-400">Sin alertas recientes.</p>
          ) : (
            recentAlerts.map((a) => <AlertRow key={a.id} alert={a} />)
          )}
        </SectionCard>

        <SectionCard title="Estado de flota" icon={<IcoDrones />} linkHref="/dashboard/drones">
          {displayDrones.length === 0 ? (
            <p className="px-4 py-5 text-center text-[12px] text-slate-400">Sin drones registrados.</p>
          ) : (
            displayDrones.map((d) => <DroneStatusRow key={d.id} drone={d} />)
          )}
        </SectionCard>
      </div>

      {/* Field reports — solo admin */}
      {role === "admin" && pendingReports.length > 0 && (
        <SectionCard
          title="Field reports — pendientes de revisión"
          icon={<IcoReports />}
          linkHref="/dashboard/admin/pending-review"
          badge={pendingReports.length}
        >
          <div className="grid grid-cols-2">
            {pendingReports.slice(0, 4).map((r) => (
              <FieldReportRow key={r.id} report={r} onResolved={handleReportResolved} />
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}

// ── Vista ayudante ────────────────────────────────────────────────────────────

function AyudanteDashboard() {
  const { alerts, isLoading, error, reload } = useDashboardData();
  const generatedAlerts = alerts.filter((a) => a.status === "generated");

  if (isLoading) return (
    <div className="flex items-center justify-center py-24 text-slate-400">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-500" />
    </div>
  );

  if (error) return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
      <p className="text-sm text-red-700">{error}</p>
      <button onClick={reload} className="mt-3 rounded-lg bg-red-600 px-4 py-2 text-sm text-white">Reintentar</button>
    </div>
  );

  return (
    <div>
      <div className="mb-5 grid grid-cols-2 gap-3">
        <KpiCard icon={<IcoAlerts />} value={generatedAlerts.length} label="Alertas pendientes" iconBg="red"  trend={generatedAlerts.length > 0 ? "sin revisar" : "al día"} trendColor={generatedAlerts.length > 0 ? "amber" : "green"} />
        <KpiCard icon={<IcoAlerts />} value={alerts.length}          label="Total alertas"      iconBg="blue" trend="total" trendColor="slate" />
      </div>
      <SectionCard title="Alertas recientes" icon={<IcoAlerts />} linkHref="/dashboard/alerts">
        {alerts.length === 0 ? (
          <p className="px-4 py-6 text-center text-[12px] text-slate-400">Sin alertas recientes.</p>
        ) : (
          alerts.slice(0, 10).map((a) => <AlertRow key={a.id} alert={a} />)
        )}
      </SectionCard>
    </div>
  );
}

// ── Dashboard principal ───────────────────────────────────────────────────────

const HEADING: Record<RoleName, string> = {
  admin:    "Panel de administración",
  buscador: "Panel de operaciones",
  ayudante: "Panel de ayudante",
  familiar: "Mis notificaciones",
};

export default function DashboardPage() {
  const router = useRouter();
  const user   = useAuthStore((s) => s.user);

  useEffect(() => {
    if (user?.role === "familiar") router.replace("/dashboard/familiar");
  }, [user, router]);

  if (!user || user.role === "familiar") return null;

  return (
    <div className="p-5">
      <PageHeader
        title={HEADING[user.role]}
        subtitle={`${user.full_name} · ${formatDate()}`}
      >
        {(user.role === "admin" || user.role === "buscador") && (
          <a
            href="/dashboard/missions"
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-[12px] font-semibold text-white hover:bg-blue-700 transition-colors"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 stroke-white fill-none" strokeWidth={2.5}>
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Nueva misión
          </a>
        )}
      </PageHeader>

      {(user.role === "admin" || user.role === "buscador") && (
        <AdminBuscadorDashboard role={user.role as "admin" | "buscador"} />
      )}
      {user.role === "ayudante" && <AyudanteDashboard />}
    </div>
  );
}

// =============================================================================
// AEROFINDER — Super Admin / Infraestructura
// Estado en tiempo real de Redis, MinIO, MediaMTX y AI Worker.
// Auto-refresh cada 30 s.
// =============================================================================

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RoleGuard } from "@/components/ui/RoleGuard";
import { superadminApi } from "@/lib/api";
import type { InfraHealth } from "@/lib/types";

const REFRESH_INTERVAL = 30; // segundos

type ServiceKey = "redis" | "minio" | "mediamtx" | "ai_worker"; // pragma: allowlist secret

const SERVICE_META: Record<ServiceKey, { label: string; description: string; icon: React.ReactNode }> = {
  redis: {
    label:       "Redis",
    description: "Streams de telemetría, detecciones y notificaciones",
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.6}>
        <path d="M4 7h16M4 12h16M4 17h16" />
      </svg>
    ),
  },
  minio: {
    label:       "MinIO",
    description: "Almacenamiento de fotos y archivos de personas",
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.6}>
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      </svg>
    ),
  },
  mediamtx: {
    label:       "MediaMTX",
    description: "Ingesta RTMP de drones y distribución HLS/RTSP",
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.6}>
        <polygon points="23 7 16 12 23 17 23 7" />
        <rect x="1" y="5" width="15" height="14" rx="2" />
      </svg>
    ),
  },
  ai_worker: {
    label:       "AI Worker",
    description: "YOLO + FaceNet · detección y reconocimiento facial",
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.6}>
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <line x1="8" y1="21" x2="16" y2="21" />
        <line x1="12" y1="17" x2="12" y2="21" />
      </svg>
    ),
  },
};

const STATUS_CONFIG = {
  ok:      { bg: "bg-green-50",  border: "border-green-200",  dot: "bg-green-500",  text: "text-green-700",  label: "Operativo"   },
  stale:   { bg: "bg-amber-50",  border: "border-amber-200",  dot: "bg-amber-500",  text: "text-amber-700",  label: "Desactualizado" },
  error:   { bg: "bg-red-50",    border: "border-red-200",    dot: "bg-red-500",    text: "text-red-700",    label: "Error"       },
  unknown: { bg: "bg-slate-50",  border: "border-slate-200",  dot: "bg-slate-400",  text: "text-slate-600",  label: "Desconocido" },
};

function ServiceCard({
  serviceKey,
  health,
}: {
  serviceKey: ServiceKey;
  health: InfraHealth[ServiceKey];
}) {
  const meta   = SERVICE_META[serviceKey];
  const st     = STATUS_CONFIG[health.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.unknown;

  return (
    <div className={`rounded-xl border ${st.border} ${st.bg} p-5 shadow-sm`}>
      <div className="flex items-start justify-between gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg bg-white border ${st.border} ${st.text}`}>
          {meta.icon}
        </div>
        <span className={`rounded-full border ${st.border} px-2.5 py-1 text-[10px] font-semibold ${st.text}`}>
          <span className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${st.dot}`} />
          {st.label}
        </span>
      </div>

      <h3 className="mt-3 text-sm font-bold text-gray-900">{meta.label}</h3>
      <p className="mt-0.5 text-[11px] text-gray-500">{meta.description}</p>

      {health.detail && (
        <p className={`mt-3 rounded-md bg-white/70 px-3 py-2 text-[11px] font-medium ${st.text}`}>
          {health.detail}
        </p>
      )}

      {health.latency_ms != null && (
        <p className="mt-2 text-[10px] text-gray-400 tabular-nums">
          Latencia: <span className="font-semibold text-gray-600">{health.latency_ms} ms</span>
        </p>
      )}
    </div>
  );
}

export default function InfrastructurePage() {
  const [health,      setHealth]      = useState<InfraHealth | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(false);
  const [lastUpdate,  setLastUpdate]  = useState<Date | null>(null);
  const [countdown,   setCountdown]   = useState(REFRESH_INTERVAL);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const h = await superadminApi.health();
      setHealth(h);
      setLastUpdate(new Date());
      setCountdown(REFRESH_INTERVAL);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-refresh
  useEffect(() => {
    load();
    timerRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) { load(); return REFRESH_INTERVAL; }
        return c - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [load]);

  const serviceKeys: ServiceKey[] = ["redis", "minio", "mediamtx", "ai_worker"];
  const okCount = health ? serviceKeys.filter(k => health[k].status === "ok").length : 0;
  const allOk   = okCount === serviceKeys.length;

  return (
    <RoleGuard allowedRoles={["admin", "super_admin"]}>
      <div className="p-6 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Infraestructura</h1>
            <p className="text-xs text-gray-400 mt-0.5">
              {lastUpdate
                ? `Actualizado ${lastUpdate.toLocaleTimeString("es-BO")} · próxima actualización en ${countdown} s`
                : "Cargando…"}
            </p>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            {loading ? "Cargando…" : "Actualizar ahora"}
          </button>
        </div>

        {/* Estado global */}
        <div className={`rounded-xl border p-4 flex items-center gap-3 ${
          allOk ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"
        }`}>
          <span className={`text-2xl font-bold ${allOk ? "text-green-700" : "text-amber-700"}`}>
            {okCount}/{serviceKeys.length}
          </span>
          <div>
            <p className={`text-sm font-semibold ${allOk ? "text-green-800" : "text-amber-800"}`}>
              {allOk ? "Todos los servicios operativos" : `${serviceKeys.length - okCount} servicio(s) con problemas`}
            </p>
            <p className={`text-xs ${allOk ? "text-green-600" : "text-amber-600"}`}>
              {allOk ? "Sistema funcionando con normalidad" : "Revisar servicios marcados en rojo o naranja"}
            </p>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            Error al obtener estado de infraestructura. Verifica la conexión al backend.
          </div>
        )}

        {/* Tarjetas de servicios */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {health
            ? serviceKeys.map((k) => (
                <ServiceCard key={k} serviceKey={k} health={health[k]} />
              ))
            : serviceKeys.map((k) => (
                <div key={k} className="h-36 animate-pulse rounded-xl border border-gray-200 bg-gray-100" />
              ))}
        </div>

      </div>
    </RoleGuard>
  );
}

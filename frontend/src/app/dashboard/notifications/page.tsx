// Feed de alertas face_match en tiempo real via WebSocket. Solo rol "familiar".
"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import { useWebSocket } from "@/lib/websocket";
import { AlertCard } from "@/components/alerts/AlertCard";
import { missionsApi } from "@/lib/api";
import type { DetectionWSMessage } from "@/components/map/DetectionMarker";
import type { Mission } from "@/lib/types";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

/* ---------- empty state: sin misión activa ---------- */
function NoMissionEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-6">
      {/* Hero card */}
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 via-blue-600 to-blue-500 p-8 text-center text-white shadow-xl">
        {/* Círculos decorativos */}
        <div className="pointer-events-none absolute -top-12 -right-12 h-40 w-40 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute -bottom-8 -left-8 h-28 w-28 rounded-full bg-white/10" />

        {/* Ilustración drone buscando */}
        <div className="relative mx-auto mb-5 flex h-24 w-24 items-center justify-center">
          <div className="absolute inset-0 rounded-full bg-white/20 animate-ping" style={{ animationDuration: "2.5s" }} />
          <div className="absolute inset-2 rounded-full bg-white/20" />
          <svg viewBox="0 0 64 64" fill="none" className="relative h-14 w-14" xmlns="http://www.w3.org/2000/svg">
            {/* Cuerpo dron */}
            <rect x="20" y="24" width="24" height="12" rx="6" fill="white" opacity="0.95"/>
            {/* Ojo/cámara */}
            <circle cx="32" cy="30" r="3.5" fill="#3B82F6"/>
            <circle cx="32" cy="30" r="1.5" fill="white"/>
            {/* Hélices */}
            <ellipse cx="16" cy="23" rx="6" ry="2.5" fill="white" opacity="0.7"/>
            <ellipse cx="48" cy="23" rx="6" ry="2.5" fill="white" opacity="0.7"/>
            <ellipse cx="16" cy="37" rx="6" ry="2.5" fill="white" opacity="0.7"/>
            <ellipse cx="48" cy="37" rx="6" ry="2.5" fill="white" opacity="0.7"/>
            {/* Brazos */}
            <line x1="20" y1="26" x2="16" y2="23" stroke="white" strokeWidth="2" opacity="0.6"/>
            <line x1="44" y1="26" x2="48" y2="23" stroke="white" strokeWidth="2" opacity="0.6"/>
            <line x1="20" y1="34" x2="16" y2="37" stroke="white" strokeWidth="2" opacity="0.6"/>
            <line x1="44" y1="34" x2="48" y2="37" stroke="white" strokeWidth="2" opacity="0.6"/>
            {/* Haz de búsqueda */}
            <path d="M28 36 L24 50 M36 36 L40 50" stroke="#FDE68A" strokeWidth="1.5" strokeDasharray="2 2" opacity="0.9"/>
          </svg>
        </div>

        <h2 className="text-[18px] font-bold">Sin búsquedas activas</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-blue-100">
          Para recibir notificaciones en tiempo real de nuestros drones,
          primero registrá a tu ser querido desaparecido.
        </p>

        <Link
          href="/dashboard/familiar/report"
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-white px-6 py-2.5 text-[13px] font-bold text-blue-600 shadow-md hover:bg-blue-50 transition-all hover:-translate-y-0.5"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Registrar persona desaparecida
        </Link>
      </div>

      {/* Cómo funciona */}
      <div className="mt-6 w-full max-w-lg">
        <p className="mb-3 text-center text-[11px] font-semibold uppercase tracking-widest text-slate-400">
          ¿Cómo funciona?
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            {
              icon: (
                <svg className="h-5 w-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              ),
              title: "Completás el reporte",
              desc: "Datos, fotos y zona de desaparición",
            },
            {
              icon: (
                <svg className="h-5 w-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z" />
                </svg>
              ),
              title: "Revisión en 24 h",
              desc: "Nuestro equipo aprueba y activa la misión",
            },
            {
              icon: (
                <svg className="h-5 w-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
              ),
              title: "Recibís alertas aquí",
              desc: "Notificación inmediata si el drone detecta a tu familiar",
            },
          ].map((step) => (
            <div
              key={step.title}
              className="flex flex-col items-center rounded-xl border border-slate-200 bg-white p-4 text-center shadow-sm"
            >
              <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-slate-50">
                {step.icon}
              </div>
              <p className="text-[12px] font-semibold text-slate-800">{step.title}</p>
              <p className="mt-1 text-[11px] leading-snug text-slate-500">{step.desc}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 text-center">
          <Link
            href="/dashboard/familiar"
            className="text-[12px] text-blue-500 hover:underline"
          >
            Ver mis casos reportados →
          </Link>
        </div>
      </div>
    </div>
  );
}

/* ---------- empty state: misión existe pero sin alertas ---------- */
function SearchingEmptyState({ missionName }: { missionName?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-blue-200 bg-gradient-to-b from-blue-50 to-slate-50 py-16 text-center">
      {/* Radar animado */}
      <div className="relative mb-5 flex h-20 w-20 items-center justify-center">
        <div className="absolute inset-0 rounded-full border-2 border-blue-200 animate-ping opacity-30" style={{ animationDuration: "1.5s" }} />
        <div className="absolute inset-2 rounded-full border-2 border-blue-300 animate-ping opacity-40" style={{ animationDuration: "1.5s", animationDelay: "0.3s" }} />
        <div className="absolute inset-4 rounded-full border-2 border-blue-400 animate-ping opacity-50" style={{ animationDuration: "1.5s", animationDelay: "0.6s" }} />
        <div className="relative flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 shadow-md shadow-blue-200">
          <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803 7.5 7.5 0 0015.803 15.803z" />
          </svg>
        </div>
      </div>
      <p className="text-[15px] font-bold text-slate-800">
        {missionName ? `"${missionName}"` : "Búsqueda"} en curso
      </p>
      <p className="mt-1.5 max-w-xs text-[12px] leading-relaxed text-slate-400">
        Los drones están escaneando el área. Te notificaremos aquí al instante si detectamos a tu familiar.
      </p>
      <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-green-50 px-4 py-1.5 text-[11px] font-medium text-green-700 ring-1 ring-green-200">
        <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
        Sistema de reconocimiento activo
      </div>
    </div>
  );
}

/* ---------- página principal ---------- */
export default function NotificationsPage() {
  const router    = useRouter();
  const user      = useAuthStore((s) => s.user);
  const isLoading = useAuthStore((s) => s.isLoading);

  const [mission,      setMission]      = useState<Mission | null>(null);
  const [missionId,    setMissionId]    = useState<string | null>(null);
  const [alerts,       setAlerts]       = useState<DetectionWSMessage[]>([]);
  const [loadingMission, setLoadingMission] = useState(true);

  // Protección client-side: solo familiar
  useEffect(() => {
    if (!isLoading && user && user.role !== "familiar") {
      router.replace("/dashboard");
    }
  }, [isLoading, user, router]);

  // Buscar la misión activa asociada a este familiar
  useEffect(() => {
    if (!user || user.role !== "familiar") return;
    let cancelled = false;

    missionsApi.list().then((missions) => {
      if (cancelled) return;
      const active = missions.find((m) => m.status === "active") ?? missions[0] ?? null;
      setMission(active ?? null);
      setMissionId(active?.id ?? null);
    }).catch(() => { /* sin misión disponible */ })
      .finally(() => { if (!cancelled) setLoadingMission(false); });

    return () => { cancelled = true; };
  }, [user]);

  // WebSocket de misión
  const wsBase = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000";
  const wsUrl  = missionId ? `${wsBase}/ws/missions/${missionId}` : null;

  const handleWsMessage = useCallback((raw: unknown) => {
    const msg = raw as { type: string } & DetectionWSMessage;
    if (
      (msg.type === "alert" || msg.type === "detection") &&
      msg.detection_type === "face_match"
    ) {
      const safeMsg: DetectionWSMessage = {
        ...msg,
        gps: { lat: 0, lng: 0, altitude_m: null },
      };
      setAlerts((prev) => {
        if (prev.some((a) => a.detection_id === msg.detection_id)) return prev;
        return [safeMsg, ...prev].slice(0, 50);
      });
    }
  }, []);

  const { isConnected } = useWebSocket(wsUrl, handleWsMessage);

  if (isLoading || !user) return null;
  if (user.role !== "familiar") return null;

  const personName = mission
    ? (mission as unknown as { missing_person_name?: string }).missing_person_name
    : null;

  return (
    <div className="p-5">
      <PageHeader
        title={personName ? `Búsqueda de ${personName}` : "Notificaciones"}
        subtitle={mission ? mission.name : "Alertas de reconocimiento facial en tiempo real"}
      >
        <div className="flex items-center gap-2">
          {mission && (
            <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${
              mission.status === "active"
                ? "bg-green-100 text-green-700"
                : "bg-slate-100 text-slate-500"
            }`}>
              {mission.status === "active" ? "Activa" : "Inactiva"}
            </span>
          )}
          {mission && (
            isConnected ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-1 text-[10px] font-medium text-green-700 ring-1 ring-green-200">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                En vivo
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-[10px] font-medium text-red-600 ring-1 ring-red-200">
                <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                Reconectando…
              </span>
            )
          )}
        </div>
      </PageHeader>

      {/* Contenido principal */}
      {loadingMission ? (
        <div className="flex justify-center py-16"><LoadingSpinner /></div>
      ) : !mission ? (
        <NoMissionEmptyState />
      ) : alerts.length === 0 ? (
        <SearchingEmptyState missionName={mission.name} />
      ) : (
        <div className="space-y-3">
          <p className="text-[11px] text-slate-400">
            {alerts.length} {alerts.length === 1 ? "coincidencia detectada" : "coincidencias detectadas"}
          </p>
          {alerts.map((alert) => (
            <AlertCard key={alert.detection_id} alert={alert} userRole="familiar" />
          ))}
        </div>
      )}
    </div>
  );
}

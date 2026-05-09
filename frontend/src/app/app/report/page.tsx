"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import { missionsApi, fieldReportsApi } from "@/lib/api";
import type { Mission } from "@/lib/types";

export default function AppReportPage() {
  const user   = useAuthStore((s) => s.user);
  const router = useRouter();
  const [mission,    setMission]    = useState<Mission | null>(null);
  const [notes,      setNotes]      = useState("");
  const [location,   setLocation]   = useState<{ lat: number; lon: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [waiting,    setWaiting]    = useState(false);
  const [reportId,   setReportId]   = useState<string | null>(null);
  const [status,     setStatus]     = useState<"idle" | "pending" | "approved" | "rejected">("idle");

  useEffect(() => {
    if (!user) { router.replace("/login"); return; }
    missionsApi.list()
      .then((ms) => setMission(ms.find((m) => m.status === "active") ?? null))
      .catch(() => {});

    // Capturar ubicación GPS
    navigator.geolocation?.getCurrentPosition(
      (pos) => setLocation({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => {}
    );
  }, [user, router]);

  // Escuchar aprobación/rechazo por WebSocket
  useEffect(() => {
    if (!reportId || !mission) return;
    const token = useAuthStore.getState().accessToken;
    const wsUrl = `${process.env.NEXT_PUBLIC_WS_URL}/ws/missions/${mission.id}?token=${token}`;
    const ws = new WebSocket(wsUrl);
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.report_id !== reportId) return;
        if (msg.type === "field_report_approved") {
          setStatus("approved");
          router.push(`/app/report/photos?report_id=${reportId}&mission_id=${mission.id}`);
        }
        if (msg.type === "field_report_rejected") {
          setStatus("rejected");
          setWaiting(false);
        }
      } catch {
        // ignorar
      }
    };
    return () => ws.close();
  }, [reportId, mission, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!mission) return;
    setSubmitting(true);
    try {
      const result = await fieldReportsApi.create(mission.id, {
        notes: notes || undefined,
        location_lat: location?.lat,
        location_lon: location?.lon,
      });
      setReportId(result.id);
      setStatus("pending");
      setWaiting(true);
    } catch {
      alert("Error al enviar la solicitud. Intenta de nuevo.");
    } finally {
      setSubmitting(false);
    }
  }

  // Esperando aprobación
  if (waiting && status === "pending") {
    return (
      <div className="flex flex-col items-center justify-center gap-6 py-16 text-center">
        <div className="h-16 w-16 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        <div>
          <p className="text-lg font-bold text-gray-900">Solicitud enviada</p>
          <p className="mt-1 text-sm text-gray-500">Esperando aprobación del administrador…</p>
          <p className="mt-3 text-xs text-gray-400">Mantén esta pantalla abierta</p>
        </div>
      </div>
    );
  }

  // Rechazado
  if (status === "rejected") {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-lg font-bold text-red-800">Solicitud rechazada</p>
        <p className="mt-2 text-sm text-red-600">El administrador rechazó la solicitud.</p>
        <button
          onClick={() => { setStatus("idle"); setWaiting(false); setReportId(null); }}
          className="mt-4 rounded-lg bg-red-600 px-6 py-2.5 text-sm font-semibold text-white"
        >
          Intentar de nuevo
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Reportar persona encontrada</h1>
        {mission && <p className="mt-0.5 text-sm text-gray-500">Misión: {mission.name}</p>}
      </div>

      {location && (
        <div className="rounded-lg bg-green-50 px-3 py-2 text-xs text-green-700">
          📍 Ubicación capturada: {location.lat.toFixed(5)}, {location.lon.toFixed(5)}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Notas (opcional)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Descripción de la persona, lugar exacto, condición…"
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <button
          type="submit"
          disabled={submitting || !mission}
          className="w-full rounded-xl bg-red-600 py-4 text-base font-bold text-white shadow-lg hover:bg-red-700 disabled:opacity-50 active:scale-95 transition-transform"
        >
          {submitting ? "Enviando…" : "🚨 Solicitar análisis"}
        </button>
      </form>
    </div>
  );
}

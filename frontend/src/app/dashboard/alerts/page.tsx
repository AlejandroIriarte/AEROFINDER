// Feed de alertas en timeline con WebSocket en vivo. Admin y ayudante.
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import { alertsApi } from "@/lib/api";
import type { Alert, WSMessage } from "@/lib/types";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { AlertRow } from "@/components/dashboard/AlertRow";

type FilterType = "all" | "pending";

export default function AlertsPage() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const router = useRouter();

  const [alerts, setAlerts]     = useState<Alert[]>([]);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState<FilterType>("all");
  const [wsStatus, setWsStatus] = useState<"connecting" | "connected" | "disconnected">("connecting");

  const wsUrl =
    accessToken && typeof window !== "undefined"
      ? `${process.env.NEXT_PUBLIC_WS_URL}/ws/alerts?token=${accessToken}`
      : null;

  useEffect(() => {
    alertsApi.list()
      .then(setAlerts)
      .catch(() => {/* silencioso, WS compensará */})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!wsUrl) return;
    setWsStatus("connecting");

    const ws = new WebSocket(wsUrl);
    ws.onopen = () => setWsStatus("connected");
    ws.onclose = () => setWsStatus("disconnected");
    ws.onerror = () => setWsStatus("disconnected");
    ws.onmessage = (e) => {
      try {
        const msg: WSMessage = JSON.parse(e.data);
        if (msg.type === "alert") {
          setAlerts((prev) => [msg as unknown as Alert, ...prev.slice(0, 99)]);
        }
      } catch { /* ignorar mensajes malformados */ }
    };

    return () => ws.close();
  }, [wsUrl]);

  async function handleConfirm(id: string) {
    await alertsApi.acknowledge(id);
    setAlerts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status: "confirmed" as const } : a))
    );
  }

  async function handleDismiss(id: string) {
    await alertsApi.dismiss(id);
    setAlerts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status: "dismissed" as const } : a))
    );
  }

  const filtered =
    filter === "pending"
      ? alerts.filter((a) => a.status === "generated" || a.status === "sent")
      : alerts;

  const wsIndicator = {
    connecting:   { dot: "bg-amber-400", label: "Conectando…" },
    connected:    { dot: "live-dot",     label: "En vivo" },
    disconnected: { dot: "h-2 w-2 rounded-full bg-red-400", label: "Sin conexión" },
  }[wsStatus];

  return (
    <div className="p-5">
      <PageHeader title="Alertas" subtitle="Detecciones y coincidencias en tiempo real">
        <span className="flex items-center gap-1.5 text-[11px] text-slate-500">
          <span className={wsIndicator.dot} />
          {wsIndicator.label}
        </span>
      </PageHeader>

      {/* Filtros — pills */}
      <div className="mb-4 flex gap-2">
        {(["all", "pending"] as FilterType[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1 text-[12px] font-medium transition-colors ${
              filter === f
                ? "bg-blue-600 text-white"
                : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {f === "all" ? "Todas" : "Solo pendientes"}
          </button>
        ))}
      </div>

      {loading && <LoadingSpinner />}

      {!loading && filtered.length === 0 && (
        <EmptyState
          title="Sin alertas"
          description={
            filter === "pending"
              ? "No hay alertas pendientes."
              : "Las alertas de detección aparecerán aquí en tiempo real."
          }
        />
      )}

      {!loading && filtered.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm divide-y divide-slate-50">
          {filtered.map((alert) => (
            <div key={alert.id} className="flex items-start gap-0">
              <div
                className={`flex-1 ${alert.mission_id ? "cursor-pointer" : ""}`}
                onClick={() => alert.mission_id && router.push(`/dashboard/missions/${alert.mission_id}`)}
                title={alert.mission_id ? "Ver misión" : undefined}
              >
                <AlertRow alert={alert} />
              </div>
              {(alert.status === "generated" || alert.status === "sent") && (
                <div className="flex shrink-0 flex-col gap-1.5 px-4 py-2.5">
                  <button
                    onClick={() => handleConfirm(alert.id)}
                    className="rounded-lg bg-green-100 px-2.5 py-1 text-[10px] font-semibold text-green-700 hover:bg-green-200 transition-colors"
                  >
                    ✓ Confirmar
                  </button>
                  <button
                    onClick={() => handleDismiss(alert.id)}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-medium text-slate-500 hover:bg-slate-50 transition-colors"
                  >
                    Descartar
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

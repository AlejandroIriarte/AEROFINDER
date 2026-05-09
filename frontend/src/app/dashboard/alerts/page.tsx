// Feed de alertas en timeline con WebSocket en vivo. Admin y ayudante.
"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/auth";
import { alertsApi } from "@/lib/api";
import type { Alert, WSMessage } from "@/lib/types";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";

type FilterType = "all" | "pending";

const LEVEL_COLOR: Record<string, string> = {
  full:              "border-l-4 border-red-400 bg-red-50",
  partial:           "border-l-4 border-orange-400 bg-orange-50",
  confirmation_only: "border-l-4 border-amber-400 bg-amber-50",
};

export default function AlertsPage() {
  const accessToken = useAuthStore((s) => s.accessToken);

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
    connecting:   { color: "bg-amber-400", label: "Conectando…" },
    connected:    { color: "bg-green-400 animate-pulse", label: "En vivo" },
    disconnected: { color: "bg-red-400", label: "Sin conexión" },
  }[wsStatus];

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Alertas"
        description="Detecciones y coincidencias en tiempo real"
        action={
          <span className="flex items-center gap-2 text-xs text-gray-500">
            <span className={`h-2 w-2 rounded-full ${wsIndicator.color}`} />
            {wsIndicator.label}
          </span>
        }
      />

      <div className="flex-1 overflow-auto p-6">
        <div className="mb-4 flex gap-2">
          {(["all", "pending"] as FilterType[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                filter === f
                  ? "bg-blue-600 text-white"
                  : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
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
          <div className="space-y-3">
            {filtered.map((alert) => (
              <div
                key={alert.id}
                className={`rounded-xl p-4 shadow-sm ${LEVEL_COLOR[alert.content_level] ?? "border-l-4 border-gray-300 bg-gray-50"}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <StatusBadge value={alert.content_level} domain="alert" />
                      <span className="text-xs text-gray-400">
                        {new Date(alert.generated_at).toLocaleString("es-BO", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </span>
                    </div>
                    {alert.message_text && (
                      <p className="mt-2 text-sm text-gray-700">{alert.message_text}</p>
                    )}
                    <p className="mt-1 text-xs text-gray-400 capitalize">
                      Estado: {alert.status}
                    </p>
                  </div>
                  {(alert.status === "generated" || alert.status === "sent") && (
                    <div className="flex shrink-0 flex-col gap-1.5">
                      <button
                        onClick={() => handleConfirm(alert.id)}
                        className="rounded-lg bg-green-600 px-3 py-1 text-xs font-semibold text-white hover:bg-green-700"
                      >
                        Confirmar
                      </button>
                      <button
                        onClick={() => handleDismiss(alert.id)}
                        className="rounded-lg border border-gray-200 px-3 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100"
                      >
                        Descartar
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

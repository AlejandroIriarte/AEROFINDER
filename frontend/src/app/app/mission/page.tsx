"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/store/auth";
import { missionsApi, pushApi } from "@/lib/api";
import type { Mission } from "@/lib/types";

export default function AppMissionPage() {
  const user = useAuthStore((s) => s.user);
  const router = useRouter();
  const [mission, setMission] = useState<Mission | null>(null);
  const [loading, setLoading] = useState(true);
  const [pushEnabled, setPushEnabled] = useState(false);

  useEffect(() => {
    if (!user) {
      router.replace("/login");
      return;
    }

    missionsApi
      .list()
      .then((missions) => {
        const active = missions.find((m) => m.status === "active");
        setMission(active ?? null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user, router]);

  async function enablePushNotifications() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      alert("Tu navegador no soporta notificaciones push");
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return;

      const reg = await navigator.serviceWorker.ready;
      const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: VAPID_PUBLIC_KEY,
      });
      await pushApi.subscribe(sub.toJSON() as PushSubscriptionJSON);
      setPushEnabled(true);
    } catch (err) {
      console.error("Error activando push:", err);
    }
  }

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center text-gray-500">
        Cargando…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Estado push */}
      {!pushEnabled && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
          <p className="text-sm font-medium text-blue-800">
            Activa las notificaciones
          </p>
          <p className="mt-0.5 text-xs text-blue-600">
            Recibirás alertas cuando el análisis esté listo aunque la app esté
            en background.
          </p>
          <button
            onClick={enablePushNotifications}
            className="mt-3 w-full rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            🔔 Activar notificaciones
          </button>
        </div>
      )}

      {/* Misión activa */}
      {mission ? (
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Misión activa
          </p>
          <p className="mt-1 text-lg font-bold text-gray-900">{mission.name}</p>
          {mission.description && (
            <p className="mt-0.5 text-sm text-gray-500">{mission.description}</p>
          )}
          <div className="mt-4">
            <Link
              href="/app/report"
              className="block w-full rounded-xl bg-red-600 py-4 text-center text-base font-bold text-white shadow-lg hover:bg-red-700 active:scale-95 transition-transform"
            >
              🚨 Reportar persona encontrada
            </Link>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-gray-200 bg-white p-8 text-center">
          <p className="text-sm font-medium text-gray-500">
            Sin misión activa asignada
          </p>
          <p className="mt-1 text-xs text-gray-400">
            Contacta al administrador de operaciones
          </p>
        </div>
      )}
    </div>
  );
}

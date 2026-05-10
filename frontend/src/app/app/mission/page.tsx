"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/store/auth";
import { missionsApi, dronesApi, pushApi } from "@/lib/api";
import type { Mission, Drone } from "@/lib/types";

export default function AppMissionPage() {
  const user   = useAuthStore((s) => s.user);
  const router = useRouter();

  const [mission, setMission]             = useState<Mission | null>(null);
  const [loading, setLoading]             = useState(true);
  const [pushEnabled, setPushEnabled]     = useState(false);

  // Modo piloto
  const [pilotDrone, setPilotDrone]       = useState<Drone | null>(null);
  const [tracking, setTracking]           = useState(false);
  const [gpsError, setGpsError]           = useState<string | null>(null);
  const [lastCoords, setLastCoords]       = useState<{ lat: number; lng: number } | null>(null);
  const wsRef      = useRef<WebSocket | null>(null);
  const watchIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!user) {
      router.replace("/login");
      return;
    }

    missionsApi
      .list()
      .then(async (missions) => {
        const active = missions.find((m) => m.status === "active") ?? null;
        setMission(active);

        if (active) {
          // Obtener el primer dron asignado a la misión para el modo piloto
          try {
            const missionDrones = await missionsApi.listDrones(active.id);
            if (missionDrones.length > 0) {
              const drone = await dronesApi.get(missionDrones[0].drone_id);
              setPilotDrone(drone);
            }
          } catch {
            // No hay drones asignados, modo piloto no disponible
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user, router]);

  // Limpieza al desmontar
  useEffect(() => {
    return () => stopTracking();
  }, []);

  function stopTracking() {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setTracking(false);
  }

  function startTracking() {
    if (!mission || !pilotDrone) return;
    if (!("geolocation" in navigator)) {
      setGpsError("Tu dispositivo no tiene GPS disponible.");
      return;
    }

    setGpsError(null);

    const wsBase = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000";
    const ws = new WebSocket(
      `${wsBase}/ws/ingest/telemetry?stream_key=${pilotDrone.serial_number}`
    );
    wsRef.current = ws;

    ws.onclose = () => {
      if (tracking) setGpsError("Conexión perdida con el servidor. Reintenta.");
      setTracking(false);
    };

    ws.onopen = () => {
      const watchId = navigator.geolocation.watchPosition(
        (pos) => {
          setLastCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          setGpsError(null);

          if (ws.readyState !== WebSocket.OPEN) return;

          const payload = {
            drone_id:    pilotDrone.id,
            stream_key:  pilotDrone.serial_number,
            mission_id:  mission.id,
            timestamp:   pos.timestamp / 1000,
            lat:         pos.coords.latitude,
            lng:         pos.coords.longitude,
            altitude_m:  pos.coords.altitude ?? 0,
            heading_deg: pos.coords.heading  ?? 0,
            speed_mps:   pos.coords.speed    ?? 0,
            battery_pct: 100,
          };
          ws.send(JSON.stringify(payload));
        },
        (err) => {
          setGpsError(`Error GPS: ${err.message}`);
        },
        { enableHighAccuracy: true, maximumAge: 0 }
      );
      watchIdRef.current = watchId;
      setTracking(true);
    };
  }

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
            Activar notificaciones
          </button>
        </div>
      )}

      {/* Misión activa */}
      {mission ? (
        <>
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
                Reportar persona encontrada
              </Link>
            </div>
          </div>

          {/* Modo Piloto */}
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              Modo piloto
            </p>

            {!pilotDrone ? (
              <p className="mt-2 text-sm text-gray-500">
                No hay drones asignados a esta misión. Pide al administrador que asigne uno.
              </p>
            ) : (
              <>
                <p className="mt-1 text-sm text-gray-700">
                  Dron: <span className="font-semibold">{pilotDrone.serial_number}</span>
                </p>
                <p className="mt-0.5 text-xs text-gray-400">
                  El GPS de este celular se usará como posición del dron durante el vuelo.
                </p>

                {lastCoords && (
                  <p className="mt-2 text-xs font-mono text-green-700 bg-green-50 rounded px-2 py-1">
                    {lastCoords.lat.toFixed(6)}, {lastCoords.lng.toFixed(6)}
                  </p>
                )}

                {gpsError && (
                  <p className="mt-2 text-xs text-red-600">{gpsError}</p>
                )}

                <button
                  onClick={tracking ? stopTracking : startTracking}
                  className={`mt-3 w-full rounded-lg py-3 text-sm font-semibold text-white transition-colors ${
                    tracking
                      ? "bg-gray-600 hover:bg-gray-700"
                      : "bg-green-600 hover:bg-green-700"
                  }`}
                >
                  {tracking ? "Detener seguimiento GPS" : "Iniciar seguimiento GPS"}
                </button>

                {tracking && (
                  <p className="mt-2 text-center text-xs text-green-600">
                    Enviando posición al servidor…
                  </p>
                )}
              </>
            )}
          </div>
        </>
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

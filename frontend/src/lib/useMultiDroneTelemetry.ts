// =============================================================================
// AEROFINDER — useMultiDroneTelemetry
// Gestiona N conexiones WebSocket de telemetría (una por dron) de forma
// imperativa con useRef, evitando el límite de "no hooks en loops".
// Se instancia UNA vez en el padre y se pasa el estado a todos los hijos.
// =============================================================================

"use client";

import { useEffect, useRef, useState } from "react";

export interface DroneState {
  lat:         number;
  lng:         number;
  heading_deg: number;
  altitude_m:  number;
  battery_pct: number;
  speed_mps:   number;
}

const MAX_ROUTE_POINTS = 1000;
const PING_INTERVAL_MS = 30_000;

interface Conn {
  ws:   WebSocket;
  ping: ReturnType<typeof setInterval>;
}

export function useMultiDroneTelemetry(
  droneIds:    string[],
  accessToken: string | null,
) {
  const [droneStates,    setDroneStates]    = useState<Record<string, DroneState>>({});
  const [routes,         setRoutes]         = useState<Record<string, [number, number][]>>({});
  const [connectedCount, setConnectedCount] = useState(0);

  const connsRef  = useRef<Record<string, Conn>>({});
  // Ref para contar conexiones activas sin setState carrera
  const activeRef = useRef(0);

  // Limpieza total al desmontar
  useEffect(() => {
    return () => {
      Object.values(connsRef.current).forEach(({ ws, ping }) => {
        clearInterval(ping);
        ws.onclose = null;
        ws.close();
      });
      connsRef.current = {};
    };
  }, []);

  // Gestión de conexiones al cambiar droneIds o token
  useEffect(() => {
    const wsBase = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000";

    // Cerrar conexiones de drones eliminados de la lista
    Object.keys(connsRef.current).forEach((id) => {
      if (!droneIds.includes(id)) {
        clearInterval(connsRef.current[id].ping);
        connsRef.current[id].ws.onclose = null;
        connsRef.current[id].ws.close();
        delete connsRef.current[id];
        activeRef.current = Math.max(0, activeRef.current - 1);
      }
    });

    if (!accessToken) return;

    // Abrir conexiones para drones nuevos
    droneIds.forEach((droneId) => {
      if (connsRef.current[droneId]) return; // ya conectado

      let ws: WebSocket;
      try {
        ws = new WebSocket(`${wsBase}/ws/telemetry/${droneId}?token=${accessToken}`);
      } catch {
        return;
      }

      const ping = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send("ping");
      }, PING_INTERVAL_MS);

      connsRef.current[droneId] = { ws, ping };

      ws.onopen = () => {
        activeRef.current += 1;
        setConnectedCount(activeRef.current);
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data as string);
          if (msg.type !== "telemetry") return;

          setDroneStates((prev) => ({
            ...prev,
            [droneId]: {
              lat:         msg.lat,
              lng:         msg.lng,
              heading_deg: msg.heading_deg ?? 0,
              altitude_m:  msg.altitude_m  ?? 0,
              battery_pct: msg.battery_pct ?? 0,
              speed_mps:   msg.speed_mps   ?? 0,
            },
          }));

          setRoutes((prev) => {
            const existing = prev[droneId] ?? [];
            return {
              ...prev,
              [droneId]: [
                ...existing.slice(-(MAX_ROUTE_POINTS - 1)),
                [msg.lat, msg.lng] as [number, number],
              ],
            };
          });
        } catch { /* ignorar mensajes no-JSON */ }
      };

      ws.onclose = () => {
        clearInterval(ping);
        activeRef.current = Math.max(0, activeRef.current - 1);
        setConnectedCount(activeRef.current);
        delete connsRef.current[droneId];
      };

      ws.onerror = () => ws.close();
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [droneIds.join(","), accessToken]);

  return { droneStates, routes, connectedCount };
}

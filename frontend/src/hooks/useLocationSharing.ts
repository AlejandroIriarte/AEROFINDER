// frontend/src/hooks/useLocationSharing.ts
// =============================================================================
// AEROFINDER Frontend — Hook useLocationSharing
// Combina navigator.geolocation.watchPosition con el WS de misión para:
//   1. Enviar la posición del usuario cada 3s al servidor
//   2. Mantener un mapa de posiciones de otros usuarios en la misión
// =============================================================================

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { UserLocationState } from "@/lib/types";

const SEND_INTERVAL_MS = 3_000;
const STALE_THRESHOLD_MS = 60_000;

interface UseLocationSharingOptions {
  /** Función send del hook useWebSocket */
  send: (data: string | object) => void;
  /** Si false, no se envía la posición pero sí se reciben las de otros */
  shareOwnLocation?: boolean;
}

export interface UseLocationSharingReturn {
  /** Posiciones de otros usuarios (incluyendo el usuario actual vía WS reflejo) */
  locations: Record<string, UserLocationState>;
  /** Posición propia (null si geolocation no disponible o denegada) */
  ownLocation: { lat: number; lng: number; accuracy_m: number } | null;
  /** Error de geolocation si ocurrió */
  geoError: string | null;
  /** Llamar con un mensaje WS tipo user_location recibido del servidor */
  handleIncomingLocation: (msg: UserLocationState) => void;
}

export function useLocationSharing(
  options: UseLocationSharingOptions
): UseLocationSharingReturn {
  const { send, shareOwnLocation = true } = options;

  const [locations, setLocations] = useState<Record<string, UserLocationState>>({});
  const [ownLocation, setOwnLocation] = useState<{ lat: number; lng: number; accuracy_m: number } | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);

  const latestPositionRef = useRef<GeolocationPosition | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const sendIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Recibir posiciones del servidor (incluye reflejos propios)
  const handleIncomingLocation = useCallback((msg: UserLocationState) => {
    setLocations((prev) => ({
      ...prev,
      [msg.user_id]: { ...msg, stale: false },
    }));
  }, []);

  // Geolocation + envío periódico
  useEffect(() => {
    if (!shareOwnLocation) return;

    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setGeoError("Geolocalización no disponible en este navegador");
      return;
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        latestPositionRef.current = position;
        setOwnLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy_m: position.coords.accuracy,
        });
        setGeoError(null);
      },
      (err) => {
        setGeoError(err.message);
      },
      { enableHighAccuracy: true, maximumAge: 5_000 }
    );

    sendIntervalRef.current = setInterval(() => {
      if (latestPositionRef.current) {
        const { latitude, longitude, accuracy } = latestPositionRef.current.coords;
        send({
          type: "user_location",
          lat: latitude,
          lng: longitude,
          accuracy_m: accuracy,
        });
      }
    }, SEND_INTERVAL_MS);

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      if (sendIntervalRef.current) {
        clearInterval(sendIntervalRef.current);
      }
    };
  }, [send, shareOwnLocation]);

  // Marcar stale cada 10s
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setLocations((prev) => {
        const updated: Record<string, UserLocationState> = {};
        for (const id in prev) {
          const stale = now - new Date(prev[id].timestamp).getTime() > STALE_THRESHOLD_MS;
          updated[id] = prev[id].stale !== stale ? { ...prev[id], stale } : prev[id];
        }
        return updated;
      });
    }, 10_000);
    return () => clearInterval(interval);
  }, []);

  return { locations, ownLocation, geoError, handleIncomingLocation };
}

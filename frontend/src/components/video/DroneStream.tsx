// =============================================================================
// AEROFINDER Frontend — Player HLS del stream del dron
// Usa hls.js con fallback a HLS nativo (Safari).
// Overlay de telemetría via WebSocket, pantalla completa y silencio.
// =============================================================================

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useWebSocket } from "@/lib/websocket";
import { StreamStatus } from "@/components/video/StreamStatus";
import type { StreamState } from "@/components/video/StreamStatus";
import type { RoleName, TelemetryPoint } from "@/lib/types";

// ── Constantes ────────────────────────────────────────────────────────────────

const MAX_RETRIES        = 10;
const RETRY_INTERVAL_MS  = 5_000;
const TELEMETRY_TTL_MS   = 5_000; // ocultar overlay si no hay datos en 5s

// ── Props ─────────────────────────────────────────────────────────────────────

interface DroneStreamProps {
  streamKey: string;
  droneId:   string;
  userRole:  RoleName;
  className?: string;
}

// ── Componente principal ──────────────────────────────────────────────────────

export function DroneStream({ streamKey, droneId, userRole, className = "" }: DroneStreamProps) {
  const videoRef   = useRef<HTMLVideoElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hlsRef     = useRef<any>(null);           // instancia de Hls
  const retryCount = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMounted  = useRef(true);

  const [streamState, setStreamState] = useState<StreamState>("loading");
  const [isMuted,     setIsMuted]     = useState(true);
  const [latencyMs,   setLatencyMs]   = useState<number | null>(null);

  // Telemetría
  const [telemetry,    setTelemetry]    = useState<TelemetryPoint | null>(null);
  const telemetryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canSeeOverlay  = userRole === "admin" || userRole === "buscador";

  // URL del stream
  const hlsBase = process.env.NEXT_PUBLIC_HLS_URL ?? "http://localhost:8888";
  const hlsUrl  = `${hlsBase}/${streamKey}/index.m3u8`;

  // ── WebSocket de telemetría ────────────────────────────────────────────────
  const wsBase       = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000";
  const telemetryUrl = canSeeOverlay ? `${wsBase}/ws/telemetry/${droneId}` : null;

  const handleTelemetryMsg = useCallback((raw: unknown) => {
    const msg = raw as TelemetryPoint;
    if (msg.type !== "telemetry" || msg.drone_id !== droneId) return;
    setTelemetry(msg);

    // Resetear TTL del overlay
    if (telemetryTimer.current) clearTimeout(telemetryTimer.current);
    telemetryTimer.current = setTimeout(() => {
      if (isMounted.current) setTelemetry(null);
    }, TELEMETRY_TTL_MS);
  }, [droneId]);

  useWebSocket(telemetryUrl, handleTelemetryMsg);

  // ── Limpieza de hls.js ────────────────────────────────────────────────────
  const destroyHls = useCallback(() => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    if (retryTimer.current) {
      clearTimeout(retryTimer.current);
      retryTimer.current = null;
    }
  }, []);

  // ── Programar reintento ───────────────────────────────────────────────────
  const scheduleRetry = useCallback((initHls: () => void) => {
    if (!isMounted.current) return;
    if (retryCount.current >= MAX_RETRIES) {
      setStreamState("offline");
      return;
    }
    retryCount.current += 1;
    retryTimer.current = setTimeout(() => {
      if (isMounted.current) initHls();
    }, RETRY_INTERVAL_MS);
  }, []);

  // ── Inicialización del player ─────────────────────────────────────────────
  const initPlayer = useCallback(() => {
    const video = videoRef.current;
    if (!video || !isMounted.current) return;

    setStreamState("loading");
    destroyHls();

    // Safari / HLS nativo
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = hlsUrl;
      video.load();

      const onPlaying = () => { if (isMounted.current) setStreamState("playing"); };
      const onWaiting = () => { if (isMounted.current) setStreamState("buffering"); };
      const onError   = () => {
        if (!isMounted.current) return;
        setStreamState("error");
        scheduleRetry(initPlayer);
      };

      video.addEventListener("playing", onPlaying);
      video.addEventListener("waiting", onWaiting);
      video.addEventListener("error",   onError);
      return;
    }

    // hls.js para navegadores que no soportan HLS nativo
    import("hls.js").then(({ default: Hls }) => {
      if (!isMounted.current || !videoRef.current) return;
      if (!Hls.isSupported()) {
        setStreamState("error");
        return;
      }

      const hls = new Hls({
        liveSyncDurationCount: 3,
        liveMaxLatencyDurationCount: 6,
        enableWorker: true,
        lowLatencyMode: true,
      });
      hlsRef.current = hls;

      hls.loadSource(hlsUrl);
      hls.attachMedia(videoRef.current!);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (!isMounted.current) return;
        retryCount.current = 0;
        videoRef.current?.play().catch(() => {/* autoplay bloqueado */});
      });

      hls.on(Hls.Events.MEDIA_ATTACHED, () => {
        if (isMounted.current) setStreamState("loading");
      });

      // Calcular latencia aproximada con los fragmentos HLS
      hls.on(Hls.Events.FRAG_LOADED, (_: unknown, data: { frag: { start: number } }) => {
        if (!isMounted.current || !videoRef.current) return;
        const latency = (Date.now() / 1000 - data.frag.start) * 1000;
        setLatencyMs(Math.round(latency));
      });

      hls.on(Hls.Events.ERROR, (_: unknown, data: { fatal: boolean; type: string; details: string }) => {
        if (!isMounted.current) return;

        if (!data.fatal) {
          if (data.details === "bufferStalledError") setStreamState("buffering");
          return;
        }

        // Error fatal: reintentar
        setStreamState("error");
        destroyHls();
        scheduleRetry(initPlayer);
      });

      videoRef.current.addEventListener("playing",  () => { if (isMounted.current) setStreamState("playing"); });
      videoRef.current.addEventListener("waiting",  () => { if (isMounted.current) setStreamState("buffering"); });
      videoRef.current.addEventListener("stalled",  () => { if (isMounted.current) setStreamState("buffering"); });
    }).catch(() => {
      if (isMounted.current) setStreamState("error");
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hlsUrl, destroyHls, scheduleRetry]);

  // Montar / limpiar
  useEffect(() => {
    isMounted.current = true;
    initPlayer();
    return () => {
      isMounted.current = false;
      destroyHls();
      if (telemetryTimer.current) clearTimeout(telemetryTimer.current);
    };
  }, [initPlayer, destroyHls]);

  // ── Acción: reintentar manual ─────────────────────────────────────────────
  const handleRetry = () => {
    retryCount.current = 0;
    initPlayer();
  };

  // ── Acción: pantalla completa ─────────────────────────────────────────────
  const handleFullscreen = () => {
    const el = videoRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      el.requestFullscreen().catch(() => {});
    }
  };

  // ── Acción: silencio ──────────────────────────────────────────────────────
  const handleMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !videoRef.current.muted;
    setIsMuted(videoRef.current.muted);
  };

  // ── Batería con color ─────────────────────────────────────────────────────
  const batteryColor = telemetry
    ? telemetry.battery_pct <= 20
      ? "text-red-400"
      : telemetry.battery_pct <= 40
      ? "text-amber-400"
      : "text-green-400"
    : "";

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className={`relative overflow-hidden bg-black ${className}`}>
      {/* Video */}
      <video
        ref={videoRef}
        className="h-full w-full object-contain"
        autoPlay
        muted={isMuted}
        playsInline
      />

      {/* Badge de estado (esquina superior izquierda) */}
      <div className="pointer-events-none absolute left-2 top-2 z-10">
        <StreamStatus state={streamState} />
      </div>

      {/* Overlay de telemetría (esquina superior derecha) */}
      {canSeeOverlay && telemetry && (
        <div className="pointer-events-none absolute right-2 top-2 z-10">
          <div className="rounded bg-black/60 px-2 py-1 font-mono text-[10px] text-white backdrop-blur-sm">
            <span className="text-gray-400">ALT </span>
            <span>{telemetry.altitude_m.toFixed(1)}m</span>
            <span className="mx-1.5 text-gray-600">·</span>
            <span className="text-gray-400">BAT </span>
            <span className={batteryColor}>{telemetry.battery_pct}%</span>
            <span className="mx-1.5 text-gray-600">·</span>
            <span className="text-gray-400">VEL </span>
            <span>{telemetry.speed_mps.toFixed(1)} m/s</span>
          </div>
        </div>
      )}

      {/* Indicador de latencia (esquina inferior izquierda) */}
      {latencyMs !== null && streamState === "playing" && (
        <div className="pointer-events-none absolute bottom-9 left-2 z-10">
          <span className="rounded bg-black/50 px-1.5 py-0.5 font-mono text-[10px] text-gray-400">
            ~{latencyMs}ms
          </span>
        </div>
      )}

      {/* Controles (barra inferior) */}
      <div className="absolute bottom-0 left-0 right-0 z-10 flex items-center justify-end gap-2 bg-gradient-to-t from-black/70 to-transparent px-2 pb-1.5 pt-4">
        {/* Silencio */}
        <button
          onClick={handleMute}
          className="rounded p-1 text-white/80 hover:text-white transition-colors"
          title={isMuted ? "Activar sonido" : "Silenciar"}
        >
          {isMuted ? (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
              <line x1="23" y1="9" x2="17" y2="15"/>
              <line x1="17" y1="9" x2="23" y2="15"/>
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
            </svg>
          )}
        </button>

        {/* Pantalla completa */}
        <button
          onClick={handleFullscreen}
          className="rounded p-1 text-white/80 hover:text-white transition-colors"
          title="Pantalla completa"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 3 21 3 21 9"/>
            <polyline points="9 21 3 21 3 15"/>
            <line x1="21" y1="3" x2="14" y2="10"/>
            <line x1="3" y1="21" x2="10" y2="14"/>
          </svg>
        </button>
      </div>

      {/* Pantalla de error */}
      {streamState === "error" && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/80">
          <p className="mb-3 text-sm text-gray-300">Stream no disponible</p>
          <button
            onClick={handleRetry}
            className="rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 transition-colors"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* Pantalla offline */}
      {streamState === "offline" && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/80">
          <svg xmlns="http://www.w3.org/2000/svg" className="mb-2 h-8 w-8 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0 1 19 12.55M5 12.55a10.94 10.94 0 0 1 5.17-2.39M10.71 5.05A16 16 0 0 1 22.56 9M1.42 9a15.91 15.91 0 0 1 4.7-2.88M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01"/>
          </svg>
          <p className="text-sm text-gray-400">El dron no está transmitiendo</p>
          <button
            onClick={handleRetry}
            className="mt-3 rounded bg-gray-700 px-3 py-1.5 text-xs font-semibold text-gray-300 hover:bg-gray-600 transition-colors"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* Spinner de carga */}
      {streamState === "loading" && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/70">
          <svg className="mb-2 h-8 w-8 animate-spin text-blue-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
          </svg>
          <p className="text-xs text-gray-400">Conectando al stream…</p>
        </div>
      )}
    </div>
  );
}

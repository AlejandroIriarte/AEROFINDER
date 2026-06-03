// =============================================================================
// AEROFINDER Frontend — DroneStreamCard
// Tarjeta individual de dron en el mosaico: video HLS + controles reconocimiento.
// Incluye botón de captura manual de snapshot con recuadros de detección.
// =============================================================================

"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Hls from "hls.js";
import type { Drone } from "@/lib/types";
import { drawDetectionBox } from "@/lib/drawDetectionBox";

interface DetectionBox {
  bbox: { x: number; y: number; w: number; h: number };
  detection_type: string;
  confidence: number;
  similarity?: number;
}

interface Props {
  drone: Drone;
  streamReady: boolean;
  personDetection: boolean;
  faceRecognition: boolean;
  onTogglePersonDetection: () => void;
  onToggleFaceRecognition: () => void;
  canManage: boolean;
  hlsUrl: string | null;
  latestDetections?: DetectionBox[];
  onCapture?: (droneId: string, imageB64: string, detections: DetectionBox[]) => Promise<void>;
  isPaused?: boolean;
}

export function DroneStreamCard({
  drone,
  streamReady,
  personDetection,
  faceRecognition,
  onTogglePersonDetection,
  onToggleFaceRecognition,
  canManage,
  hlsUrl,
  latestDetections = [],
  onCapture,
  isPaused = false,
}: Props) {
  const playerRef = useRef<{ captureFrame: () => HTMLVideoElement | null }>(null);
  const [capturing, setCapturing] = useState(false);
  const [captureOk, setCaptureOk] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const handleCapture = useCallback(async () => {
    if (!onCapture || capturing) return;
    const video = playerRef.current?.captureFrame();
    if (!video || video.readyState < 2) return;

    setCapturing(true);
    try {
      // Dibujar frame + recuadros en canvas
      const canvas = document.createElement("canvas");
      canvas.width  = video.videoWidth  || 1280;
      canvas.height = video.videoHeight || 720;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Dibujar cada detección usando la utilidad compartida
      latestDetections.forEach((det) => {
        drawDetectionBox(ctx, det.bbox, det.detection_type, det.confidence, det.similarity);
      });

      const imageB64 = canvas.toDataURL("image/jpeg", 0.85);
      setPreviewImage(imageB64);
      await onCapture(drone.id, imageB64, latestDetections);
      setCaptureOk(true);
      setTimeout(() => setCaptureOk(false), 3000);
    } catch {
      // silencioso
    } finally {
      setCapturing(false);
    }
  }, [onCapture, capturing, latestDetections, drone.id]);

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-gray-900 shadow-sm">
      {/* Video */}
      <div className="relative aspect-video w-full bg-gray-900">
        {hlsUrl && <HlsPlayer ref={playerRef} url={hlsUrl} isPaused={isPaused} />}

        {/* Badge en vivo */}
        {streamReady && (
          <span className="absolute left-2 top-2 rounded-full bg-green-500 px-2 py-0.5 text-[10px] font-bold text-white">
            ● EN VIVO
          </span>
        )}

        {/* Botón captura — solo si hay video activo */}
        {onCapture && (
          <button
            onClick={handleCapture}
            disabled={capturing}
            title="Capturar snapshot"
            className={`absolute bottom-2 right-2 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors disabled:opacity-50 ${
              captureOk
                ? "bg-green-500 text-white"
                : "bg-black/60 text-white hover:bg-black/80"
            }`}
          >
            {captureOk ? "✓ Guardado" : capturing ? "…" : "📸 Capturar"}
          </button>
        )}

        {/* Badge de alerta en tiempo real */}
        {latestDetections.length > 0 && (() => {
          const hasFace = latestDetections.some(
            (d) => d.detection_type === "face_match" || d.detection_type === "face_candidate"
          );
          return (
            <span className={`animate-pulse absolute bottom-2 left-2 rounded-full px-2.5 py-1 text-[11px] font-bold text-white ${hasFace ? "bg-purple-600" : "bg-blue-600"}`}>
              {hasFace ? "⚠ COINCIDENCIA FACIAL" : "⚠ PERSONA DETECTADA"}
            </span>
          );
        })()}
      </div>

      {/* Info + controles */}
      <div className="bg-white p-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-gray-900">{drone.model}</p>
            <p className="truncate font-mono text-[10px] text-gray-400">{drone.serial_number}</p>
          </div>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${streamReady ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
            {streamReady ? "En vivo" : "Sin señal"}
          </span>
        </div>

        {canManage && (
          <div className="flex gap-2">
            <button
              onClick={onTogglePersonDetection}
              className={`flex-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold transition-colors ${
                personDetection
                  ? "bg-blue-600 text-white hover:bg-blue-700"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              👤 {personDetection ? "Detección ON" : "Detección OFF"}
            </button>
            <button
              onClick={onToggleFaceRecognition}
              className={`flex-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold transition-colors ${
                faceRecognition
                  ? "bg-purple-600 text-white hover:bg-purple-700"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              🔍 {faceRecognition ? "Facial ON" : "Facial OFF"}
            </button>
          </div>
        )}
      </div>

      {/* Modal de confirmación de snapshot */}
      {previewImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="relative overflow-hidden rounded-xl bg-white shadow-2xl" style={{ maxWidth: 640 }}>
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
              <p className="text-sm font-semibold text-slate-800">✓ Snapshot guardado</p>
              <button
                onClick={() => setPreviewImage(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                ✕
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewImage}
              alt="Snapshot capturado"
              className="block max-h-96 w-full object-contain bg-slate-900"
            />
            <div className="flex justify-end gap-2 px-5 py-3">
              <button
                onClick={() => setPreviewImage(null)}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── HLS Player inline ─────────────────────────────────────────────────────────

const RETRY_INTERVAL_MS = 20_000;

type PlayerState = "connecting" | "playing" | "offline";

import React from "react";

const HlsPlayer = React.forwardRef<
  { captureFrame: () => HTMLVideoElement | null },
  { url: string; isPaused?: boolean }
>(function HlsPlayer({ url, isPaused = false }, ref) {
  const videoRef    = useRef<HTMLVideoElement>(null);
  const hlsRef      = useRef<Hls | null>(null);
  const retryRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef  = useRef(true);
  const [state, setState]       = useState<PlayerState>("connecting");
  const [countdown, setCountdown] = useState(0);

  const startRef = useRef<() => void>(() => {});

  // Exponer acceso al elemento video para capturas
  React.useImperativeHandle(ref, () => ({
    captureFrame: () => videoRef.current,
  }));

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    function stopCountdown() {
      if (countRef.current) { clearInterval(countRef.current); countRef.current = null; }
    }

    function cleanup() {
      if (hlsRef.current)   { hlsRef.current.destroy(); hlsRef.current = null; }
      if (retryRef.current) { clearTimeout(retryRef.current); retryRef.current = null; }
      stopCountdown();
    }

    function scheduleRetry() {
      const secs = RETRY_INTERVAL_MS / 1000;
      setCountdown(secs);
      countRef.current = setInterval(() => {
        setCountdown((n) => {
          if (n <= 1) { stopCountdown(); return 0; }
          return n - 1;
        });
      }, 1_000);
      retryRef.current = setTimeout(() => {
        if (mountedRef.current) startRef.current();
      }, RETRY_INTERVAL_MS);
    }

    function start() {
      const video = videoRef.current;
      if (!video || !mountedRef.current) return;
      setState("connecting");
      setCountdown(0);
      cleanup();

      if (Hls.isSupported()) {
        const hls = new Hls({
          lowLatencyMode: true,
          manifestLoadingMaxRetry: 1,
          manifestLoadingRetryDelay: 2000,
        });
        hlsRef.current = hls;
        hls.loadSource(url);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (!mountedRef.current) return;
          setState("playing");
          video.play().catch(() => {});
        });
        hls.on(Hls.Events.ERROR, (_: unknown, data: { fatal: boolean }) => {
          if (!mountedRef.current) return;
          if (data.fatal) {
            setState("offline");
            cleanup();
            scheduleRetry();
          }
        });
        video.addEventListener("playing", () => { if (mountedRef.current) setState("playing"); });
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = url;
        video.play().catch(() => {});
        video.addEventListener("playing", () => { if (mountedRef.current) setState("playing"); });
        video.addEventListener("error",   () => {
          if (!mountedRef.current) return;
          setState("offline");
          scheduleRetry();
        });
      }
    }

    startRef.current = start;
    start();
    return cleanup;
  }, [url]);

  // Pausa / reanuda el video; al reanudar salta al borde en vivo del stream
  useEffect(() => {
    const video = videoRef.current;
    if (!video || state !== "playing") return;
    if (isPaused) {
      video.pause();
    } else {
      // Saltar al borde en vivo antes de reproducir
      const livePos = hlsRef.current?.liveSyncPosition ?? null;
      if (livePos !== null) {
        video.currentTime = livePos;
      } else if (video.seekable.length > 0) {
        video.currentTime = video.seekable.end(0);
      }
      video.play().catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPaused]);

  const handleFullscreen = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      el.requestFullscreen().catch(() => {});
    }
  }, []);

  return (
    <div className="relative h-full w-full bg-gray-900 group">
      <video
        ref={videoRef}
        className="h-full w-full object-contain"
        muted
        playsInline
        autoPlay
      />

      {/* Botón fullscreen */}
      {state === "playing" && (
        <button
          onClick={handleFullscreen}
          title="Pantalla completa"
          className="absolute right-2 top-2 rounded bg-black/50 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/80"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-5h-4m4 0v4m0-4l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5h-4m4 0v-4m0 4l-5-5" />
          </svg>
        </button>
      )}

      {state === "connecting" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80">
          <svg className="mb-2 h-6 w-6 animate-spin text-blue-400" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
          </svg>
          <p className="text-xs text-gray-300">Conectando al stream…</p>
        </div>
      )}
      {state === "offline" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/80">
          <svg className="h-8 w-8 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
            <line x1="3" y1="3" x2="21" y2="21" stroke="currentColor" strokeWidth={1.5}/>
          </svg>
          <p className="text-xs font-medium text-gray-300">Sin señal de video</p>
          <p className="text-[10px] text-gray-500">
            {countdown > 0 ? `Reintentando en ${countdown}s` : "Reintentando…"}
          </p>
          <button
            onClick={() => startRef.current()}
            className="mt-1 rounded-md bg-white/10 px-3 py-1 text-[11px] font-semibold text-gray-200 hover:bg-white/20 transition-colors"
          >
            Reintentar ahora
          </button>
        </div>
      )}
    </div>
  );
});

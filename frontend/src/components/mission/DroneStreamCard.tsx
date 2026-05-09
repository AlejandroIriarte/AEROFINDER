// =============================================================================
// AEROFINDER Frontend — DroneStreamCard
// Tarjeta individual de dron en el mosaico: video HLS + controles reconocimiento.
// Los botones de reconocimiento controlan flags a nivel misión (aplican a todos).
// =============================================================================

"use client";

import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import type { Drone } from "@/lib/types";

interface Props {
  drone: Drone;
  streamReady: boolean;
  personDetection: boolean;
  faceRecognition: boolean;
  onTogglePersonDetection: () => void;
  onToggleFaceRecognition: () => void;
  canManage: boolean;
  hlsUrl: string | null;
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
}: Props) {
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-gray-900 shadow-sm">
      {/* Video */}
      <div className="relative aspect-video w-full bg-gray-900">
        {streamReady && hlsUrl ? (
          <HlsPlayer url={hlsUrl} />
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <svg className="mx-auto mb-2 h-8 w-8 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
              </svg>
              <p className="text-xs text-gray-500">Sin señal</p>
            </div>
          </div>
        )}

        {/* Badge en vivo */}
        {streamReady && (
          <span className="absolute left-2 top-2 rounded-full bg-green-500 px-2 py-0.5 text-[10px] font-bold text-white">
            ● EN VIVO
          </span>
        )}
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
    </div>
  );
}

// ── HLS Player inline ─────────────────────────────────────────────────────────

function HlsPlayer({ url }: { url: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (Hls.isSupported()) {
      const hls = new Hls({ lowLatencyMode: true });
      hls.loadSource(url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => { video.play().catch(() => {}); });
      return () => hls.destroy();
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = url;
      video.play().catch(() => {});
    }
  }, [url]);

  return (
    <video
      ref={videoRef}
      className="h-full w-full object-contain"
      muted
      playsInline
      autoPlay
    />
  );
}

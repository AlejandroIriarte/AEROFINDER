// =============================================================================
// AEROFINDER Frontend — DroneVideoMosaic
// Grid dinámico: 1 dron=full, 2=50/50, 3-4=2x2.
// Controles de reconocimiento aplican a nivel misión completa.
// =============================================================================

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Drone, Mission, StreamInfo } from "@/lib/types";
import { missionsApi, dronesApi } from "@/lib/api";
import { DroneStreamCard } from "./DroneStreamCard";

// URL base HLS — usada como fallback cuando el backend no devuelve hls_url
const HLS_BASE = process.env.NEXT_PUBLIC_HLS_URL ?? "http://localhost:8888";

interface DetectionBox {
  bbox: { x: number; y: number; w: number; h: number };
  detection_type: string;
  confidence: number;
  similarity?: number;
}

interface Props {
  mission: Mission;
  assignedDrones: Drone[];
  streams: StreamInfo[];
  canManage: boolean;
  onMissionUpdate: (m: Mission) => void;
  // Detecciones recientes por drone_id — para mostrar recuadros en vivo
  latestDetections?: Record<string, DetectionBox[]>;
  isPaused?: boolean;
}

export function DroneVideoMosaic({
  mission,
  assignedDrones,
  streams: initialStreams,
  canManage,
  onMissionUpdate,
  latestDetections = {},
  isPaused = false,
}: Props) {
  const [streams, setStreams] = useState<StreamInfo[]>(initialStreams);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setStreams(initialStreams);
  }, [initialStreams]);

  useEffect(() => {
    pollRef.current = setInterval(async () => {
      try {
        const data = await dronesApi.listStreams();
        setStreams(data);
      } catch { /* silencioso */ }
    }, 15_000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const streamBySerial = new Map(streams.map((s) => [s.serial, s]));

  const handleTogglePersonDetection = useCallback(async () => {
    try {
      const updated = await missionsApi.setRecognition(
        mission.id,
        !mission.recognition_active,
        mission.face_recognition_active,
      );
      onMissionUpdate(updated);
    } catch { /* silencioso */ }
  }, [mission, onMissionUpdate]);

  const handleToggleFaceRecognition = useCallback(async () => {
    try {
      const updated = await missionsApi.setRecognition(
        mission.id,
        mission.recognition_active,
        !mission.face_recognition_active,
      );
      onMissionUpdate(updated);
    } catch { /* silencioso */ }
  }, [mission, onMissionUpdate]);

  const handleCapture = useCallback(async (
    droneId: string,
    imageB64: string,
    detections: DetectionBox[],
  ) => {
    await missionsApi.captureSnapshot(mission.id, droneId, imageB64, detections);
  }, [mission.id]);

  if (assignedDrones.length === 0) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-500">Sin drones asignados a esta misión</p>
      </div>
    );
  }

  const gridClass = assignedDrones.length === 1 ? "grid-cols-1" : "grid-cols-2";

  return (
    <div className={`grid h-full gap-1 p-1 ${gridClass}`} style={{ alignContent: "start" }}>
      {assignedDrones.map((drone) => {
        const stream = streamBySerial.get(drone.serial_number);
        const hlsUrl = stream?.hls_url
          ?? drone.hls_url
          ?? `${HLS_BASE}/${drone.serial_number}/index.m3u8`;
        return (
          <DroneStreamCard
            key={drone.id}
            drone={drone}
            streamReady={stream?.ready ?? false}
            hlsUrl={hlsUrl}
            personDetection={mission.recognition_active}
            faceRecognition={mission.face_recognition_active}
            onTogglePersonDetection={handleTogglePersonDetection}
            onToggleFaceRecognition={handleToggleFaceRecognition}
            canManage={canManage}
            latestDetections={latestDetections[drone.id] ?? []}
            onCapture={canManage ? handleCapture : undefined}
            isPaused={isPaused}
          />
        );
      })}
    </div>
  );
}

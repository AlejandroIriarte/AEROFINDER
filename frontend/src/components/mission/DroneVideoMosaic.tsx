// =============================================================================
// AEROFINDER Frontend — DroneVideoMosaic
// Grid dinámico: 1 dron=full, 2=50/50, 3-4=2x2.
// Controles de reconocimiento aplican a nivel misión completa.
// =============================================================================

"use client";

import { useCallback } from "react";
import type { Drone, Mission, StreamInfo } from "@/lib/types";
import { missionsApi } from "@/lib/api";
import { DroneStreamCard } from "./DroneStreamCard";

interface Props {
  mission: Mission;
  assignedDrones: Drone[];
  streams: StreamInfo[];
  canManage: boolean;
  onMissionUpdate: (m: Mission) => void;
}

export function DroneVideoMosaic({
  mission,
  assignedDrones,
  streams,
  canManage,
  onMissionUpdate,
}: Props) {
  const streamBySerial = new Map(streams.map((s) => [s.serial, s]));

  const handleTogglePersonDetection = useCallback(async () => {
    try {
      const updated = await missionsApi.setRecognition(
        mission.id,
        !mission.recognition_active,
        mission.face_recognition_active,
      );
      onMissionUpdate(updated);
    } catch {
      // silencioso
    }
  }, [mission, onMissionUpdate]);

  const handleToggleFaceRecognition = useCallback(async () => {
    try {
      const updated = await missionsApi.setRecognition(
        mission.id,
        mission.recognition_active,
        !mission.face_recognition_active,
      );
      onMissionUpdate(updated);
    } catch {
      // silencioso
    }
  }, [mission, onMissionUpdate]);

  if (assignedDrones.length === 0) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-500">Sin drones asignados a esta misión</p>
      </div>
    );
  }

  const gridClass =
    assignedDrones.length === 1
      ? "grid-cols-1"
      : "grid-cols-2";

  return (
    <div className={`grid h-full gap-1 p-1 ${gridClass}`} style={{ alignContent: "start" }}>
      {assignedDrones.map((drone) => {
        const stream = streamBySerial.get(drone.serial_number);
        return (
          <DroneStreamCard
            key={drone.id}
            drone={drone}
            streamReady={stream?.ready ?? false}
            hlsUrl={stream?.hls_url ?? drone.hls_url ?? null}
            personDetection={mission.recognition_active}
            faceRecognition={mission.face_recognition_active}
            onTogglePersonDetection={handleTogglePersonDetection}
            onToggleFaceRecognition={handleToggleFaceRecognition}
            canManage={canManage}
          />
        );
      })}
    </div>
  );
}

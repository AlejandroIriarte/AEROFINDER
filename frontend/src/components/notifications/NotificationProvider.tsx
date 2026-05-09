// =============================================================================
// AEROFINDER Frontend — Proveedor global de notificaciones via WebSocket
// Se conecta al WS de alertas y alimenta el store de notificaciones.
// Debe montarse dentro del DashboardLayout (requiere accessToken).
// =============================================================================

"use client";

import { useCallback } from "react";
import { useAuthStore } from "@/store/auth";
import { useNotificationsStore } from "@/store/notifications";
import { useWebSocket } from "@/lib/websocket";
import type { WSMessage } from "@/lib/types";

const DETECTION_LABELS: Record<string, string> = {
  person_silhouette: "Silueta detectada",
  face_candidate:    "Posible rostro detectado",
  face_match:        "Coincidencia facial confirmada",
};

const DETECTION_SEVERITY: Record<string, "info" | "warning" | "critical"> = {
  person_silhouette: "info",
  face_candidate:    "warning",
  face_match:        "critical",
};

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const accessToken     = useAuthStore((s) => s.accessToken);
  const userRole        = useAuthStore((s) => s.user?.role);
  const addNotification = useNotificationsStore((s) => s.addNotification);
  const addToast        = useNotificationsStore((s) => s.addToast);

  const wsBase = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000";
  const wsUrl  = accessToken
    ? `${wsBase}/ws/alerts?token=${accessToken}`
    : null;

  const handleMessage = useCallback((msg: WSMessage) => {
    if (msg.type === "alert" || msg.type === "detection") {
      const detType = (msg as Record<string, unknown>).detection_type as string;
      const title   = DETECTION_LABELS[detType] ?? "Nueva detección";
      const severity = DETECTION_SEVERITY[detType] ?? "info";
      const personName = (msg as Record<string, unknown>).person_name as string | undefined;
      const missionId  = (msg as Record<string, unknown>).mission_id as string | undefined;

      const message = personName
        ? `Persona: ${personName}`
        : "Revisa las alertas para más detalles";

      // Agregar al feed de notificaciones
      addNotification({
        type: msg.type === "alert" ? "alert" : "detection",
        title,
        message,
        timestamp: new Date().toISOString(),
        severity,
        missionId,
        detectionId: (msg as Record<string, unknown>).detection_id as string | undefined,
      });

      // Toast solo para coincidencias faciales (no spamear con siluetas)
      if (detType === "face_match" || detType === "face_candidate") {
        addToast({
          type: severity === "critical" ? "warning" : "info",
          title,
          message,
        });
      }
    }

    if (msg.type === "mission_update") {
      const missionName = (msg as Record<string, unknown>).mission_name as string | undefined;
      const newStatus   = (msg as Record<string, unknown>).status as string | undefined;

      addNotification({
        type: "mission_update",
        title: "Misión actualizada",
        message: missionName
          ? `${missionName}: ${newStatus ?? "estado cambiado"}`
          : "Estado de misión actualizado",
        timestamp: new Date().toISOString(),
        severity: "info",
        missionId: (msg as Record<string, unknown>).mission_id as string | undefined,
      });
    }
  }, [addNotification, addToast]);

  // Solo conectar para roles operativos (no familiar — tiene su propia página)
  const shouldConnect = userRole && userRole !== "familiar";
  useWebSocket(shouldConnect ? wsUrl : null, handleMessage);

  return <>{children}</>;
}

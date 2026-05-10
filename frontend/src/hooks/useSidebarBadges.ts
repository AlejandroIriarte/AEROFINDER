// =============================================================================
// AEROFINDER — Hook para badges en tiempo real del sidebar
// Actualiza contadores cada 30s y en eventos WS via notifications store
// =============================================================================

"use client";

import { useEffect, useState } from "react";
import { missionsApi, detectionsApi } from "@/lib/api";
import { useNotificationsStore } from "@/store/notifications";
import type { SidebarBadges } from "@/components/layout/Sidebar";

const isToday = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
};

export function useSidebarBadges(): SidebarBadges {
  const unreadCount = useNotificationsStore((s) => s.unreadCount);

  const [badges, setBadges] = useState<SidebarBadges>({ missions: 0, alerts: 0, detections: 0, review: 0 });

  const load = async () => {
    try {
      const [missions, detections] = await Promise.all([
        missionsApi.list(),
        detectionsApi.list({ limit: 200 }),
      ]);
      setBadges((prev) => ({
        ...prev,
        missions:   missions.filter((m) => m.status === "active").length,
        detections: detections.filter((d) => isToday(d.frame_timestamp)).length,
        alerts:     unreadCount,
      }));
    } catch {
      // badges son decorativos, no bloquean la UI
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setBadges((prev) => ({ ...prev, alerts: unreadCount }));
  }, [unreadCount]);

  return badges;
}

// =============================================================================
// AEROFINDER — useDashboardData: carga todos los datos del dashboard admin
// Todos los datos vienen del backend; nada hardcodeado.
// =============================================================================

"use client";

import { useCallback, useEffect, useState } from "react";
import { missionsApi, dronesApi, alertsApi, detectionsApi, usersApi, fieldReportsApi } from "@/lib/api";
import type { Alert, Detection, Drone, FieldReport, Mission, User } from "@/lib/types";

const isToday = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
};

export interface DashboardData {
  missions:            Mission[];
  drones:              Drone[];
  alerts:              Alert[];
  detectionsToday:     Detection[];
  fieldReportsPending: FieldReport[];
  usersActive:         User[];
  isLoading:           boolean;
  error:               string | null;
  reload:              () => void;
}

export function useDashboardData(): DashboardData {
  const [missions,            setMissions]            = useState<Mission[]>([]);
  const [drones,              setDrones]              = useState<Drone[]>([]);
  const [alerts,              setAlerts]              = useState<Alert[]>([]);
  const [detectionsToday,     setDetectionsToday]     = useState<Detection[]>([]);
  const [fieldReportsPending, setFieldReportsPending] = useState<FieldReport[]>([]);
  const [usersActive,         setUsersActive]         = useState<User[]>([]);
  const [isLoading,           setIsLoading]           = useState(true);
  const [error,               setError]               = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [missionList, droneList, alertList, detectionList, userList] = await Promise.all([
        missionsApi.list(),
        dronesApi.list(),
        alertsApi.list(),
        detectionsApi.list({ limit: 200 }),
        usersApi.list(),
      ]);

      setMissions(missionList);
      setDrones(droneList);
      setAlerts(alertList);
      setDetectionsToday(detectionList.filter((d) => isToday(d.frame_timestamp)));
      setUsersActive(userList.filter((u) => u.is_active));

      const activeMissions = missionList.filter((m) => m.status === "active");
      if (activeMissions.length > 0) {
        const reports = await Promise.all(
          activeMissions.map((m) => fieldReportsApi.listForMission(m.id).catch(() => [] as FieldReport[]))
        );
        setFieldReportsPending(reports.flat().filter((r) => r.status === "pending"));
      } else {
        setFieldReportsPending([]);
      }
    } catch (err) {
      setError("Error al cargar los datos del dashboard.");
      console.error("[useDashboardData]", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return { missions, drones, alerts, detectionsToday, fieldReportsPending, usersActive, isLoading, error, reload: load };
}

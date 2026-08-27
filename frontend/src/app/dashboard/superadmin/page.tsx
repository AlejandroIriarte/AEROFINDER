// =============================================================================
// AEROFINDER — Super Admin Dashboard
// Resumen del sistema: infra, sesiones, admins, auditoría, config, hard-delete
// Datos reales del backend vía superadminApi, systemApi, usersApi
// =============================================================================

"use client";

import { useCallback, useEffect, useState } from "react";
import { RoleGuard } from "@/components/ui/RoleGuard";
import { superadminApi } from "@/lib/api";
import api from "@/lib/api";
import type {
  InfraHealth,
  AdminSession,
  SoftDeletedUser,
  SystemConfig,
  User,
  AuditLog,
} from "@/lib/types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    ok:      "bg-green-400",
    stale:   "bg-amber-400",
    error:   "bg-red-400",
    unknown: "bg-slate-300",
  };
  return (
    <span className={`inline-block h-2 w-2 rounded-full flex-shrink-0 ${colors[status] ?? "bg-slate-300"}`} />
  );
}

function RelativeTime({ iso }: { iso: string }) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  const hrs  = Math.floor(mins / 60);
  if (mins < 1) return <span>ahora</span>;
  if (mins < 60) return <span>hace {mins} min</span>;
  if (hrs < 24)  return <span>hace {hrs} h</span>;
  return <span>hace {Math.floor(hrs / 24)} d</span>;
}

// ── Sección: Infra health ─────────────────────────────────────────────────────

function InfraSection({ health }: { health: InfraHealth }) {
  const services = [
    { key: "redis",     label: "Redis",     data: health.redis },
    { key: "minio",     label: "MinIO",     data: health.minio },
    { key: "mediamtx",  label: "MediaMTX",  data: health.mediamtx },
    { key: "ai_worker", label: "AI Worker", data: health.ai_worker },
  ];

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-700">Salud de infraestructura</h2>
        <span className="text-xs text-gray-400">
          {services.filter(s => s.data.status === "ok").length} / {services.length} servicios OK
        </span>
      </div>
      <div className="grid grid-cols-2 divide-x divide-y divide-gray-100">
        {services.map(({ key, label, data }) => (
          <div key={key} className="flex items-center gap-3 px-4 py-3">
            <StatusDot status={data.status} />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-gray-800">{label}</p>
              <p className="text-[11px] text-gray-400 truncate">{data.detail ?? "—"}</p>
            </div>
            {data.latency_ms != null && (
              <span className="text-[11px] font-medium text-gray-500 tabular-nums whitespace-nowrap">
                {data.latency_ms} ms
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Sección: Sesiones activas ─────────────────────────────────────────────────

function SessionsSection({
  sessions,
  onRevoke,
  revoking,
}: {
  sessions: AdminSession[];
  onRevoke: (id: string) => void;
  revoking: string | null;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-700">Sesiones activas</h2>
        <span className="text-xs text-gray-400">{sessions.length} sesiones</span>
      </div>
      {sessions.length === 0 ? (
        <p className="px-4 py-3 text-xs text-gray-400">Sin sesiones activas.</p>
      ) : (
        <div className="divide-y divide-gray-50">
          {sessions.map((s) => (
            <div key={s.id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-gray-800 truncate">
                  {s.user_name}
                  <span className={`ml-1.5 rounded px-1.5 py-px text-[9px] font-semibold ${
                    s.user_role === "admin" ? "bg-blue-50 text-blue-600" :
                    s.user_role === "super_admin" ? "bg-violet-50 text-violet-600" :
                    "bg-gray-100 text-gray-500"
                  }`}>{s.user_role}</span>
                </p>
                <p className="text-[10px] text-gray-400 truncate">
                  {s.ip_address} · {s.user_agent?.split("/")[0] ?? "desconocido"} · emitida <RelativeTime iso={s.issued_at} />
                </p>
              </div>
              <button
                disabled={revoking === s.id}
                onClick={() => onRevoke(s.id)}
                className="shrink-0 rounded border border-red-200 bg-white px-2.5 py-1 text-[10px] font-medium text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40"
              >
                {revoking === s.id ? "Revocando…" : "Revocar"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Sección: Gestión de admins ────────────────────────────────────────────────

function AdminsSection({ admins, onToggle, toggling }: {
  admins: User[];
  onToggle: (id: string, active: boolean) => void;
  toggling: string | null;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-700">Administradores</h2>
        <span className="text-xs text-gray-400">{admins.filter(a => a.is_active).length} activos</span>
      </div>
      {admins.length === 0 ? (
        <p className="px-4 py-3 text-xs text-gray-400">Sin administradores registrados.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="bg-gray-50 text-[10px] uppercase tracking-wide text-gray-400">
                <th className="px-4 py-2 text-left font-semibold">Nombre</th>
                <th className="px-4 py-2 text-left font-semibold">Email</th>
                <th className="px-4 py-2 text-left font-semibold">Último acceso</th>
                <th className="px-4 py-2 text-left font-semibold">Estado</th>
                <th className="px-4 py-2 text-left font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {admins.map((a) => (
                <tr key={a.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ${
                        a.is_active ? "bg-blue-100 text-blue-600" : "bg-gray-100 text-gray-400"
                      }`}>
                        {a.full_name.charAt(0).toUpperCase()}
                      </div>
                      <span className={`font-medium ${a.is_active ? "text-gray-900" : "text-gray-400"}`}>
                        {a.full_name}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-gray-500">{a.email}</td>
                  <td className="px-4 py-2.5 text-gray-400">
                    {a.last_login_at ? <RelativeTime iso={a.last_login_at} /> : "nunca"}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      a.is_active
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-500"
                    }`}>
                      {a.is_active ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <button
                      disabled={toggling === a.id}
                      onClick={() => onToggle(a.id, !a.is_active)}
                      className={`rounded border px-2 py-0.5 text-[10px] font-medium transition-colors disabled:opacity-40 ${
                        a.is_active
                          ? "border-red-200 text-red-600 hover:bg-red-50"
                          : "border-green-200 text-green-700 hover:bg-green-50"
                      }`}
                    >
                      {toggling === a.id
                        ? "…"
                        : a.is_active ? "Desactivar" : "Reactivar"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Sección: Auditoría reciente ───────────────────────────────────────────────

function AuditSection({ logs }: { logs: AuditLog[] }) {
  const opColor: Record<string, string> = {
    INSERT: "bg-green-400",
    UPDATE: "bg-blue-400",
    DELETE: "bg-red-400",
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-700">Auditoría reciente</h2>
        <span className="text-xs text-gray-400">{logs.length} eventos</span>
      </div>
      {logs.length === 0 ? (
        <p className="px-4 py-3 text-xs text-gray-400">Sin eventos de auditoría.</p>
      ) : (
        <div className="divide-y divide-gray-50">
          {logs.slice(0, 8).map((log) => (
            <div key={log.id} className="flex items-start gap-3 px-4 py-2.5">
              <div className={`mt-1.5 h-1.5 w-1.5 rounded-full flex-shrink-0 ${opColor[log.operation] ?? "bg-gray-300"}`} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-800">
                  <span className={`mr-1 rounded px-1 py-px text-[9px] font-semibold ${
                    log.operation === "DELETE" ? "bg-red-50 text-red-600" :
                    log.operation === "INSERT" ? "bg-green-50 text-green-700" :
                    "bg-blue-50 text-blue-600"
                  }`}>{log.operation}</span>
                  {log.table_name}
                </p>
                <p className="text-[10px] text-gray-400">
                  ID: {log.record_id.slice(0, 8)}… · <RelativeTime iso={log.changed_at} />
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Sección: Parámetros del sistema ──────────────────────────────────────────

function ConfigSection({ configs }: { configs: SystemConfig[] }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-700">Parámetros del sistema</h2>
      </div>
      <div className="divide-y divide-gray-50">
        {configs.slice(0, 6).map((c) => (
          <div key={c.config_key} className="flex items-center gap-3 px-4 py-2.5">
            <div className="flex-1 min-w-0">
              <p className="font-mono text-[11px] text-violet-700">{c.config_key}</p>
              {c.description && <p className="text-[10px] text-gray-400">{c.description}</p>}
            </div>
            <span className="font-mono text-[11px] text-gray-700 tabular-nums">{c.value_text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Sección: Borrado definitivo ───────────────────────────────────────────────

function HardDeleteSection({ items, onDelete, deleting }: {
  items: SoftDeletedUser[];
  onDelete: (id: string, name: string) => void;
  deleting: string | null;
}) {
  return (
    <div className="rounded-xl border border-red-200 bg-white overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-4 py-3 border-b border-red-100 bg-red-50">
        <h2 className="text-sm font-semibold text-red-700">Zona de borrado definitivo</h2>
        <span className="text-[10px] text-red-400">Solo super_admin · irreversible</span>
      </div>
      {items.length === 0 ? (
        <p className="px-4 py-3 text-xs text-gray-400">Sin usuarios desactivados para purgar.</p>
      ) : (
        <div className="divide-y divide-red-50">
          {items.map((u) => (
            <div key={u.id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-gray-800">{u.full_name}</p>
                <p className="text-[10px] text-gray-400">
                  {u.email} · {u.role}
                  {u.deactivated_at && <> · desactivado <RelativeTime iso={u.deactivated_at} /></>}
                </p>
              </div>
              <button
                disabled={deleting === u.id}
                onClick={() => onDelete(u.id, u.full_name)}
                className="shrink-0 rounded border border-red-300 bg-white px-2.5 py-1 text-[10px] font-semibold text-red-700 hover:bg-red-50 transition-colors disabled:opacity-40"
              >
                {deleting === u.id ? "Borrando…" : "Borrar definitivamente"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function SuperAdminPage() {
  const [health,      setHealth]      = useState<InfraHealth | null>(null);
  const [sessions,    setSessions]    = useState<AdminSession[]>([]);
  const [admins,      setAdmins]      = useState<User[]>([]);
  const [auditLogs,   setAuditLogs]   = useState<AuditLog[]>([]);
  const [configs,     setConfigs]     = useState<SystemConfig[]>([]);
  const [softDeleted, setSoftDeleted] = useState<SoftDeletedUser[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [loadError,   setLoadError]   = useState(false);
  const [revoking,    setRevoking]    = useState<string | null>(null);
  const [toggling,    setToggling]    = useState<string | null>(null);
  const [deleting,    setDeleting]    = useState<string | null>(null);
  const [lastUpdate,  setLastUpdate]  = useState<Date | null>(null);

  const loadAll = useCallback(async () => {
    setLoadError(false);
    try {
      const [h, sess, adms, audit, cfg, soft] = await Promise.all([
        superadminApi.health(),
        superadminApi.listSessions(),
        superadminApi.listAdmins(),
        api.get<AuditLog[]>("/audit-log/", { params: { limit: 20 } }).then(r => r.data),
        api.get<SystemConfig[]>("/config/").then(r => r.data),
        superadminApi.listSoftDeleted(),
      ]);
      setHealth(h);
      setSessions(sess);
      setAdmins(adms);
      setAuditLogs(audit);
      setConfigs(cfg);
      setSoftDeleted(soft);
      setLastUpdate(new Date());
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleRevokeSession = async (sessionId: string) => {
    setRevoking(sessionId);
    try {
      await superadminApi.revokeSession(sessionId);
      setSessions(prev => prev.filter(s => s.id !== sessionId));
    } catch {
      // silencioso
    } finally {
      setRevoking(null);
    }
  };

  const handleToggleAdmin = async (userId: string, newActive: boolean) => {
    setToggling(userId);
    try {
      await api.patch(`/users/${userId}`, { is_active: newActive });
      setAdmins(prev => prev.map(a => a.id === userId ? { ...a, is_active: newActive } : a));
    } catch {
      // silencioso
    } finally {
      setToggling(null);
    }
  };

  const handleHardDelete = async (userId: string, name: string) => {
    if (!confirm(`¿Borrar DEFINITIVAMENTE a "${name}"? Esta acción es irreversible.`)) return;
    setDeleting(userId);
    try {
      await superadminApi.hardDeleteUser(userId);
      setSoftDeleted(prev => prev.filter(u => u.id !== userId));
    } catch {
      // silencioso
    } finally {
      setDeleting(null);
    }
  };

  const healthOk       = health ? Object.values(health).filter(s => s.status === "ok").length : 0;
  const healthTotal    = 4;
  const activeSessions = sessions.length;
  const activeAdmins   = admins.filter(a => a.is_active).length;
  const criticalLogs   = auditLogs.filter(l => l.operation === "DELETE").length;

  return (
    <RoleGuard allowedRoles={["admin", "super_admin"]}>
      <div className="p-6 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Resumen del sistema</h1>
            {lastUpdate && (
              <p className="text-xs text-gray-400 mt-0.5">
                Actualizado a las {lastUpdate.toLocaleTimeString("es-BO")}
              </p>
            )}
          </div>
          <button
            onClick={loadAll}
            disabled={loading}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            {loading ? "Cargando…" : "Actualizar"}
          </button>
        </div>

        {loadError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            Error al cargar datos. Verifica la conexión e intenta actualizar.
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: "Admins activos",    value: activeAdmins,   color: "text-blue-600"  },
            { label: "Servicios OK",      value: `${healthOk}/${healthTotal}`, color: healthOk === healthTotal ? "text-green-600" : "text-amber-600" },
            { label: "Sesiones activas",  value: activeSessions, color: "text-slate-700" },
            { label: "Eliminaciones hoy", value: criticalLogs,   color: criticalLogs > 0 ? "text-red-600" : "text-slate-700" },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm text-center">
              <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
              <p className="mt-1 text-xs text-gray-500">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Infra + Sessions */}
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          {health && <InfraSection health={health} />}
          <SessionsSection sessions={sessions} onRevoke={handleRevokeSession} revoking={revoking} />
        </div>

        {/* Admins (full width) */}
        <AdminsSection admins={admins} onToggle={handleToggleAdmin} toggling={toggling} />

        {/* Audit + Config */}
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <AuditSection logs={auditLogs} />
          <ConfigSection configs={configs} />
        </div>

        {/* Hard delete zone */}
        <HardDeleteSection items={softDeleted} onDelete={handleHardDelete} deleting={deleting} />

      </div>
    </RoleGuard>
  );
}

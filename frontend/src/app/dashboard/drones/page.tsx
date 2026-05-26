// =============================================================================
// AEROFINDER Frontend — Flota de drones
// Sección superior: streams RTMP activos en MediaMTX (auto-descubrimiento).
// Sección inferior: drones registrados en la DB con gestión de estado.
// =============================================================================

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuthStore } from "@/store/auth";
import { dronesApi, systemApi } from "@/lib/api";
import type { Drone, DroneCreate, DroneStatus, NetworkInfo, StreamInfo } from "@/lib/types";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/dashboard/PageHeader";

const STATUS_OPTIONS: DroneStatus[] = [
  "available", "in_mission", "maintenance", "out_of_service",
];

// ── Tarjeta de stream en vivo ─────────────────────────────────────────────────

function StreamCard({
  stream,
  onRegister,
}: {
  stream: StreamInfo;
  onRegister: (serial: string) => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  const drone = stream.registered_drone;

  return (
    <div className={`rounded-xl border bg-white p-4 shadow-sm ${stream.ready ? "border-green-200" : "border-slate-200"}`}>
      {/* Header */}
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-[13px] font-bold text-slate-900 truncate">{stream.serial}</p>
          {drone && (
            <p className="text-[11px] text-slate-500 truncate">{drone.model} · {drone.manufacturer}</p>
          )}
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${stream.ready ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
          {stream.ready ? "En vivo" : "Sin señal"}
        </span>
      </div>

      {/* URLs */}
      <div className="mb-3 space-y-1.5">
        {[
          { label: "RTMP", value: stream.rtmp_url, key: "rtmp" },
          { label: "HLS",  value: stream.hls_url,  key: "hls"  },
        ].map(({ label, value, key }) => (
          <div key={key} className="flex items-center gap-2">
            <span className="w-8 shrink-0 rounded bg-slate-100 px-1 py-0.5 text-center text-[10px] font-semibold text-slate-500">{label}</span>
            <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-slate-600">{value}</span>
            <button
              onClick={() => copy(value, key + stream.serial)}
              className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500 hover:bg-slate-200 transition-colors"
            >
              {copied === key + stream.serial ? "✓" : "Copiar"}
            </button>
          </div>
        ))}
      </div>

      {/* Acción */}
      {drone ? (
        <div className="rounded-lg bg-blue-50 px-3 py-1.5 text-[11px] text-blue-700">
          Registrado como <span className="font-semibold">{drone.model}</span>
        </div>
      ) : (
        <button
          onClick={() => onRegister(stream.serial)}
          className="w-full rounded-lg bg-blue-600 py-1.5 text-[12px] font-semibold text-white hover:bg-blue-700 transition-colors"
        >
          + Registrar dron
        </button>
      )}
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function DronesPage() {
  const user = useAuthStore((s) => s.user);

  const [drones,  setDrones]  = useState<Drone[]>([]);
  const [streams, setStreams] = useState<StreamInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const [showCreate, setShowCreate]   = useState(false);
  const [saving,     setSaving]       = useState(false);
  const [preSerial,  setPreSerial]    = useState("");

  const [editingDrone, setEditingDrone] = useState<Drone | null>(null);
  const [editForm, setEditForm] = useState({ model: "", manufacturer: "" });
  const [networkInfo, setNetworkInfo] = useState<NetworkInfo | null>(null);

  const [form, setForm] = useState<DroneCreate>({
    serial_number: "",
    model: "",
    manufacturer: "DJI",
    battery_warning_pct: 20,
  });

  const isAdmin   = user?.role === "admin";
  const canCreate = isAdmin || user?.role === "buscador";

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStreams = useCallback(async () => {
    try {
      const data = await dronesApi.listStreams();
      setStreams(data);
    } catch {
      // silencioso — MediaMTX puede estar iniciando
    }
  }, []);

  useEffect(() => {
    Promise.all([dronesApi.list(), dronesApi.listStreams()])
      .then(([d, s]) => { setDrones(d); setStreams(s); })
      .catch(() => setError("Error al cargar drones"))
      .finally(() => setLoading(false));

    systemApi.getNetworkInfo().then(setNetworkInfo).catch(() => {});

    // Poll de streams cada 10s
    pollRef.current = setInterval(fetchStreams, 10_000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchStreams]);

  function openRegister(serial: string) {
    setPreSerial(serial);
    setForm((f) => ({ ...f, serial_number: serial }));
    setShowCreate(true);
  }

  async function handleStatusChange(id: string, s: DroneStatus) {
    try {
      const updated = await dronesApi.update(id, { status: s });
      setDrones((prev) => prev.map((d) => (d.id === id ? updated : d)));
    } catch {
      alert("Error al actualizar estado del dron");
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.serial_number || !form.model) return;
    setSaving(true);
    try {
      const created = await dronesApi.create(form);
      setDrones((prev) => [...prev, created]);
      await fetchStreams();
      setShowCreate(false);
      setForm({ serial_number: "", model: "", manufacturer: "DJI", battery_warning_pct: 20 });
      setPreSerial("");
    } catch {
      alert("Error al registrar el dron");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-5">
      <PageHeader
        title="Flota de drones"
        subtitle={`${drones.length} registrados · ${streams.filter((s) => s.ready).length} transmitiendo`}
      >
        {canCreate && (
          <button
            onClick={() => { setPreSerial(""); setShowCreate(true); }}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-[12px] font-semibold text-white hover:bg-blue-700 transition-colors"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 stroke-white fill-none" strokeWidth={2.5}>
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Registrar dron
          </button>
        )}
      </PageHeader>

      {loading && <LoadingSpinner />}

      {!loading && error && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      {/* ── Streams en vivo ── */}
      {!loading && (
        <section className="mb-6">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-[13px] font-semibold text-slate-700">Streams en vivo</h2>
            {streams.length > 0 && (
              <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700">
                {streams.filter((s) => s.ready).length} activos
              </span>
            )}
            <span className="ml-auto text-[10px] text-slate-400">Se actualiza cada 10s</span>
          </div>

          {streams.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 py-8 text-center">
              <p className="text-[13px] font-medium text-slate-500">Sin streams detectados</p>
                <p className="mt-1 text-[11px] text-slate-400">
                Cuando un dron (DJI u otra marca con RTMP) transmita a <span className="font-mono">rtmp://SERVER_IP:1935/SERIAL</span> aparecerá aquí.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {streams.map((s) => (
                <StreamCard
                  key={s.serial}
                  stream={s}
                  onRegister={openRegister}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── Drones registrados ── */}
      {!loading && !error && (
        <section>
          <h2 className="mb-3 text-[13px] font-semibold text-slate-700">Drones registrados</h2>

          {drones.length === 0 ? (
            <EmptyState
              title="Sin drones registrados"
              description="Registra los drones de la flota para asignarlos a misiones."
              action={
                canCreate ? (
                  <button
                    onClick={() => setShowCreate(true)}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-[12px] font-semibold text-white hover:bg-blue-700"
                  >
                    Registrar primer dron
                  </button>
                ) : undefined
              }
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {drones.map((drone) => {
                const isLive = streams.some((s) => s.serial === drone.serial_number && s.ready);
                return (
                  <div key={drone.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="mb-3 flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-slate-900 truncate text-[13px]">{drone.model}</p>
                          {isLive && (
                            <span className="shrink-0 rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold text-green-700">
                              En vivo
                            </span>
                          )}
                          {drone.auto_created && (
                            <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                              ⚠ Sin configurar
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400">{drone.manufacturer}</p>
                      </div>
                      <StatusBadge value={drone.status} domain="drone" />
                    </div>

                    {/* URL RTMP siempre visible */}
                    {(() => {
                      const rtmpUrl = drone.rtmp_url ??
                        (networkInfo ? networkInfo.rtmp_url_template.replace("{serial}", drone.serial_number) : null);
                      return rtmpUrl ? (
                        <div className="mb-2 flex items-center gap-1.5 rounded-lg bg-amber-50 px-2 py-1.5">
                          <code className="flex-1 truncate text-[10px] text-amber-800">{rtmpUrl}</code>
                          <button
                            onClick={() => navigator.clipboard.writeText(rtmpUrl)}
                            className="shrink-0 rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 hover:bg-amber-300 transition-colors"
                          >
                            Copiar
                          </button>
                        </div>
                      ) : null;
                    })()}

                    <dl className="mb-3 space-y-1 text-[11px] text-slate-600">
                      <div className="flex justify-between">
                        <dt className="text-slate-400">Serial</dt>
                        <dd className="font-mono font-medium truncate max-w-[8rem]">{drone.serial_number}</dd>
                      </div>
                      {drone.max_flight_time_minutes && (
                        <div className="flex justify-between">
                          <dt className="text-slate-400">Vuelo máx.</dt>
                          <dd>{drone.max_flight_time_minutes} min</dd>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <dt className="text-slate-400">Alerta batería</dt>
                        <dd>{drone.battery_warning_pct}%</dd>
                      </div>
                    </dl>

                    {isAdmin && (
                      <select
                        value={drone.status}
                        onChange={(e) => handleStatusChange(drone.id, e.target.value as DroneStatus)}
                        className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-[12px] focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      >
                        {STATUS_OPTIONS.map((s) => (
                          <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
                        ))}
                      </select>
                    )}

                    {isAdmin && (
                      <button
                        onClick={() => {
                          setEditingDrone(drone);
                          setEditForm({ model: drone.model, manufacturer: drone.manufacturer });
                        }}
                        className="mt-2 w-full rounded-lg border border-slate-200 py-1.5 text-[12px] font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                      >
                        ✏ Editar detalles
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Modal: editar dron */}
      <Modal
        open={!!editingDrone}
        title="Editar dron"
        onClose={() => setEditingDrone(null)}
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!editingDrone) return;
            try {
              const updated = await dronesApi.update(editingDrone.id, editForm);
              setDrones((prev) => prev.map((d) => d.id === updated.id ? updated : d));
              setEditingDrone(null);
            } catch {
              alert("Error al actualizar el dron");
            }
          }}
          className="space-y-3"
        >
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Nombre / Modelo</label>
            <input
              required
              value={editForm.model}
              onChange={(e) => setEditForm({ ...editForm, model: e.target.value })}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="Ej: Dron (DJI u otra marca con RTMP) — Piloto Juan"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Fabricante</label>
            <input
              value={editForm.manufacturer}
              onChange={(e) => setEditForm({ ...editForm, manufacturer: e.target.value })}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setEditingDrone(null)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-3 py-2 text-[12px] font-semibold text-white hover:bg-blue-700"
            >
              Guardar
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: registrar dron */}
      <Modal open={showCreate} title="Registrar dron" onClose={() => { setShowCreate(false); setPreSerial(""); }}>
        <form onSubmit={handleCreate} className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Número de serie *</label>
            <input
              required
              value={form.serial_number}
              onChange={(e) => setForm({ ...form, serial_number: e.target.value })}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] font-mono focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="1ZNBJ0K001XXXX"
            />
            {preSerial && (
              <p className="mt-0.5 text-[11px] text-green-700">Pre-llenado desde stream detectado</p>
            )}
            <p className="mt-0.5 text-[11px] text-slate-400">Este serial es la clave RTMP → HLS automático</p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Modelo *</label>
            <input
              required
              value={form.model}
              onChange={(e) => setForm({ ...form, model: e.target.value })}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="Mavic 3 Enterprise"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Fabricante</label>
            <input
              value={form.manufacturer}
              onChange={(e) => setForm({ ...form, manufacturer: e.target.value })}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => { setShowCreate(false); setPreSerial(""); }}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] font-medium text-slate-700 hover:bg-slate-50">
              Cancelar
            </button>
            <button type="submit" disabled={saving}
              className="rounded-lg bg-blue-600 px-3 py-2 text-[12px] font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
              {saving ? "Registrando…" : "Registrar"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

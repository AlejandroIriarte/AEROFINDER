// Lista de misiones con tabla, badges, filtro por estado y modal de creación.
// Roles: admin, buscador, ayudante
"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/auth";
import { missionsApi, personsApi } from "@/lib/api";
import type { Mission, MissingPerson, MissionStatus } from "@/lib/types";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { MissionRow } from "@/components/dashboard/MissionRow";

const STATUS_FILTER_PILLS: { value: MissionStatus | "all"; label: string }[] = [
  { value: "all",       label: "Todas" },
  { value: "active",    label: "Activas" },
  { value: "planned",   label: "Planificadas" },
  { value: "completed", label: "Completadas" },
  { value: "paused",    label: "Pausadas" },
  { value: "cancelled", label: "Canceladas" },
];

export default function MissionsPage() {
  const user = useAuthStore((s) => s.user);

  const [missions, setMissions]   = useState<Mission[]>([]);
  const [persons, setPersons]     = useState<MissingPerson[]>([]);
  const [loading, setLoading]     = useState(true);
  const [filter, setFilter]       = useState<MissionStatus | "all">("all");
  const [showModal, setShowModal] = useState(false);
  const [error, setError]         = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    missing_person_id: "",
    description: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([missionsApi.list(), personsApi.list()])
      .then(([m, p]) => {
        setMissions(m);
        setPersons(p);
      })
      .catch(() => setError("Error al cargar misiones"))
      .finally(() => setLoading(false));
  }, []);

  const canCreate = user?.role === "admin" || user?.role === "buscador";

  const filtered = filter === "all"
    ? missions
    : missions.filter((m) => m.status === filter);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.missing_person_id) return;
    setSaving(true);
    try {
      const created = await missionsApi.create({
        name: form.name,
        missing_person_id: form.missing_person_id,
        description: form.description || undefined,
        lead_user_id: user!.id,
      });
      setMissions((prev) => [created, ...prev]);
      setShowModal(false);
      setForm({ name: "", missing_person_id: "", description: "" });
    } catch {
      alert("Error al crear misión");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-5">
      <PageHeader title="Misiones" subtitle="Operaciones de búsqueda activas y pasadas">
        {canCreate && (
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-[12px] font-semibold text-white hover:bg-blue-700 transition-colors"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 stroke-white fill-none" strokeWidth={2.5}>
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Nueva misión
          </button>
        )}
      </PageHeader>

      {/* Filtros — pills */}
      <div className="mb-4 flex flex-wrap gap-2">
        {STATUS_FILTER_PILLS.map((pill) => (
          <button
            key={pill.value}
            onClick={() => setFilter(pill.value)}
            className={`rounded-full px-3 py-1 text-[12px] font-medium transition-colors ${
              filter === pill.value
                ? "bg-blue-600 text-white"
                : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {pill.label}
          </button>
        ))}
      </div>

      {loading && <LoadingSpinner />}

      {!loading && error && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <EmptyState
          title="Sin misiones"
          description={filter === "all" ? "No hay misiones registradas aún." : "No hay misiones con este estado."}
          action={
            canCreate ? (
              <button
                onClick={() => setShowModal(true)}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Crear primera misión
              </button>
            ) : undefined
          }
        />
      )}

      {!loading && !error && filtered.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {filtered.map((m) => <MissionRow key={m.id} mission={m} />)}
        </div>
      )}

      <Modal open={showModal} title="Nueva misión" onClose={() => setShowModal(false)}>
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Nombre *</label>
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="Búsqueda Norte — Zona A"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Persona buscada *</label>
            <select
              required
              value={form.missing_person_id}
              onChange={(e) => setForm({ ...form, missing_person_id: e.target.value })}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">Seleccionar persona…</option>
              {persons.map((p) => (
                <option key={p.id} value={p.id}>{p.full_name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Descripción</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="Área de búsqueda, notas operacionales…"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowModal(false)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-blue-600 px-3 py-2 text-[12px] font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Creando…" : "Crear misión"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

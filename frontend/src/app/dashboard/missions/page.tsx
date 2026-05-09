// Lista de misiones con tabla, badges, filtro por estado y modal de creación.
// Roles: admin, buscador, ayudante
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import { missionsApi, personsApi } from "@/lib/api";
import type { Mission, MissingPerson, MissionStatus } from "@/lib/types";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";

const STATUS_OPTIONS: { value: MissionStatus | "all"; label: string }[] = [
  { value: "all",         label: "Todos los estados" },
  { value: "planned",     label: "Planificada" },
  { value: "active",      label: "Activa" },
  { value: "paused",      label: "Pausada" },
  { value: "completed",   label: "Completada" },
  { value: "interrupted", label: "Interrumpida" },
  { value: "cancelled",   label: "Cancelada" },
];

export default function MissionsPage() {
  const router = useRouter();
  const user   = useAuthStore((s) => s.user);

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

  const personMap = Object.fromEntries(persons.map((p) => [p.id, p.full_name]));

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
    <div className="flex h-full flex-col">
      <PageHeader
        title="Misiones"
        description="Operaciones de búsqueda activas y pasadas"
        action={
          canCreate ? (
            <button
              onClick={() => setShowModal(true)}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
            >
              + Nueva misión
            </button>
          ) : undefined
        }
      />

      <div className="flex-1 overflow-auto p-6">
        <div className="mb-4">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as MissionStatus | "all")}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
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
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left">
                  <th className="px-4 py-3 font-semibold text-gray-600">Nombre</th>
                  <th className="px-4 py-3 font-semibold text-gray-600">Persona buscada</th>
                  <th className="px-4 py-3 font-semibold text-gray-600">Estado</th>
                  <th className="px-4 py-3 font-semibold text-gray-600">Inicio</th>
                  <th className="px-4 py-3 font-semibold text-gray-600">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((mission) => (
                  <tr
                    key={mission.id}
                    className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => router.push(`/dashboard/missions/${mission.id}`)}
                  >
                    <td className="px-4 py-3 font-medium text-gray-900">{mission.name}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {personMap[mission.missing_person_id] ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge value={mission.status} domain="mission" pulse />
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {mission.started_at
                        ? new Date(mission.started_at).toLocaleDateString("es-BO")
                        : mission.planned_at
                        ? new Date(mission.planned_at).toLocaleDateString("es-BO")
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/dashboard/missions/${mission.id}`);
                        }}
                        className="rounded-md px-3 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50"
                      >
                        Ver detalle →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={showModal} title="Nueva misión" onClose={() => setShowModal(false)}>
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Nombre *</label>
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Búsqueda Norte — Zona A"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Persona buscada *</label>
            <select
              required
              value={form.missing_person_id}
              onChange={(e) => setForm({ ...form, missing_person_id: e.target.value })}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Seleccionar persona…</option>
              {persons.map((p) => (
                <option key={p.id} value={p.id}>{p.full_name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Descripción</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Área de búsqueda, notas operacionales…"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowModal(false)}
              className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Creando…" : "Crear misión"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

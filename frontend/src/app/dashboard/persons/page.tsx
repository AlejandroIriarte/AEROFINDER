// Grid de cards de personas desaparecidas. Admin/buscador pueden aprobar y registrar.
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import { personsApi } from "@/lib/api";
import type { MissingPerson, PersonCreate } from "@/lib/types";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";

function PersonCard({
  person,
  canApprove,
  onApprove,
  onClick,
}: {
  person: MissingPerson;
  canApprove: boolean;
  onApprove: (id: string) => void;
  onClick: (p: MissingPerson) => void;
}) {
  const initials = person.full_name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  return (
    <div
      className="cursor-pointer rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
      onClick={() => onClick(person)}
    >
      <div className="mb-3 flex items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-700">
          {initials}
        </div>
        <div className="min-w-0">
          <p className="truncate font-semibold text-gray-900">{person.full_name}</p>
          <p className="text-xs text-gray-500">
            Desaparición: {new Date(person.disappeared_at).toLocaleDateString("es-BO")}
          </p>
        </div>
      </div>

      <div className="mb-3 flex items-center justify-between">
        <StatusBadge value={person.status} domain="person" />
        {person.last_known_location && (
          <span className="max-w-[120px] truncate text-xs text-gray-400">
            {person.last_known_location}
          </span>
        )}
      </div>

      {canApprove && person.status === "pending_review" && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onApprove(person.id);
          }}
          className="mt-1 w-full rounded-lg bg-amber-500 py-1.5 text-xs font-semibold text-white hover:bg-amber-600"
        >
          Aprobar caso
        </button>
      )}
    </div>
  );
}

export default function PersonsPage() {
  const router = useRouter();
  const user   = useAuthStore((s) => s.user);

  const [persons, setPersons]       = useState<MissingPerson[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [selected, setSelected]     = useState<MissingPerson | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving]         = useState(false);

  const [form, setForm] = useState<PersonCreate>({
    full_name: "",
    disappeared_at: "",
  });

  const canEdit    = user?.role === "admin" || user?.role === "buscador";
  const canApprove = user?.role === "admin" || user?.role === "ayudante";

  useEffect(() => {
    personsApi.list()
      .then(setPersons)
      .catch(() => setError("Error al cargar personas"))
      .finally(() => setLoading(false));
  }, []);

  async function handleApprove(id: string) {
    try {
      const updated = await personsApi.approve(id);
      setPersons((prev) => prev.map((p) => (p.id === id ? updated : p)));
    } catch {
      alert("Error al aprobar el caso");
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.full_name || !form.disappeared_at) return;
    setSaving(true);
    try {
      const created = await personsApi.create(form);
      setPersons((prev) => [created, ...prev]);
      setShowCreate(false);
      setForm({ full_name: "", disappeared_at: "" });
    } catch {
      alert("Error al registrar la persona");
    } finally {
      setSaving(false);
    }
  }

  const pendingCount = persons.filter((p) => p.status === "pending_review").length;

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Personas desaparecidas"
        description={
          pendingCount > 0
            ? `${persons.length} registradas — ${pendingCount} pendientes de revisión`
            : `${persons.length} registradas`
        }
        action={
          canEdit ? (
            <button
              onClick={() => setShowCreate(true)}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
            >
              + Registrar persona
            </button>
          ) : undefined
        }
      />

      <div className="flex-1 overflow-auto p-6">
        {loading && <LoadingSpinner />}

        {!loading && error && (
          <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</div>
        )}

        {!loading && !error && persons.length === 0 && (
          <EmptyState
            title="Sin personas registradas"
            description="Los casos de personas desaparecidas aparecerán aquí."
            action={
              canEdit ? (
                <button
                  onClick={() => setShowCreate(true)}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  Registrar primer caso
                </button>
              ) : undefined
            }
          />
        )}

        {!loading && !error && persons.length > 0 && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {persons.map((person) => (
              <PersonCard
                key={person.id}
                person={person}
                canApprove={canApprove}
                onApprove={handleApprove}
                onClick={setSelected}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modal detalle */}
      <Modal
        open={selected !== null}
        title={selected?.full_name ?? ""}
        onClose={() => setSelected(null)}
      >
        {selected && (
          <>
          <dl className="space-y-3 text-sm">
            {([
              ["Estado", <StatusBadge key="s" value={selected.status} domain="person" />],
              ["Fecha desaparición", new Date(selected.disappeared_at).toLocaleDateString("es-BO")],
              selected.age_at_disappearance ? ["Edad", `${selected.age_at_disappearance} años`] : null,
              selected.gender ? ["Género", selected.gender] : null,
              selected.last_known_location ? ["Última ubicación", selected.last_known_location] : null,
              selected.physical_description ? ["Descripción física", selected.physical_description] : null,
              selected.reporter_name ? ["Reportado por", selected.reporter_name] : null,
              selected.reporter_contact ? ["Contacto", selected.reporter_contact] : null,
            ] as ([string, React.ReactNode] | null)[])
              .filter((row): row is [string, React.ReactNode] => row !== null)
              .map(([label, value], i) => (
                <div key={i} className="flex justify-between gap-4">
                  <dt className="shrink-0 font-medium text-gray-500">{label}</dt>
                  <dd className="text-right text-gray-900">{value}</dd>
                </div>
              ))}
          </dl>
          <button
            onClick={() => router.push(`/dashboard/persons/${selected.id}`)}
            className="mt-4 w-full rounded-lg border border-blue-200 bg-blue-50 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100 transition-colors"
          >
            Ver perfil completo →
          </button>
          </>
        )}
      </Modal>

      {/* Modal registrar persona */}
      <Modal open={showCreate} title="Registrar persona desaparecida" onClose={() => setShowCreate(false)}>
        <form onSubmit={handleCreate} className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Nombre completo *</label>
            <input
              required
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Fecha desaparición *</label>
            <input
              required
              type="date"
              value={form.disappeared_at}
              onChange={(e) => setForm({ ...form, disappeared_at: e.target.value })}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Última ubicación conocida</label>
            <input
              value={form.last_known_location ?? ""}
              onChange={(e) => setForm({ ...form, last_known_location: e.target.value })}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Descripción física</label>
            <textarea
              rows={2}
              value={form.physical_description ?? ""}
              onChange={(e) => setForm({ ...form, physical_description: e.target.value })}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Reportado por</label>
              <input
                value={form.reporter_name ?? ""}
                onChange={(e) => setForm({ ...form, reporter_name: e.target.value })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Contacto</label>
              <input
                value={form.reporter_contact ?? ""}
                onChange={(e) => setForm({ ...form, reporter_contact: e.target.value })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setShowCreate(false)}
              className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">
              Cancelar
            </button>
            <button type="submit" disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
              {saving ? "Registrando…" : "Registrar"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

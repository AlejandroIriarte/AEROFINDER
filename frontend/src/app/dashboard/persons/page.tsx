// Grid de cards de personas desaparecidas. Admin/buscador pueden aprobar y registrar.
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import { personsApi } from "@/lib/api";
import type { MissingPerson } from "@/lib/types";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/dashboard/PageHeader";

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
      className="cursor-pointer rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
      onClick={() => onClick(person)}
    >
      <div className="mb-3 flex items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-700">
          {initials}
        </div>
        <div className="min-w-0">
          <p className="truncate font-semibold text-slate-900">{person.full_name}</p>
          <p className="text-xs text-slate-500">
            Desaparición: {new Date(person.disappeared_at).toLocaleDateString("es-BO")}
          </p>
        </div>
      </div>

      <div className="mb-3 flex items-center justify-between">
        <StatusBadge value={person.status} domain="person" />
        {person.last_known_location && (
          <span className="max-w-[120px] truncate text-xs text-slate-400">
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


  const pendingCount = persons.filter((p) => p.status === "pending_review").length;

  return (
    <div className="p-5">
      <PageHeader
        title="Personas desaparecidas"
        subtitle={
          pendingCount > 0
            ? `${persons.length} registradas — ${pendingCount} pendientes de revisión`
            : `${persons.length} registradas`
        }
      >
        {canEdit && (
          <button
            onClick={() => router.push("/dashboard/persons/new")}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-[12px] font-semibold text-white hover:bg-blue-700 transition-colors"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 stroke-white fill-none" strokeWidth={2.5}>
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Registrar persona
          </button>
        )}
      </PageHeader>

      <div>
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
                  onClick={() => router.push("/dashboard/persons/new")}
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
                onClick={(p) => router.push(`/dashboard/persons/${p.id}`)}
              />
            ))}
          </div>
        )}
      </div>

    </div>
  );
}

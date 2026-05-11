"use client";

import Link from "next/link";
import { useAuthStore } from "@/store/auth";
import { useEffect, useState } from "react";
import { personsApi } from "@/lib/api";
import type { MissingPerson } from "@/lib/types";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

const STATUS_LABEL: Record<string, string> = {
  pending_review: "En revisión",
  active: "Activo",
  found_alive: "Encontrado (vivo)",
  found_deceased: "Encontrado (fallecido)",
  false_report: "Falsa alarma",
  archived: "Archivado",
};

const STATUS_COLOR: Record<string, string> = {
  pending_review: "bg-amber-100 text-amber-700",
  active: "bg-blue-100 text-blue-700",
  found_alive: "bg-green-100 text-green-700",
  found_deceased: "bg-slate-100 text-slate-600",
  false_report: "bg-red-100 text-red-700",
  archived: "bg-slate-100 text-slate-500",
};

export default function FamiliarDashboardPage() {
  const { user, accessToken } = useAuthStore();
  const [myPeople, setMyPeople] = useState<MissingPerson[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!accessToken) return;
    // El backend filtra por familiar automáticamente (RLS + filtro app)
    personsApi.list()
      .then(setMyPeople)
      .catch((err) => console.error("Error fetching people:", err))
      .finally(() => setIsLoading(false));
  }, [accessToken]);

  return (
    <div className="p-5">
      <PageHeader
        title={`Bienvenido, ${user?.full_name ?? ""}`}
        subtitle="Panel de familias para reporte de personas desaparecidas"
      >
        <Link
          href="/dashboard/familiar/report"
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-blue-700 transition-colors"
        >
          + Nuevo reporte
        </Link>
      </PageHeader>

      {/* Acciones rápidas */}
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Link
          href="/dashboard/familiar/report"
          className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 hover:bg-blue-100 transition-colors"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600">
            <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </div>
          <div>
            <p className="text-[13px] font-semibold text-slate-800">Nuevo reporte</p>
            <p className="text-[11px] text-slate-500">Reportar persona desaparecida</p>
          </div>
        </Link>

        <Link
          href="/dashboard/notifications"
          className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 hover:bg-amber-100 transition-colors"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500">
            <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
          </div>
          <div>
            <p className="text-[13px] font-semibold text-slate-800">Notificaciones</p>
            <p className="text-[11px] text-slate-500">Seguimiento de casos</p>
          </div>
        </Link>

        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-500">
            <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div>
            <p className="text-[13px] font-semibold text-slate-800">{myPeople.length} reportes</p>
            <p className="text-[11px] text-slate-500">Casos que has reportado</p>
          </div>
        </div>
      </div>

      {/* Mis casos */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-3">
          <p className="text-[13px] font-semibold text-slate-800">Mis casos reportados</p>
        </div>

        {isLoading ? (
          <div className="p-6"><LoadingSpinner /></div>
        ) : myPeople.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-slate-100">
              <svg className="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
              </svg>
            </div>
            <p className="text-[13px] font-semibold text-slate-700">Sin casos reportados</p>
            <Link
              href="/dashboard/familiar/report"
              className="mt-1 text-[12px] text-blue-600 hover:underline"
            >
              Reportar una persona desaparecida
            </Link>
          </div>
        ) : (
          <table className="w-full text-[12px]">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-2.5 text-left text-[10px] font-medium uppercase tracking-wide text-slate-500">Nombre</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-medium uppercase tracking-wide text-slate-500">Edad</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-medium uppercase tracking-wide text-slate-500">Desaparecida</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-medium uppercase tracking-wide text-slate-500">Estado</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-medium uppercase tracking-wide text-slate-500">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {myPeople.map((person) => (
                <tr key={person.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-900">{person.full_name}</td>
                  <td className="px-4 py-3 text-slate-500">{person.age_at_disappearance || "—"}</td>
                  <td className="px-4 py-3 text-slate-500">
                    {new Date(person.disappeared_at).toLocaleDateString("es-BO")}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${STATUS_COLOR[person.status] ?? "bg-slate-100 text-slate-600"}`}>
                      {STATUS_LABEL[person.status] ?? person.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/dashboard/persons/${person.id}`}
                      className="text-[11px] font-medium text-blue-600 hover:underline"
                    >
                      Ver detalles
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Info */}
      <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4">
        <div className="flex gap-3">
          <svg className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 5v8a2 2 0 01-2 2h-5l-5 4v-4H4a2 2 0 01-2-2V5a2 2 0 012-2h12a2 2 0 012 2zm-11-1a1 1 0 11-2 0 1 1 0 012 0z" clipRule="evenodd" />
          </svg>
          <div>
            <p className="text-[12px] font-semibold text-blue-800">¿Cómo funciona?</p>
            <p className="mt-0.5 text-[12px] text-blue-700">
              Al reportar una persona desaparecida, tu caso será revisado por nuestro equipo
              dentro de 24 horas. Una vez aprobado, se activará la búsqueda con drones y se
              notificará a los buscadores en tu área.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

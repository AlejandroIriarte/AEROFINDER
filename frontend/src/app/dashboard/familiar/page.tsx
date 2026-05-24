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

function EmptyStateHero() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 via-indigo-50 to-slate-50 px-6 py-12 text-center">
      {/* Decoraciones de fondo */}
      <div className="pointer-events-none absolute -top-10 -right-10 h-40 w-40 rounded-full bg-blue-200/30 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-10 -left-10 h-40 w-40 rounded-full bg-indigo-200/30 blur-2xl" />

      {/* Ilustración drone + persona */}
      <div className="relative mx-auto mb-6 flex h-28 w-28 items-center justify-center">
        <div className="absolute inset-0 rounded-full bg-blue-100/80 animate-pulse" style={{ animationDuration: "3s" }} />
        <svg viewBox="0 0 80 80" fill="none" className="relative h-20 w-20" xmlns="http://www.w3.org/2000/svg">
          {/* Dron */}
          <ellipse cx="40" cy="28" rx="18" ry="7" fill="#DBEAFE" stroke="#3B82F6" strokeWidth="1.5"/>
          <rect x="32" y="24" width="16" height="8" rx="4" fill="#3B82F6"/>
          {/* Hélices */}
          <line x1="22" y1="26" x2="14" y2="22" stroke="#60A5FA" strokeWidth="2" strokeLinecap="round"/>
          <line x1="22" y1="30" x2="14" y2="34" stroke="#60A5FA" strokeWidth="2" strokeLinecap="round"/>
          <line x1="58" y1="26" x2="66" y2="22" stroke="#60A5FA" strokeWidth="2" strokeLinecap="round"/>
          <line x1="58" y1="30" x2="66" y2="34" stroke="#60A5FA" strokeWidth="2" strokeLinecap="round"/>
          {/* Cámara */}
          <circle cx="40" cy="32" r="3" fill="#1D4ED8"/>
          {/* Haz de luz del dron */}
          <path d="M37 35 L33 52 M43 35 L47 52" stroke="#FCD34D" strokeWidth="1" strokeDasharray="2 2" opacity="0.7"/>
          {/* Silueta persona buscada */}
          <circle cx="40" cy="56" r="4" fill="#FDE68A" stroke="#F59E0B" strokeWidth="1.5"/>
          <path d="M34 68 Q40 62 46 68" stroke="#F59E0B" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
          {/* Círculo de búsqueda */}
          <circle cx="40" cy="58" r="9" stroke="#F59E0B" strokeWidth="1.5" strokeDasharray="3 2" fill="none" opacity="0.6"/>
        </svg>
      </div>

      <h2 className="text-[17px] font-bold text-slate-800">Aún no has reportado ningún caso</h2>
      <p className="mx-auto mt-2 max-w-xs text-[12px] leading-relaxed text-slate-500">
        Tu reporte activa la búsqueda con drones e inteligencia artificial.
        Cuanto antes lo hagas, más rápido comenzamos.
      </p>

      {/* Pasos */}
      <div className="mx-auto mt-7 grid max-w-sm grid-cols-3 gap-3">
        {[
          { num: "1", icon: "📋", label: "Completás el reporte" },
          { num: "2", icon: "⏱️", label: "Revisión en 24 h" },
          { num: "3", icon: "🚁", label: "Búsqueda activa" },
        ].map((step, i) => (
          <div key={step.num} className="relative flex flex-col items-center">
            {i < 2 && (
              <div className="absolute right-0 top-3.5 h-px w-full translate-x-1/2 bg-blue-200" />
            )}
            <div className="relative z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white text-[14px] shadow ring-1 ring-blue-200">
              {step.icon}
            </div>
            <p className="mt-2 text-[10px] text-slate-500 leading-snug">{step.label}</p>
          </div>
        ))}
      </div>

      {/* CTA */}
      <div className="mt-8 flex flex-col items-center gap-2">
        <Link
          href="/dashboard/familiar/report"
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-2.5 text-[13px] font-semibold text-white shadow-md shadow-blue-200 hover:bg-blue-700 transition-all hover:-translate-y-0.5"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Registrar persona desaparecida
        </Link>
        <p className="text-[10px] text-slate-400">Es gratis y toma menos de 5 minutos</p>
      </div>
    </div>
  );
}

export default function FamiliarDashboardPage() {
  const { user, accessToken } = useAuthStore();
  const [myPeople, setMyPeople] = useState<MissingPerson[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!accessToken) return;
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
      {isLoading ? (
        <div className="flex justify-center p-10"><LoadingSpinner /></div>
      ) : myPeople.length === 0 ? (
        <EmptyStateHero />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="text-[13px] font-semibold text-slate-800">Mis casos reportados</p>
          </div>
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
        </div>
      )}

      {/* Info — solo si ya tiene casos */}
      {!isLoading && myPeople.length > 0 && (
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
      )}
    </div>
  );
}

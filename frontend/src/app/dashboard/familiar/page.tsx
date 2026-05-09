"use client";

import Link from "next/link";
import { useAuthStore } from "@/store/auth";
import { useEffect, useState } from "react";
import { personsApi } from "@/lib/api";
import type { MissingPerson } from "@/lib/types";

export default function FamiliarDashboardPage() {
  const { user, accessToken } = useAuthStore();
  const [myPeople, setMyPeople] = useState<MissingPerson[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchMyPeople = async () => {
      try {
        // El backend filtra por familiar automáticamente (RLS + filtro app)
        const data = await personsApi.list();
        setMyPeople(data);
      } catch (error) {
        console.error("Error fetching people:", error);
      } finally {
        setIsLoading(false);
      }
    };

    if (accessToken) {
      fetchMyPeople();
    }
  }, [accessToken]);

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      pending_review: "bg-yellow-100 text-yellow-800",
      active: "bg-blue-100 text-blue-800",
      found_alive: "bg-green-100 text-green-800",
      found_deceased: "bg-gray-100 text-gray-800",
      false_report: "bg-red-100 text-red-800",
      archived: "bg-slate-100 text-slate-800",
    };
    return colors[status] || "bg-gray-100 text-gray-800";
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      pending_review: "En revisión",
      active: "Activo",
      found_alive: "Encontrado (vivo)",
      found_deceased: "Encontrado (fallecido)",
      false_report: "Falsa alarma",
      archived: "Archivado",
    };
    return labels[status] || status;
  };

  return (
    <div className="space-y-8 p-6">
      {/* Welcome */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">
          Bienvenido, {user?.full_name}
        </h1>
        <p className="text-gray-600 mt-2">
          Panel de familias para reporte de personas desaparecidas
        </p>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Link
          href="/dashboard/familiar/report"
          className="bg-gradient-to-br from-blue-600 to-blue-700 text-white rounded-xl p-6 shadow-lg hover:shadow-xl transition hover:scale-105 transform"
        >
          <div className="flex items-center gap-4">
            <svg
              className="h-12 w-12"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 4v16m8-8H4"
              />
            </svg>
            <div>
              <h2 className="text-xl font-bold">Nuevo Reporte</h2>
              <p className="text-blue-100 text-sm">Reportar persona desaparecida</p>
            </div>
          </div>
        </Link>

        <Link
          href="/dashboard/notifications"
          className="bg-gradient-to-br from-amber-600 to-amber-700 text-white rounded-xl p-6 shadow-lg hover:shadow-xl transition hover:scale-105 transform"
        >
          <div className="flex items-center gap-4">
            <svg
              className="h-12 w-12"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
              />
            </svg>
            <div>
              <h2 className="text-xl font-bold">Notificaciones</h2>
              <p className="text-amber-100 text-sm">Seguimiento de casos</p>
            </div>
          </div>
        </Link>

        <div className="bg-gradient-to-br from-gray-600 to-gray-700 text-white rounded-xl p-6 shadow-lg">
          <div className="flex items-center gap-4">
            <svg
              className="h-12 w-12"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <div>
              <h2 className="text-xl font-bold">{myPeople.length} Reportes</h2>
              <p className="text-gray-300 text-sm">Casos que has reportado</p>
            </div>
          </div>
        </div>
      </div>

      {/* Mis Casos */}
      <div className="bg-white rounded-xl shadow-lg overflow-hidden">
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">Mis Casos Reportados</h2>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-gray-500">
            <p>Cargando tus casos...</p>
          </div>
        ) : myPeople.length === 0 ? (
          <div className="p-8 text-center">
            <svg
              className="h-12 w-12 mx-auto text-gray-400 mb-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
              />
            </svg>
            <p className="text-gray-600 font-medium">Aún no has reportado ningún caso</p>
            <Link
              href="/dashboard/familiar/report"
              className="text-blue-600 hover:underline mt-2 inline-block"
            >
              Reportar una persona desaparecida
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                    Nombre
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                    Edad
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                    Desaparecida
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                    Estado
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody>
                {myPeople.map((person) => (
                  <tr key={person.id} className="border-b border-gray-200 hover:bg-gray-50">
                    <td className="px-6 py-4 font-medium text-gray-900">
                      {person.full_name}
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {person.age_at_disappearance || "—"}
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {new Date(person.disappeared_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(
                          person.status
                        )}`}
                      >
                        {getStatusLabel(person.status)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <Link
                        href={`/dashboard/persons/${person.id}`}
                        className="text-blue-600 hover:underline text-sm font-medium"
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
      </div>

      {/* Info Box */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex gap-3">
          <svg
            className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M18 5v8a2 2 0 01-2 2h-5l-5 4v-4H4a2 2 0 01-2-2V5a2 2 0 012-2h12a2 2 0 012 2zm-11-1a1 1 0 11-2 0 1 1 0 012 0z"
              clipRule="evenodd"
            />
          </svg>
          <div>
            <h3 className="font-semibold text-blue-900">¿Cómo funciona?</h3>
            <p className="text-sm text-blue-700 mt-1">
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

// =============================================================================
// AEROFINDER Frontend — Página 404 (No encontrada)
// Página de error profesional con opciones de navegación.
// =============================================================================

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

export default function NotFoundPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-white flex flex-col items-center justify-center px-4">
      <div className="max-w-md text-center">
        {/* Icono gigante de error */}
        <div className="mb-8">
          <div className="mx-auto w-24 h-24 rounded-full bg-blue-100 flex items-center justify-center">
            <svg className="h-12 w-12 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>

        {/* Contenido principal */}
        <h1 className="text-5xl font-bold text-gray-900 mb-2">404</h1>
        <h2 className="text-2xl font-semibold text-gray-800 mb-4">Página no encontrada</h2>
        <p className="text-gray-600 mb-8">
          Lo sentimos, la página que buscas no existe o ha sido movida. Si crees que esto es un error, contacta al equipo de soporte.
        </p>

        {/* Botones de acción */}
        <div className="flex flex-col gap-3">
          <button
            onClick={() => router.back()}
            className="w-full bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold py-3 px-4 rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all"
          >
            Volver atrás
          </button>
          <Link
            href="/dashboard"
            className="w-full border border-gray-300 text-gray-700 font-semibold py-3 px-4 rounded-lg hover:bg-gray-50 transition-colors text-center"
          >
            Ir al dashboard
          </Link>
          <Link
            href="/"
            className="w-full border border-gray-300 text-gray-700 font-semibold py-3 px-4 rounded-lg hover:bg-gray-50 transition-colors text-center"
          >
            Ir al inicio
          </Link>
        </div>

        {/* Links útiles */}
        <div className="mt-12 pt-8 border-t border-gray-200">
          <p className="text-sm text-gray-600 mb-4">¿Necesitas ayuda?</p>
          <div className="space-y-2 text-sm">
            <p>
              <a href="tel:+59171234567" className="text-blue-600 hover:text-blue-700 font-semibold">
                📞 Llamar: +591 712 34567
              </a>
            </p>
            <p>
              <a href="mailto:soporte@aerofinder.local" className="text-blue-600 hover:text-blue-700 font-semibold">
                ✉️ Email: soporte@aerofinder.local
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

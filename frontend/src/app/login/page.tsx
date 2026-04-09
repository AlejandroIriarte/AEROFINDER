// =============================================================================
// AEROFINDER Frontend — Página de login
// Componente cliente: usa hooks de Zustand y maneja submit del formulario.
// =============================================================================

"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";

export default function LoginPage() {
  const router  = useRouter();
  const login   = useAuthStore((s) => s.login);

  const [email,     setEmail]     = useState("");
  const [password,  setPassword]  = useState("");
  const [error,     setError]     = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      await login(email, password);
      router.replace("/dashboard");
    } catch (err: unknown) {
      // Extraer mensaje de error del backend
      const axiosErr = err as {
        response?: { data?: { detail?: string | { msg: string }[] } };
      };
      const detail = axiosErr.response?.data?.detail;

      if (typeof detail === "string") {
        setError(detail);
      } else if (Array.isArray(detail)) {
        setError(detail.map((d) => d.msg).join(". "));
      } else {
        setError("Error al iniciar sesión. Verificá tus credenciales.");
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-900 px-4">
      <div className="w-full max-w-sm space-y-8">
        {/* Logotipo / título */}
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-white">
            AEROFINDER
          </h1>
          <p className="mt-2 text-sm text-gray-400">
            Sistema de búsqueda con drones e IA
          </p>
        </div>

        {/* Formulario */}
        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-xl bg-gray-800 px-8 py-10 shadow-xl"
        >
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-gray-300"
            >
              Correo electrónico
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-600 bg-gray-700
                         px-3 py-2 text-white placeholder-gray-500
                         focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="usuario@aerofinder.bo"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-300"
            >
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-600 bg-gray-700
                         px-3 py-2 text-white placeholder-gray-500
                         focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="••••••••"
            />
          </div>

          {/* Mensaje de error */}
          {error && (
            <div className="rounded-lg bg-red-900/50 px-4 py-3 text-sm text-red-300">
              {/* Mensaje de cuenta bloqueada con tiempo restante */}
              {error.toLowerCase().includes("bloqueada") ||
              error.toLowerCase().includes("locked") ? (
                <span>
                  🔒 {error}
                </span>
              ) : (
                <span>⚠️ {error}</span>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold
                       text-white shadow-sm transition-colors
                       hover:bg-blue-500 focus:outline-none focus:ring-2
                       focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-800
                       disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? "Iniciando sesión…" : "Iniciar sesión"}
          </button>
        </form>

        <p className="text-center text-xs text-gray-600">
          AEROFINDER v1.0 — Uso exclusivo del personal autorizado
        </p>
      </div>
    </main>
  );
}

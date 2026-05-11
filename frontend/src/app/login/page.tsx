// =============================================================================
// AEROFINDER Frontend — Página de login
// Tarjeta centrada con logo dron, validaciones robustas, show/hide password.
// =============================================================================

"use client";

import { FormEvent, useState, useRef, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/store/auth";

interface FormErrors {
  email?: string;
  password?: string;
  submit?: string;
}

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const login  = useAuthStore((s) => s.login);
  const formRef = useRef<HTMLFormElement>(null);

  const [email,          setEmail]          = useState("");
  const [password,       setPassword]       = useState("");
  const [rememberDevice, setRememberDevice] = useState(false);
  const [errors,         setErrors]         = useState<FormErrors>({});
  const [isLoading,      setIsLoading]      = useState(false);
  const [showPassword,   setShowPassword]   = useState(false);

  // Pre-llenar email si viene del flujo de registro
  useEffect(() => {
    const emailParam = searchParams.get("email");
    if (emailParam) setEmail(emailParam);
  }, [searchParams]);

  // Scroll a errores
  useEffect(() => {
    if (Object.keys(errors).length > 0 && formRef.current) {
      formRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [errors]);

  function validateForm(): FormErrors {
    const e: FormErrors = {};
    if (!email.trim())              e.email    = "El correo es requerido";
    else if (!validateEmail(email)) e.email    = "Correo electrónico inválido";
    if (!password)                  e.password = "La contraseña es requerida";
    else if (password.length < 6)   e.password = "La contraseña debe tener al menos 6 caracteres";
    return e;
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const validationErrors = validateForm();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    setErrors({});
    setIsLoading(true);
    try {
      await login(email.trim().toLowerCase(), password);
      if (rememberDevice && typeof window !== "undefined") {
        localStorage.setItem("aerofinder_remember_device", "true");
      }
      router.replace("/dashboard");
    } catch (err: unknown) {
      const axiosErr = err as {
        response?: { status?: number; data?: { detail?: string | { msg: string }[] } };
      };
      const detail     = axiosErr.response?.data?.detail;
      const statusCode = axiosErr.response?.status;
      let errorMsg = "Error al iniciar sesión.";
      if (typeof detail === "string")       errorMsg = detail;
      else if (Array.isArray(detail))       errorMsg = detail.map((d) => d.msg).join(". ");
      if (statusCode === 429) errorMsg = "Demasiados intentos fallidos. Intenta de nuevo en 15 minutos.";
      else if (statusCode === 401) errorMsg = "Correo o contraseña incorrecta.";
      setErrors({ submit: errorMsg });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-sm">
        {/* Logo y título */}
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 shadow-sm">
            <svg className="h-7 w-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-slate-900">AEROFINDER</h1>
          <p className="mt-0.5 text-[13px] text-slate-500">Sistema de búsqueda con drones</p>
        </div>

        {/* Tarjeta */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">

            {/* Error global */}
            {errors.submit && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
                <p className="text-[12px] font-medium text-red-700">{errors.submit}</p>
              </div>
            )}

            {/* Email */}
            <div>
              <label htmlFor="email" className="mb-1.5 block text-[12px] font-medium text-slate-700">
                Correo electrónico
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (errors.email) setErrors((p) => { const n = { ...p }; delete n.email; return n; });
                }}
                disabled={isLoading}
                placeholder="usuario@aerofinder.bo"
                className={`w-full rounded-lg border px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.email ? "border-red-400 bg-red-50" : "border-slate-300"
                }`}
              />
              {errors.email && <p className="mt-1 text-[11px] text-red-600">{errors.email}</p>}
            </div>

            {/* Contraseña */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label htmlFor="password" className="text-[12px] font-medium text-slate-700">
                  Contraseña
                </label>
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errors.password) setErrors((p) => { const n = { ...p }; delete n.password; return n; });
                  }}
                  disabled={isLoading}
                  placeholder="••••••••"
                  className={`w-full rounded-lg border px-3 py-2 pr-10 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.password ? "border-red-400 bg-red-50" : "border-slate-300"
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                >
                  {showPassword ? (
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-4.803m5.596-3.856a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0z" />
                    </svg>
                  ) : (
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
              {errors.password && <p className="mt-1 text-[11px] text-red-600">{errors.password}</p>}
            </div>

            {/* Recordar dispositivo */}
            <div className="flex items-center gap-2">
              <input
                id="remember"
                type="checkbox"
                checked={rememberDevice}
                onChange={(e) => setRememberDevice(e.target.checked)}
                disabled={isLoading}
                className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor="remember" className="text-[12px] text-slate-600">
                Recordar este dispositivo
              </label>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-lg bg-blue-600 py-2.5 text-[13px] font-semibold text-white hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Verificando…
                </>
              ) : "Iniciar sesión"}
            </button>
          </form>

          <div className="mt-4 text-center text-[12px] text-slate-500">
            ¿No tienes cuenta?{" "}
            <Link href="/register" className="font-semibold text-blue-600 hover:text-blue-700">
              Crear una
            </Link>
          </div>
        </div>

        <p className="mt-4 text-center text-[11px] text-slate-400">
          Acceso exclusivo de personal autorizado
        </p>
      </div>
    </div>
  );
}

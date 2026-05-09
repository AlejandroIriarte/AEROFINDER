// =============================================================================
// AEROFINDER Frontend — Página de login (Autenticación)
// Login profesional con validaciones robustas, UX pulida, accesibilidad.
// Integración con Zustand store de autenticación.
// =============================================================================

"use client";

import { FormEvent, useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/store/auth";

// ── Tipos y validaciones ────────────────────────────────────────────────────────

interface FormErrors {
  email?: string;
  password?: string;
  submit?: string;
}

function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function validatePassword(password: string): boolean {
  return password.length >= 6;
}

// ── Componente principal ────────────────────────────────────────────────────────

export default function LoginPage() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);
  const formRef = useRef<HTMLFormElement>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberDevice, setRememberDevice] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Scroll a errores
  useEffect(() => {
    if (Object.keys(errors).length > 0 && formRef.current) {
      formRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [errors]);

  function validateForm(): FormErrors {
    const newErrors: FormErrors = {};

    if (!email.trim()) {
      newErrors.email = "El correo es requerido";
    } else if (!validateEmail(email)) {
      newErrors.email = "Correo electrónico inválido";
    }

    if (!password) {
      newErrors.password = "La contraseña es requerida";
    } else if (!validatePassword(password)) {
      newErrors.password = "La contraseña debe tener al menos 6 caracteres";
    }

    return newErrors;
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    
    // Validación en cliente
    const validationErrors = validateForm();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setErrors({});
    setIsLoading(true);

    try {
      await login(email.trim().toLowerCase(), password);
      
      // Guardar preferencia de "recordar dispositivo" si se activa
      if (rememberDevice && typeof window !== "undefined") {
        localStorage.setItem("aerofinder_remember_device", "true");
      }

      router.replace("/dashboard");
    } catch (err: unknown) {
      // Extraer mensaje de error del backend
      const axiosErr = err as {
        response?: { 
          status?: number;
          data?: { 
            detail?: string | { msg: string }[] 
          } 
        };
      };
      const detail = axiosErr.response?.data?.detail;
      const statusCode = axiosErr.response?.status;

      let errorMsg = "Error al iniciar sesión.";
      
      if (typeof detail === "string") {
        errorMsg = detail;
      } else if (Array.isArray(detail)) {
        errorMsg = detail.map((d) => d.msg).join(". ");
      }

      // Mensajes específicos por código de error
      if (statusCode === 429) {
        errorMsg = "Demasiados intentos fallidos. Intenta de nuevo en 15 minutos.";
      } else if (statusCode === 401) {
        errorMsg = "Correo o contraseña incorrecta. Verifica tus credenciales.";
      }

      setErrors({ submit: errorMsg });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-gray-50 flex flex-col">
      {/* Navbar mínima */}
      <nav className="border-b border-gray-200 bg-white/80 backdrop-blur-sm px-6 py-4">
        <div className="mx-auto max-w-6xl flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-blue-700 shadow-md">
              <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </div>
            <span className="text-lg font-bold text-gray-900">AEROFINDER</span>
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-gray-600">¿No tienes cuenta?</span>
            <Link 
              href="/register" 
              className="font-semibold text-blue-600 hover:text-blue-700 transition-colors"
            >
              Crea una aquí
            </Link>
          </div>
        </div>
      </nav>

      {/* Contenedor principal */}
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          {/* Header */}
          <div className="mb-10 text-center">
            <h1 className="text-3xl font-bold text-gray-900">Bienvenido de vuelta</h1>
            <p className="mt-2 text-gray-600">
              Inicia sesión para acceder al panel de operaciones
            </p>
          </div>

          {/* Formulario */}
          <form 
            ref={formRef}
            onSubmit={handleSubmit} 
            className="space-y-6 rounded-2xl border border-gray-200 bg-white p-8 shadow-lg"
          >
            {/* Error global */}
            {errors.submit && (
              <div className="rounded-xl bg-red-50 border border-red-200 p-4">
                <div className="flex gap-3">
                  <svg className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4v.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div>
                    <div className="text-sm font-medium text-red-800">{errors.submit}</div>
                  </div>
                </div>
              </div>
            )}

            {/* Campo Email */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                Correo electrónico
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (errors.email) {
                    setErrors((prev) => {
                      const next = { ...prev };
                      delete next.email;
                      return next;
                    });
                  }
                }}
                className={`w-full px-4 py-3 rounded-lg border text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.email 
                    ? "border-red-500 bg-red-50 focus:ring-red-500" 
                    : "border-gray-300 focus:ring-blue-500"
                }`}
                placeholder="usuario@aerofinder.bo"
                disabled={isLoading}
              />
              {errors.email && (
                <p className="mt-1 text-xs text-red-600 font-medium">{errors.email}</p>
              )}
            </div>

            {/* Campo Contraseña */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                  Contraseña
                </label>
                <Link 
                  href="/" 
                  className="text-xs text-blue-600 hover:text-blue-700 font-medium transition-colors"
                >
                  ¿Olvidaste tu contraseña?
                </Link>
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errors.password) {
                      setErrors((prev) => {
                        const next = { ...prev };
                        delete next.password;
                        return next;
                      });
                    }
                  }}
                  className={`w-full px-4 py-3 rounded-lg border text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 pr-12 ${
                    errors.password 
                      ? "border-red-500 bg-red-50 focus:ring-red-500" 
                      : "border-gray-300 focus:ring-blue-500"
                  }`}
                  placeholder="••••••••"
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                >
                  {showPassword ? (
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-4.803m5.596-3.856a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0z" />
                    </svg>
                  ) : (
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
              {errors.password && (
                <p className="mt-1 text-xs text-red-600 font-medium">{errors.password}</p>
              )}
            </div>

            {/* Checkbox: Recordar dispositivo */}
            <div className="flex items-center gap-2">
              <input
                id="remember"
                type="checkbox"
                checked={rememberDevice}
                onChange={(e) => setRememberDevice(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
                disabled={isLoading}
              />
              <label htmlFor="remember" className="text-sm text-gray-700">
                Recordar este dispositivo
              </label>
            </div>

            {/* Botón Submit */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold py-3 px-4 rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Verificando credenciales…
                </>
              ) : (
                "Iniciar sesión"
              )}
            </button>

            {/* Línea divisora */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200"></div>
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="px-2 bg-white text-gray-500">o</span>
              </div>
            </div>

            {/* Link a registro */}
            <Link
              href="/register"
              className="w-full border border-gray-300 text-gray-700 font-semibold py-3 px-4 rounded-lg hover:bg-gray-50 transition-colors text-center"
            >
              ¿No tienes cuenta? Crear una
            </Link>
          </form>

          {/* Footer info */}
          <div className="mt-8 text-center text-xs text-gray-500 space-y-2">
            <p>
              ✓ Acceso seguro · ✓ Encriptado · ✓ Uso exclusivo de personal autorizado
            </p>
            <p>
              © 2026 AEROFINDER · <a href="#" className="text-blue-600 hover:underline">Términos de uso</a> · <a href="#" className="text-blue-600 hover:underline">Privacidad</a>
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white/50 backdrop-blur-sm mt-12">
        <div className="mx-auto max-w-6xl px-6 py-6 text-center text-xs text-gray-600">
          <p>¿Necesitas ayuda con tu cuenta? Contacta a <a href="tel:+59171234567" className="text-blue-600 font-semibold">+591 712 34567</a></p>
        </div>
      </footer>
    </div>
  );
}

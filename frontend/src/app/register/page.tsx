"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/store/auth";
import { Toast } from "@/components/ui/Toast";

export default function RegisterPage() {
  const router = useRouter();
  const { register, isLoading } = useAuthStore();

  const [email,           setEmail]           = useState("");
  const [password,        setPassword]        = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName,        setFullName]        = useState("");
  const [phone,           setPhone]           = useState("");
  const [showPassword,    setShowPassword]    = useState(false);
  const [showConfirm,     setShowConfirm]     = useState(false);

  const [errors,       setErrors]       = useState<Record<string, string>>({});
  const [toastMessage, setToastMessage] = useState("");
  const [toastType,    setToastType]    = useState<"success" | "error">("success");
  const [showToast,    setShowToast]    = useState(false);

  const validateForm = (): boolean => {
    const e: Record<string, string> = {};
    if (!email.trim())                                         e.email    = "El email es obligatorio";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))      e.email    = "Email inválido";
    if (!password)                                             e.password = "La contraseña es obligatoria"; // pragma: allowlist secret
    else if (password.length < 8)                             e.password = "Mínimo 8 caracteres"; // pragma: allowlist secret
    else if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) e.password = "Debe contener letras y números"; // pragma: allowlist secret
    if (password !== confirmPassword)                          e.confirmPassword = "Las contraseñas no coinciden";
    if (!fullName.trim())                                      e.fullName = "El nombre completo es obligatorio";
    else if (fullName.length < 3)                             e.fullName = "Mínimo 3 caracteres";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    try {
      await register(email, password, fullName, phone || undefined);
      setToastMessage("Cuenta creada exitosamente. Redirigiendo a login...");
      setToastType("success");
      setShowToast(true);
      setTimeout(() => router.push("/login?email=" + encodeURIComponent(email)), 2000);
    } catch (error) {
      let errorMessage = "Error al crear la cuenta";
      if (error instanceof Error) {
        if (error.message.includes("409")) {
          errorMessage = "Este email ya está registrado";
          setErrors({ email: errorMessage });
        } else {
          errorMessage = error.message;
        }
      }
      setToastMessage(errorMessage);
      setToastType("error");
      setShowToast(true);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-8">
      {showToast && (
        <Toast
          type={toastType}
          title={toastType === "success" ? "Éxito" : "Error"}
          message={toastMessage}
          onClose={() => setShowToast(false)}
        />
      )}

      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 shadow-sm">
            <svg className="h-7 w-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-slate-900">AEROFINDER</h1>
          <p className="mt-0.5 text-[13px] text-slate-500">Crear una cuenta de familiar</p>
        </div>

        {/* Tarjeta */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-3.5">

            {/* Email */}
            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-slate-700">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); if (errors.email) setErrors({ ...errors, email: "" }); }}
                placeholder="tu@email.com"
                className={`w-full rounded-lg border px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.email ? "border-red-400 bg-red-50" : "border-slate-300"
                }`}
              />
              {errors.email && <p className="mt-1 text-[11px] text-red-600">{errors.email}</p>}
            </div>

            {/* Nombre completo */}
            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-slate-700">Nombre completo</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => { setFullName(e.target.value); if (errors.fullName) setErrors({ ...errors, fullName: "" }); }}
                placeholder="Juan Pérez"
                className={`w-full rounded-lg border px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.fullName ? "border-red-400 bg-red-50" : "border-slate-300"
                }`}
              />
              {errors.fullName && <p className="mt-1 text-[11px] text-red-600">{errors.fullName}</p>}
            </div>

            {/* Teléfono */}
            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-slate-700">
                Teléfono <span className="text-slate-400">(opcional)</span>
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+591 70000000"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Contraseña */}
            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-slate-700">Contraseña</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); if (errors.password) setErrors({ ...errors, password: "" }); }}
                  placeholder="••••••••"
                  className={`w-full rounded-lg border px-3 py-2 pr-10 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.password ? "border-red-400 bg-red-50" : "border-slate-300"
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-slate-400 hover:text-slate-600"
                  aria-label={showPassword ? "Ocultar" : "Mostrar"}
                >
                  {showPassword ? "Ocultar" : "Ver"}
                </button>
              </div>
              {errors.password && <p className="mt-1 text-[11px] text-red-600">{errors.password}</p>}
            </div>

            {/* Confirmar contraseña */}
            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-slate-700">Confirmar contraseña</label>
              <div className="relative">
                <input
                  type={showConfirm ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); if (errors.confirmPassword) setErrors({ ...errors, confirmPassword: "" }); }}
                  placeholder="••••••••"
                  className={`w-full rounded-lg border px-3 py-2 pr-10 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.confirmPassword ? "border-red-400 bg-red-50" : "border-slate-300"
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-slate-400 hover:text-slate-600"
                  aria-label={showConfirm ? "Ocultar" : "Mostrar"}
                >
                  {showConfirm ? "Ocultar" : "Ver"}
                </button>
              </div>
              {errors.confirmPassword && <p className="mt-1 text-[11px] text-red-600">{errors.confirmPassword}</p>}
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-lg bg-blue-600 py-2.5 text-[13px] font-semibold text-white hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? "Creando cuenta…" : "Crear cuenta"}
            </button>
          </form>

          <div className="mt-4 text-center text-[12px] text-slate-500">
            ¿Ya tienes cuenta?{" "}
            <Link href="/login" className="font-semibold text-blue-600 hover:text-blue-700">
              Iniciar sesión
            </Link>
          </div>
        </div>

        <p className="mt-4 text-center text-[11px] text-slate-400">
          Solo para familias de personas desaparecidas
        </p>
      </div>
    </div>
  );
}

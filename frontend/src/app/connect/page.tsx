// =============================================================================
// AEROFINDER Frontend — Página pública de conexión
// Sin login requerido. Muestra QR + URL del sistema para que cualquier
// usuario pueda conectarse desde su celular sin saber la IP de memoria.
// =============================================================================

"use client";

import { useEffect, useState } from "react";
import QRCode from "react-qr-code";
import Link from "next/link";

export default function ConnectPage() {
  const [origin, setOrigin]     = useState<string>("");
  const [rtmpUrl, setRtmpUrl]   = useState<string>("");
  const [copied, setCopied]     = useState<string | null>(null);

  useEffect(() => {
    // Usar la URL actual del navegador como origen (incluye IP y puerto)
    const base = window.location.origin;
    setOrigin(base);

    // Armar URL RTMP usando la misma IP pero puerto 1935
    try {
      const url = new URL(base);
      setRtmpUrl(`rtmp://${url.hostname}:1935/<SERIAL_DRON>`);
    } catch {
      setRtmpUrl("");
    }
  }, []);

  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  const loginUrl = origin ? `${origin}/login` : "";

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex flex-col items-center justify-center p-6">

      {/* Logo */}
      <div className="mb-8 flex flex-col items-center gap-2">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-blue-700 shadow-lg">
          <svg className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </div>
        <span className="text-2xl font-bold text-gray-900 tracking-tight">AEROFINDER</span>
        <p className="text-sm text-gray-500">Sistema de búsqueda con drones e IA</p>
      </div>

      {/* Tarjeta principal */}
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl overflow-hidden">

        {/* QR */}
        <div className="flex flex-col items-center gap-4 bg-gray-50 px-6 py-8 border-b border-gray-100">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
            Escanea para entrar
          </p>
          {loginUrl ? (
            <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
              <QRCode
                value={loginUrl}
                size={180}
                bgColor="#ffffff"
                fgColor="#1d4ed8"
                level="M"
              />
            </div>
          ) : (
            <div className="h-[212px] w-[212px] flex items-center justify-center rounded-xl bg-gray-100">
              <span className="text-xs text-gray-400">Cargando QR...</span>
            </div>
          )}
          <p className="text-center text-xs text-gray-400 max-w-[200px]">
            Abre la cámara de tu celular y apunta al código
          </p>
        </div>

        {/* URL del sistema */}
        <div className="px-6 py-4 border-b border-gray-100">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-gray-400">
            Dirección del sistema
          </p>
          <div className="flex items-center gap-2">
            <span className="flex-1 rounded-lg bg-gray-50 px-3 py-2 font-mono text-sm text-blue-700 break-all border border-gray-200">
              {loginUrl || "Detectando..."}
            </span>
            <button
              onClick={() => copy(loginUrl, "url")}
              disabled={!loginUrl}
              className="shrink-0 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 transition-colors disabled:opacity-40"
            >
              {copied === "url" ? "✓" : "Copiar"}
            </button>
          </div>
          <p className="mt-1.5 text-[10px] text-gray-400">
            Pega esta dirección en cualquier navegador de la red local
          </p>
        </div>

        {/* URL RTMP para el piloto */}
        {rtmpUrl && (
          <div className="px-6 py-4 border-b border-gray-100 bg-amber-50">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-amber-600">
              URL RTMP — video dron
            </p>
            <div className="flex items-center gap-2">
              <span className="flex-1 rounded-lg bg-white px-3 py-2 font-mono text-xs text-amber-800 break-all border border-amber-200">
                {rtmpUrl}
              </span>
              <button
                onClick={() => copy(rtmpUrl, "rtmp")}
                className="shrink-0 rounded-lg bg-amber-500 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-600 transition-colors"
              >
                {copied === "rtmp" ? "✓" : "Copiar"}
              </button>
            </div>
            <p className="mt-1.5 text-[10px] text-amber-600">
              Reemplazar &lt;SERIAL_DRON&gt; por el número de serie registrado
            </p>
          </div>
        )}

        {/* Botón ingresar */}
        <div className="px-6 py-5">
          <Link
            href="/login"
            className="block w-full rounded-xl bg-blue-600 py-3 text-center text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
          >
            Ingresar al sistema
          </Link>
          <p className="mt-3 text-center text-xs text-gray-400">
            ¿No tienes cuenta?{" "}
            <Link href="/register" className="text-blue-600 hover:underline font-medium">
              Registrarse
            </Link>
          </p>
        </div>
      </div>

      {/* Pie de página */}
      <p className="mt-8 text-center text-xs text-gray-400">
        AEROFINDER · Red local · Solo personal autorizado
      </p>
    </div>
  );
}

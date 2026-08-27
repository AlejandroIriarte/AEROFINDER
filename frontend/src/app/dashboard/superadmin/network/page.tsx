// =============================================================================
// AEROFINDER — Administrador / Red y URLs de drones
// Muestra IP del servidor y URLs para configurar drones DJI.
// =============================================================================

"use client";

import { useEffect, useState } from "react";
import { RoleGuard } from "@/components/ui/RoleGuard";
import { systemApi } from "@/lib/api";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import type { NetworkInfo } from "@/lib/types";

function CopyRow({ label, value, hint }: { label: string; value: string; hint?: string }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="flex flex-col gap-1 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
          <p className="mt-0.5 break-all font-mono text-[13px] text-slate-800">{value}</p>
          {hint && <p className="mt-1 text-[11px] text-slate-400">{hint}</p>}
        </div>
        <button
          onClick={copy}
          className={`flex-shrink-0 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors ${
            copied
              ? "bg-green-100 text-green-700"
              : "border border-slate-200 text-slate-600 hover:bg-slate-50"
          }`}
        >
          {copied ? "Copiado" : "Copiar"}
        </button>
      </div>
    </div>
  );
}

export default function NetworkPage() {
  const [info,    setInfo]    = useState<NetworkInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    systemApi.getNetworkInfo()
      .then(setInfo)
      .catch(() => setError("No se pudo cargar la información de red"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <RoleGuard allowedRoles={["admin", "super_admin"]}>
      <div className="p-5">
        <PageHeader
          title="Red y URLs de drones"
          subtitle="URLs para configurar los drones DJI y acceder al video en vivo"
        />

        {loading ? (
          <div className="flex justify-center py-16"><LoadingSpinner /></div>
        ) : error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-[13px] text-red-700">{error}</div>
        ) : info ? (
          <div className="space-y-6">
            {/* IP del servidor */}
            <section>
              <p className="mb-3 text-[12px] font-semibold uppercase tracking-wider text-slate-400">Servidor</p>
              <div className="space-y-2">
                <CopyRow
                  label="IP del servidor"
                  value={info.server_ip}
                  hint={`Puerto RTMP: ${info.rtmp_port} · Puerto HLS: ${info.hls_port}`}
                />
              </div>
            </section>

            {/* URLs por protocolo */}
            <section>
              <p className="mb-3 text-[12px] font-semibold uppercase tracking-wider text-slate-400">
                URLs de stream — reemplazar {"<serial>"} por el número de serie del dron
              </p>
              <div className="space-y-2">
                <CopyRow
                  label="RTMP (entrada desde DJI)"
                  value={info.rtmp_url_template}
                  hint="Ingresar en la app DJI como destino de transmisión"
                />
                <CopyRow
                  label="HLS (video en vivo)"
                  value={info.hls_url_template}
                  hint="URL para ver el video desde el navegador o el panel"
                />
                <CopyRow
                  label="RTSP (worker IA interno)"
                  value={info.rtsp_url_template}
                  hint="Usado internamente por el AI worker — no exponer al exterior"
                />
              </div>
            </section>

            {/* Nota sobre cambio de IP */}
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <svg className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-[12px] text-amber-700">
                Si la IP del servidor cambia, actualizarla con{" "}
                <span className="font-mono">./scripts/aerofinder.sh ip &lt;nueva_ip&gt;</span>.
                Eso actualiza el .env y la base de datos automáticamente.
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </RoleGuard>
  );
}

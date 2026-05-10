"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { fieldReportsApi } from "@/lib/api";

const MIN_PHOTOS = 3;
const MAX_PHOTOS = 5;

function AppReportPhotosContent() {
  const router       = useRouter();
  const params       = useSearchParams();
  const reportId     = params.get("report_id") ?? "";
  const missionId    = params.get("mission_id") ?? "";
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [confirmedPhotos, setConfirmedPhotos] = useState<number>(0);
  const [uploading,       setUploading]       = useState(false);
  const [analyzing,       setAnalyzing]       = useState(false);
  const [previews,        setPreviews]        = useState<string[]>([]);

  useEffect(() => {
    if (!reportId) router.replace("/app/mission");
  }, [reportId, router]);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || confirmedPhotos >= MAX_PHOTOS) return;

    setUploading(true);
    try {
      const photoIndex = confirmedPhotos + 1;

      // 1. Obtener presigned URL
      const { presigned_url, object_name } = await fieldReportsApi.getUploadUrl(reportId, photoIndex);

      // 2. Subir foto directo a MinIO
      await fetch(presigned_url, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });

      // 3. Confirmar en backend
      await fieldReportsApi.confirmPhoto(reportId, object_name);

      // 4. Actualizar UI
      const previewUrl = URL.createObjectURL(file);
      setPreviews((prev) => [...prev, previewUrl]);
      setConfirmedPhotos((n) => n + 1);
    } catch {
      alert("Error al subir la foto. Intenta de nuevo.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleAnalyze() {
    setAnalyzing(true);
    try {
      await fieldReportsApi.analyze(reportId);
      router.push(`/app/report/result?report_id=${reportId}&mission_id=${missionId}`);
    } catch {
      alert("Error al iniciar el análisis.");
      setAnalyzing(false);
    }
  }

  const canAnalyze = confirmedPhotos >= MIN_PHOTOS && !analyzing;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Toma las fotos</h1>
        <p className="mt-1 text-sm text-gray-500">
          {MIN_PHOTOS} mínimo, {MAX_PHOTOS} máximo · Distintos ángulos: frente, perfil, 3/4
        </p>
      </div>

      {/* Progreso */}
      <div className="flex items-center gap-2">
        {Array.from({ length: MAX_PHOTOS }).map((_, i) => (
          <div
            key={i}
            className={`h-2 flex-1 rounded-full transition-colors ${
              i < confirmedPhotos ? "bg-blue-600" : "bg-gray-200"
            }`}
          />
        ))}
        <span className="shrink-0 text-xs font-semibold text-gray-600">
          {confirmedPhotos}/{MAX_PHOTOS}
        </span>
      </div>

      {/* Previews */}
      {previews.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {previews.map((src, i) => (
            <div key={i} className="relative aspect-square overflow-hidden rounded-xl border border-green-200">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt={`Foto ${i + 1}`} className="h-full w-full object-cover" />
              <span className="absolute bottom-1 right-1 rounded-full bg-green-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                ✓
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Botón tomar foto */}
      {confirmedPhotos < MAX_PHOTOS && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFileChange}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="w-full rounded-xl border-2 border-dashed border-blue-300 bg-blue-50 py-8 text-center text-blue-600 hover:bg-blue-100 disabled:opacity-50"
          >
            {uploading ? (
              <span className="text-sm font-medium">Subiendo foto…</span>
            ) : (
              <div>
                <p className="text-3xl">📷</p>
                <p className="mt-2 text-sm font-semibold">
                  Foto {confirmedPhotos + 1} de {MAX_PHOTOS}
                </p>
                <p className="text-xs text-blue-400">Toca para abrir la cámara</p>
              </div>
            )}
          </button>
        </>
      )}

      {/* Instrucciones */}
      <div className="rounded-lg bg-gray-50 p-3 text-xs text-gray-500">
        <p className="font-semibold text-gray-700 mb-1">Consejos para mejor análisis:</p>
        <ul className="space-y-0.5 list-disc list-inside">
          <li>Foto de frente (rostro completo visible)</li>
          <li>Foto de perfil izquierdo</li>
          <li>Foto de perfil derecho o 3/4</li>
          <li>Buena iluminación, sin objetos tapando el rostro</li>
        </ul>
      </div>

      {/* Botón analizar */}
      <button
        onClick={handleAnalyze}
        disabled={!canAnalyze}
        className="w-full rounded-xl bg-blue-600 py-4 text-base font-bold text-white shadow-lg hover:bg-blue-700 disabled:opacity-40 active:scale-95 transition-transform"
      >
        {analyzing
          ? "Enviando para análisis…"
          : confirmedPhotos < MIN_PHOTOS
          ? `Necesitas ${MIN_PHOTOS - confirmedPhotos} foto${MIN_PHOTOS - confirmedPhotos > 1 ? "s" : ""} más`
          : `Analizar con IA (${confirmedPhotos} fotos)`}
      </button>
    </div>
  );
}

export default function AppReportPhotosPage() {
  return (
    <Suspense>
      <AppReportPhotosContent />
    </Suspense>
  );
}

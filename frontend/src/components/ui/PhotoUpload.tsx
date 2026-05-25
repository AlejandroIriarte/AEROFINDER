"use client";

import { useState, useRef, useCallback } from "react";
import type { PhotoAnalysisResult } from "@/lib/types";

// Tipos válidos de imagen y tamaño máximo
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_PHOTOS = 3;
const MIN_WIDTH  = 200;   // px mínimos de ancho
const MIN_HEIGHT = 200;   // px mínimos de alto

/** Retorna dimensiones de imagen via Promise */
function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload  = () => { URL.revokeObjectURL(url); resolve({ width: img.naturalWidth, height: img.naturalHeight }); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("No se pudo leer la imagen")); };
    img.src = url;
  });
}

export interface SelectedPhoto {
  file: File;
  preview: string;
  status: "pending" | "uploading" | "uploaded" | "error";
  errorMessage?: string;
}

interface PhotoUploadProps {
  photos: SelectedPhoto[];
  onChange: (photos: SelectedPhoto[]) => void;
  maxPhotos?: number;
  disabled?: boolean;
  analyses?: (PhotoAnalysisResult | null)[];
  analyzingIndexes?: number[];
}

export function PhotoUpload({
  photos,
  onChange,
  maxPhotos = MAX_PHOTOS,
  disabled = false,
  analyses = [],
  analyzingIndexes = [],
}: PhotoUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const addFiles = useCallback(
    async (files: FileList | File[]) => {
      const fileArray = Array.from(files);
      const remaining = maxPhotos - photos.length;
      if (remaining <= 0) return;

      const newPhotos: SelectedPhoto[] = [];

      for (const file of fileArray.slice(0, remaining)) {
        if (!ACCEPTED_TYPES.includes(file.type)) {
          newPhotos.push({
            file,
            preview: "",
            status: "error",
            errorMessage: "Formato no válido. Usa JPG, PNG o WebP.",
          });
          continue;
        }
        if (file.size > MAX_SIZE_BYTES) {
          newPhotos.push({
            file,
            preview: "",
            status: "error",
            errorMessage: `Archivo muy grande (${(file.size / 1024 / 1024).toFixed(1)}MB). Máx: 5MB.`,
          });
          continue;
        }
        // Check resolución mínima
        try {
          const { width, height } = await getImageDimensions(file);
          if (width < MIN_WIDTH || height < MIN_HEIGHT) {
            newPhotos.push({
              file,
              preview: "",
              status: "error",
              errorMessage: `Foto muy pequeña (${width}×${height}px). Mínimo ${MIN_WIDTH}×${MIN_HEIGHT}px.`,
            });
            continue;
          }
        } catch {
          newPhotos.push({
            file,
            preview: "",
            status: "error",
            errorMessage: "No se pudo leer la imagen.",
          });
          continue;
        }
        newPhotos.push({
          file,
          preview: URL.createObjectURL(file),
          status: "pending",
        });
      }

      onChange([...photos, ...newPhotos]);
    },
    [photos, onChange, maxPhotos]
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      void addFiles(e.target.files);
    }
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (!disabled) void addFiles(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setDragOver(true);
  };

  const handleDragLeave = () => setDragOver(false);

  const removePhoto = (index: number) => {
    const updated = [...photos];
    // Liberar URL de preview
    if (updated[index].preview) {
      URL.revokeObjectURL(updated[index].preview);
    }
    updated.splice(index, 1);
    onChange(updated);
  };

  const canAddMore = photos.length < maxPhotos && !disabled;

  return (
    <div className="space-y-4">
      <label className="block text-sm font-medium text-gray-700">
        Fotos de la persona ({photos.length}/{maxPhotos})
      </label>

      {/* Zona de drag & drop */}
      {canAddMore && (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition ${
            dragOver
              ? "border-blue-500 bg-blue-50"
              : "border-gray-300 hover:border-blue-400 hover:bg-gray-50"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            onChange={handleFileChange}
            className="hidden"
          />
          <svg
            className="h-10 w-10 mx-auto text-gray-400 mb-3"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          <p className="text-sm text-gray-600 font-medium">
            Arrastra fotos aquí o haz clic para seleccionar
          </p>
          <p className="text-xs text-gray-400 mt-1">
            JPG, PNG o WebP. Máximo 5MB por foto.
          </p>
        </div>
      )}

      {/* Grid de previews */}
      {photos.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          {photos.map((photo, index) => (
            <div
              key={index}
              className="relative group rounded-lg overflow-hidden border border-gray-200 bg-gray-50"
            >
              {/* Imagen o placeholder de error */}
              {photo.preview ? (
                <img
                  src={photo.preview}
                  alt={`Foto ${index + 1}`}
                  className="w-full h-32 object-cover"
                />
              ) : (
                <div className="w-full h-32 flex items-center justify-center bg-red-50">
                  <svg
                    className="h-8 w-8 text-red-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
              )}

              {/* Overlay de estado */}
              {photo.status === "uploading" && (
                <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
                  <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
                </div>
              )}
              {photo.status === "uploaded" && (
                <div className="absolute top-2 right-2 bg-green-500 rounded-full p-1">
                  <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              )}
              {photo.status === "error" && (
                <div className="absolute bottom-0 left-0 right-0 bg-red-600 bg-opacity-90 p-1">
                  <p className="text-xs text-white text-center truncate">
                    {photo.errorMessage || "Error"}
                  </p>
                </div>
              )}

              {/* Badge análisis IA */}
              {analyzingIndexes.includes(index) && (
                <div className="absolute bottom-0 left-0 right-0 bg-blue-600/90 px-2 py-1 flex items-center gap-1">
                  <div className="h-2.5 w-2.5 border-2 border-white border-t-transparent rounded-full animate-spin flex-shrink-0" />
                  <p className="text-[10px] text-white">Analizando…</p>
                </div>
              )}
              {analyses[index] && !analyzingIndexes.includes(index) && photo.status !== "error" && (
                <div className={`absolute bottom-0 left-0 right-0 px-2 py-1 flex items-center gap-1 ${
                  analyses[index]!.quality.is_useful ? "bg-green-600/90" : "bg-amber-500/90"
                }`}>
                  {analyses[index]!.quality.is_useful ? (
                    <>
                      <svg className="h-3 w-3 text-white flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      <p className="text-[10px] text-white">Útil para IA</p>
                    </>
                  ) : (
                    <>
                      <svg className="h-3 w-3 text-white flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p className="text-[10px] text-white truncate">
                        {analyses[index]!.quality.issue_labels[0] ?? "Baja calidad"}
                      </p>
                    </>
                  )}
                </div>
              )}

              {/* Botón eliminar */}
              {!disabled && photo.status !== "uploading" && (
                <button
                  type="button"
                  onClick={() => removePhoto(index)}
                  className="absolute top-2 left-2 bg-red-600 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition"
                >
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}

              {/* Nombre archivo */}
              <div className="p-2">
                <p className="text-xs text-gray-500 truncate">{photo.file.name}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-gray-500">
        Sube una foto reciente con la cara visible y bien iluminada para activar el reconocimiento con IA.
        Formatos: JPG, PNG, WebP. Máximo 5MB por foto.
      </p>
    </div>
  );
}

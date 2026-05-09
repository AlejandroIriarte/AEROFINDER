"use client";

import { useState, useRef, useCallback } from "react";

// Tipos válidos de imagen y tamaño máximo
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_PHOTOS = 3;

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
}

export function PhotoUpload({
  photos,
  onChange,
  maxPhotos = MAX_PHOTOS,
  disabled = false,
}: PhotoUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const addFiles = useCallback(
    (files: FileList | File[]) => {
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
      addFiles(e.target.files);
    }
    // Limpiar input para permitir seleccionar el mismo archivo
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (!disabled && e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
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
        Las fotos son esenciales para la búsqueda con IA. Sube al menos una foto clara del rostro.
      </p>
    </div>
  );
}

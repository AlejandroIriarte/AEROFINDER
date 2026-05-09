"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Toast } from "@/components/ui/Toast";
import { PhotoUpload, type SelectedPhoto } from "@/components/ui/PhotoUpload";
import { personsApi, photosApi } from "@/lib/api";
import type { PersonReportCreate } from "@/lib/types";

export default function FamiliarReportPage() {
  const router = useRouter();

  // Estado del formulario
  const [formData, setFormData] = useState({
    full_name: "",
    gender: "not_specified",
    date_of_birth: "",
    disappeared_at: new Date().toISOString().split("T")[0],
    last_known_location: "",
    last_seen_at: "",
    physical_description: "",
    height_cm: "",
    last_known_clothing: "",
  });

  // Estado de fotos
  const [photos, setPhotos] = useState<SelectedPhoto[]>([]);

  // Estado de UI
  const [isLoading, setIsLoading] = useState(false);
  const [uploadStep, setUploadStep] = useState<string>("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [toastMessage, setToastMessage] = useState("");
  const [toastType, setToastType] = useState<"success" | "error">("success");
  const [showToast, setShowToast] = useState(false);

  const showNotification = (type: "success" | "error", message: string) => {
    setToastMessage(message);
    setToastType(type);
    setShowToast(true);
  };

  // Calcular edad
  const calculateAge = (birthDate: string): number | null => {
    if (!birthDate) return null;
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const month = today.getMonth() - birth.getMonth();
    if (month < 0 || (month === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  };

  // Validación
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.full_name.trim()) {
      newErrors.full_name = "El nombre es obligatorio";
    } else if (formData.full_name.length < 3) {
      newErrors.full_name = "El nombre debe tener al menos 3 caracteres";
    }

    if (!formData.date_of_birth) {
      newErrors.date_of_birth = "La fecha de nacimiento es obligatoria";
    } else {
      const age = calculateAge(formData.date_of_birth);
      if (age !== null && age < 0) {
        newErrors.date_of_birth = "La fecha de nacimiento no es válida";
      }
    }

    if (!formData.disappeared_at) {
      newErrors.disappeared_at = "La fecha de desaparición es obligatoria";
    }

    if (!formData.last_known_location.trim()) {
      newErrors.last_known_location = "La última ubicación conocida es obligatoria";
    }

    if (!formData.physical_description.trim()) {
      newErrors.physical_description = "La descripción física es obligatoria";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Subir fotos a MinIO vía presigned URLs
  const uploadPhotos = async (personId: string): Promise<number> => {
    const validPhotos = photos.filter(
      (p) => p.status === "pending" || p.status === "error"
    );
    if (validPhotos.length === 0) return 0;

    let uploaded = 0;

    for (let i = 0; i < validPhotos.length; i++) {
      const photo = validPhotos[i];
      const idx = photos.indexOf(photo);
      setUploadStep(`Subiendo foto ${i + 1} de ${validPhotos.length}...`);

      // Marcar como uploading
      setPhotos((prev) => {
        const updated = [...prev];
        updated[idx] = { ...updated[idx], status: "uploading" };
        return updated;
      });

      try {
        // 1. Obtener URL firmada
        const { upload_url, photo_id } =
          await photosApi.requestUploadUrl(personId);

        // 2. Subir directo a MinIO
        await photosApi.uploadToPresignedUrl(upload_url, photo.file);

        // 3. Confirmar al backend
        await photosApi.confirm(personId, photo_id);

        // Marcar como uploaded
        setPhotos((prev) => {
          const updated = [...prev];
          updated[idx] = { ...updated[idx], status: "uploaded" };
          return updated;
        });
        uploaded++;
      } catch (err) {
        console.error(`Error subiendo foto ${i + 1}:`, err);
        setPhotos((prev) => {
          const updated = [...prev];
          updated[idx] = {
            ...updated[idx],
            status: "error",
            errorMessage: "Error al subir",
          };
          return updated;
        });
      }
    }

    return uploaded;
  };

  // Envío del formulario
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setIsLoading(true);

    try {
      // 1. Crear el reporte
      setUploadStep("Creando reporte...");
      const payload: PersonReportCreate = {
        full_name: formData.full_name,
        gender: formData.gender,
        date_of_birth: formData.date_of_birth,
        age_at_disappearance: calculateAge(formData.date_of_birth) ?? undefined,
        disappeared_at: formData.disappeared_at,
        last_known_location: formData.last_known_location,
        last_seen_at: formData.last_seen_at || undefined,
        physical_description: formData.physical_description,
        height_cm: formData.height_cm ? parseInt(formData.height_cm) : undefined,
        last_known_clothing: formData.last_known_clothing || undefined,
      };

      const person = await personsApi.report(payload);

      // 2. Subir fotos (si hay)
      const validPhotos = photos.filter((p) => p.status === "pending");
      if (validPhotos.length > 0) {
        const uploaded = await uploadPhotos(person.id);
        if (uploaded < validPhotos.length) {
          showNotification(
            "success",
            `Caso reportado. ${uploaded} de ${validPhotos.length} fotos subidas. Puedes subir las restantes después.`
          );
        } else {
          showNotification(
            "success",
            "Caso reportado exitosamente con fotos. Está en revisión."
          );
        }
      } else {
        showNotification(
          "success",
          "Caso reportado exitosamente. Está en revisión."
        );
      }

      // Redirigir después de 2 segundos
      setTimeout(() => {
        router.push("/dashboard/familiar");
      }, 2000);
    } catch (error) {
      let errorMessage = "Error al reportar el caso";
      if (error instanceof Error) {
        // Extraer detalle de axios si existe
        const axiosErr = error as { response?: { data?: { detail?: string } } };
        if (axiosErr.response?.data?.detail) {
          errorMessage = axiosErr.response.data.detail;
        }
      }
      showNotification("error", errorMessage);
    } finally {
      setIsLoading(false);
      setUploadStep("");
    }
  };

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      {showToast && (
        <Toast
          type={toastType}
          title={toastType === "success" ? "Éxito" : "Error"}
          message={toastMessage}
          onClose={() => setShowToast(false)}
        />
      )}

      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Reportar Persona Desaparecida
          </h1>
          <p className="text-gray-600">
            Por favor, proporciona toda la información disponible sobre la
            persona desaparecida. Tu caso será revisado por nuestro equipo.
          </p>
        </div>

        {/* Formulario */}
        <div className="bg-white rounded-2xl shadow-lg p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Fotos */}
            <PhotoUpload
              photos={photos}
              onChange={setPhotos}
              disabled={isLoading}
            />

            {/* Fila 1: Nombre y Género */}
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nombre Completo *
                </label>
                <input
                  type="text"
                  name="full_name"
                  value={formData.full_name}
                  onChange={handleChange}
                  placeholder="Juan Pérez García"
                  className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 ${
                    errors.full_name
                      ? "border-red-500 bg-red-50 focus:ring-red-500"
                      : "border-gray-300 focus:ring-blue-500"
                  }`}
                />
                {errors.full_name && (
                  <p className="mt-1 text-xs text-red-600 font-medium">
                    {errors.full_name}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Género *
                </label>
                <select
                  name="gender"
                  value={formData.gender}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="not_specified">No especificado</option>
                  <option value="M">Masculino</option>
                  <option value="F">Femenino</option>
                  <option value="O">Otros</option>
                </select>
              </div>
            </div>

            {/* Fila 2: Fechas de nacimiento y desaparición */}
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Fecha de Nacimiento *
                </label>
                <input
                  type="date"
                  name="date_of_birth"
                  value={formData.date_of_birth}
                  onChange={handleChange}
                  className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 ${
                    errors.date_of_birth
                      ? "border-red-500 bg-red-50 focus:ring-red-500"
                      : "border-gray-300 focus:ring-blue-500"
                  }`}
                />
                {errors.date_of_birth && (
                  <p className="mt-1 text-xs text-red-600 font-medium">
                    {errors.date_of_birth}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Fecha de Desaparición *
                </label>
                <input
                  type="date"
                  name="disappeared_at"
                  value={formData.disappeared_at}
                  onChange={handleChange}
                  className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 ${
                    errors.disappeared_at
                      ? "border-red-500 bg-red-50 focus:ring-red-500"
                      : "border-gray-300 focus:ring-blue-500"
                  }`}
                />
                {errors.disappeared_at && (
                  <p className="mt-1 text-xs text-red-600 font-medium">
                    {errors.disappeared_at}
                  </p>
                )}
              </div>
            </div>

            {/* Fila 3: Última ubicación y última hora */}
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Última Ubicación Conocida *
                </label>
                <input
                  type="text"
                  name="last_known_location"
                  value={formData.last_known_location}
                  onChange={handleChange}
                  placeholder="Ej: Parque Central, La Paz"
                  className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 ${
                    errors.last_known_location
                      ? "border-red-500 bg-red-50 focus:ring-red-500"
                      : "border-gray-300 focus:ring-blue-500"
                  }`}
                />
                {errors.last_known_location && (
                  <p className="mt-1 text-xs text-red-600 font-medium">
                    {errors.last_known_location}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Última Hora Vista (Opcional)
                </label>
                <input
                  type="datetime-local"
                  name="last_seen_at"
                  value={formData.last_seen_at}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Fila 4: Altura y ropa */}
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Altura (cm, Opcional)
                </label>
                <input
                  type="number"
                  name="height_cm"
                  value={formData.height_cm}
                  onChange={handleChange}
                  placeholder="170"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Última Ropa Vista (Opcional)
                </label>
                <input
                  type="text"
                  name="last_known_clothing"
                  value={formData.last_known_clothing}
                  onChange={handleChange}
                  placeholder="Ej: Camiseta azul, pantalón negro"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Descripción física */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Descripción Física *
              </label>
              <textarea
                name="physical_description"
                value={formData.physical_description}
                onChange={handleChange}
                placeholder="Describe características físicas: color de ojos, cabello, marcas distintivas, cicatrices, tatuajes, etc."
                rows={5}
                className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 ${
                  errors.physical_description
                    ? "border-red-500 bg-red-50 focus:ring-red-500"
                    : "border-gray-300 focus:ring-blue-500"
                }`}
              />
              {errors.physical_description && (
                <p className="mt-1 text-xs text-red-600 font-medium">
                  {errors.physical_description}
                </p>
              )}
            </div>

            {/* Botones */}
            <div className="flex gap-4 pt-6">
              <button
                type="submit"
                disabled={isLoading}
                className="flex-1 bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {isLoading ? uploadStep || "Enviando..." : "Reportar Caso"}
              </button>
              <button
                type="button"
                onClick={() => router.back()}
                disabled={isLoading}
                className="flex-1 border border-gray-300 text-gray-700 py-3 rounded-lg font-semibold hover:bg-gray-50 transition disabled:opacity-50"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

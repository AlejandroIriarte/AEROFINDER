"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Toast } from "@/components/ui/Toast";
import { PhotoUpload, type SelectedPhoto } from "@/components/ui/PhotoUpload";
import { personsApi, photosApi } from "@/lib/api";
import { useAuthStore } from "@/store/auth";
import type { PersonReportCreate, PhysicalAttributes, PhotoAnalysisResult } from "@/lib/types";

// ── Opciones de selectores ──────────────────────────────────────────────────
const GENDER_OPTIONS     = [["", "No especificado"], ["M", "Masculino"], ["F", "Femenino"], ["O", "Otro"]];
const BUILD_OPTIONS      = [["", "—"], ["delgado", "Delgado"], ["normal", "Normal"], ["robusto", "Robusto"], ["corpulento", "Corpulento"]];
const SKIN_OPTIONS       = [["", "—"], ["muy_claro", "Muy claro"], ["claro", "Claro"], ["medio", "Medio"], ["moreno", "Moreno"], ["oscuro", "Oscuro"]];
const HAIR_COLOR_OPTIONS = [["", "—"], ["negro", "Negro"], ["castaño", "Castaño"], ["rubio", "Rubio"], ["pelirrojo", "Pelirrojo"], ["canoso", "Canoso"], ["blanco", "Blanco"], ["calvo", "Calvo"]];
const HAIR_LENGTH_OPTIONS = [["", "—"], ["calvo", "Calvo"], ["muy_corto", "Muy corto"], ["corto", "Corto"], ["mediano", "Mediano"], ["largo", "Largo"]];
const EYE_COLOR_OPTIONS  = [["", "—"], ["negros", "Negros"], ["marrones", "Marrones"], ["verdes", "Verdes"], ["azules", "Azules"], ["grises", "Grises"], ["miel", "Miel"]];
const FACIAL_HAIR_OPTIONS = [["", "—"], ["ninguno", "Ninguno"], ["barba", "Barba"], ["bigote", "Bigote"], ["barba_y_bigote", "Barba y bigote"], ["incipiente", "Incipiente"]];

const EMPTY_ATTRS: PhysicalAttributes = {
  weight_kg: undefined,
  build: "",
  skin_tone: "",
  hair_color: "",
  hair_length: "",
  eye_color: "",
  wears_glasses: false,
  facial_hair: "",
  distinguishing_marks: "",
  clothing_upper: "",
  clothing_lower: "",
  clothing_footwear: "",
  clothing_accessories: "",
};

export default function FamiliarReportPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  // Redirigir si el rol no es familiar (admin/buscador deben usar el panel de operadores)
  useEffect(() => {
    if (user && user.role !== "familiar") {
      router.replace("/dashboard/persons");
    }
  }, [user, router]);

  // ── Datos básicos ─────────────────────────────────────────────────────────
  const [formData, setFormData] = useState({
    full_name:           "",
    gender:              "",
    date_of_birth:       "",
    disappeared_at:      new Date().toISOString().split("T")[0],
    last_known_location: "",
    last_seen_at:        "",
    physical_description: "",
    height_cm:           "",
  });

  // ── Atributos físicos ─────────────────────────────────────────────────────
  const [attrs, setAttrs] = useState<PhysicalAttributes>({ ...EMPTY_ATTRS });

  // ── Fotos y análisis ──────────────────────────────────────────────────────
  const [photos,           setPhotos]           = useState<SelectedPhoto[]>([]);
  const [photoAnalyses,    setPhotoAnalyses]     = useState<(PhotoAnalysisResult | null)[]>([]);
  const [analyzingIndexes, setAnalyzingIndexes]  = useState<number[]>([]);
  const [aiAutoFilled,     setAiAutoFilled]       = useState(false);
  // Ref para leer valor actualizado dentro de callbacks async sin recapturar en deps
  const aiAutoFilledRef = useRef(false);

  // ── Acordeones ────────────────────────────────────────────────────────────
  const [showPhysical, setShowPhysical] = useState(false);
  const [showClothing, setShowClothing] = useState(false);
  const [showNotes,    setShowNotes]    = useState(false);

  // ── UI ────────────────────────────────────────────────────────────────────
  const [isLoading,    setIsLoading]    = useState(false);
  const [uploadStep,   setUploadStep]   = useState("");
  const [errors,       setErrors]       = useState<Record<string, string>>({});
  const [toastMessage, setToastMessage] = useState("");
  const [toastType,    setToastType]    = useState<"success" | "error">("success");
  const [showToast,    setShowToast]    = useState(false);

  // Limpiar object URLs al desmontar el componente
  useEffect(() => {
    return () => {
      photos.forEach((p) => { if (p.preview) URL.revokeObjectURL(p.preview); });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showNotification = (type: "success" | "error", message: string) => {
    setToastMessage(message); setToastType(type); setShowToast(true);
  };

  const calculateAge = (birthDate: string): number | null => {
    if (!birthDate) return null;
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    if (today.getMonth() - birth.getMonth() < 0 ||
        (today.getMonth() - birth.getMonth() === 0 && today.getDate() < birth.getDate())) age--;
    return age;
  };

  // Analizar fotos nuevas automáticamente al cambiar la lista
  const handlePhotosChange = useCallback(async (newPhotos: SelectedPhoto[]) => {
    setPhotos(newPhotos);

    // Detectar fotos pending sin análisis previo (undefined = nunca analizada)
    const newIndexes = newPhotos
      .map((p, i) => (p.status === "pending" && p.file ? i : -1))
      .filter((i) => i >= 0);

    if (newIndexes.length === 0) return;

    // Inicializar slots faltantes en el array de análisis
    setPhotoAnalyses((prev) => {
      const updated = [...prev];
      while (updated.length < newPhotos.length) updated.push(null);
      return updated;
    });

    setAnalyzingIndexes((prev) => [...prev, ...newIndexes]);

    for (const idx of newIndexes) {
      const photo = newPhotos[idx];
      if (!photo || photo.status === "error") {
        setAnalyzingIndexes((prev) => prev.filter((i) => i !== idx));
        continue;
      }
      try {
        const result = await photosApi.analyzePhoto(photo.file);

        // Escribir resultado inmediatamente via updater — evita stale closure
        setPhotoAnalyses((prev) => {
          const updated = [...prev];
          while (updated.length <= idx) updated.push(null);
          updated[idx] = result;
          return updated;
        });

        if (result.quality.is_useful && !aiAutoFilledRef.current) {
          aiAutoFilledRef.current = true;
          setAiAutoFilled(true);
          setAttrs((prev) => ({
            ...prev,
            skin_tone:     result.attributes.skin_tone  || prev.skin_tone,
            hair_color:    result.attributes.hair_color || prev.hair_color,
            ai_analyzed:   true,
            ai_confidence: result.quality.blur_score,
          }));
          setShowPhysical(true);
          showNotification("success", "Foto analizada — se completaron algunos campos automáticamente.");
        } else if (!result.quality.is_useful && result.quality.issues.length > 0) {
          showNotification("error", `Foto ${idx + 1}: ${result.quality.issue_labels[0] ?? "baja calidad para IA"}. Se recomienda una mejor foto.`);
        }
      } catch {
        setPhotoAnalyses((prev) => {
          const updated = [...prev];
          while (updated.length <= idx) updated.push(null);
          updated[idx] = null;
          return updated;
        });
        showNotification("error", `No se pudo analizar la foto ${idx + 1}.`);
      } finally {
        setAnalyzingIndexes((prev) => prev.filter((i) => i !== idx));
      }
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => { const n = { ...prev }; delete n[name]; return n; });
  };

  const handleAttr = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    setAttrs((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
  };

  const validateForm = (): boolean => {
    const e: Record<string, string> = {};
    if (!formData.full_name.trim())        e.full_name      = "El nombre es obligatorio";
    else if (formData.full_name.length < 3) e.full_name     = "Mínimo 3 caracteres";
    if (!formData.disappeared_at)           e.disappeared_at = "La fecha de desaparición es obligatoria";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const uploadPhotos = async (personId: string): Promise<number> => {
    const pending = photos.filter((p) => p.status === "pending" || p.status === "error");
    if (pending.length === 0) return 0;
    let uploaded = 0;
    for (let i = 0; i < pending.length; i++) {
      const photo = pending[i];
      setUploadStep(`Subiendo foto ${i + 1} de ${pending.length}…`);
      setPhotos((prev) => { const u = [...prev]; const idx = prev.indexOf(photo); u[idx] = { ...u[idx], status: "uploading" }; return u; });
      try {
        const { upload_url, photo_id } = await photosApi.requestUploadUrl(personId);
        await photosApi.uploadToPresignedUrl(upload_url, photo.file);
        await photosApi.confirm(personId, photo_id);
        setPhotos((prev) => { const u = [...prev]; const idx = prev.indexOf(photo); u[idx] = { ...u[idx], status: "uploaded" }; return u; });
        uploaded++;
      } catch {
        setPhotos((prev) => { const u = [...prev]; const idx = prev.indexOf(photo); u[idx] = { ...u[idx], status: "error", errorMessage: "Error al subir" }; return u; });
      }
    }
    return uploaded;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    setIsLoading(true);
    try {
      setUploadStep("Creando reporte…");

      // Limpiar atributos vacíos antes de enviar
      const cleanAttrs = Object.fromEntries(
        Object.entries(attrs).filter(([, v]) => v !== "" && v !== undefined && v !== null)
      ) as PhysicalAttributes;

      const payload: PersonReportCreate = {
        full_name:            formData.full_name,
        disappeared_at:       formData.disappeared_at,
        gender:               formData.gender || undefined,
        date_of_birth:        formData.date_of_birth || undefined,
        age_at_disappearance: formData.date_of_birth ? (calculateAge(formData.date_of_birth) ?? undefined) : undefined,
        last_known_location:  formData.last_known_location || undefined,
        last_seen_at:         formData.last_seen_at || undefined,
        height_cm:            formData.height_cm ? parseInt(formData.height_cm) : undefined,
        physical_description: formData.physical_description || undefined,
        physical_attributes:  Object.keys(cleanAttrs).length > 0 ? cleanAttrs : undefined,
      };

      const person = await personsApi.report(payload);

      const validPhotos = photos.filter((p) => p.status === "pending");
      if (validPhotos.length > 0) {
        const uploaded = await uploadPhotos(person.id);
        showNotification("success",
          uploaded < validPhotos.length
            ? `Caso reportado. ${uploaded}/${validPhotos.length} fotos subidas.`
            : "Caso reportado con fotos. Está en revisión."
        );
      } else {
        showNotification("success", "Caso reportado exitosamente. Está en revisión.");
      }
      setTimeout(() => router.push("/dashboard/familiar"), 2000);
    } catch (error) {
      const axiosErr = error as { response?: { data?: { detail?: string } } };
      showNotification("error", axiosErr?.response?.data?.detail ?? "Error al reportar el caso");
    } finally {
      setIsLoading(false);
      setUploadStep("");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      {showToast && (
        <Toast type={toastType} title={toastType === "success" ? "Éxito" : "Error"}
          message={toastMessage} onClose={() => setShowToast(false)} />
      )}

      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Reportar persona desaparecida</h1>
          <p className="mt-1 text-[13px] text-slate-500">
            Completá los datos disponibles. Solo el nombre y la fecha son obligatorios.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">

          {/* ── SECCIÓN 1: Datos básicos ──────────────────────────────────── */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
            <h2 className="text-[13px] font-semibold text-slate-800">Datos básicos</h2>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Nombre */}
              <div className="sm:col-span-2">
                <label className="block text-[12px] font-medium text-slate-700 mb-1">
                  Nombre completo <span className="text-red-500">*</span>
                </label>
                <input type="text" name="full_name" value={formData.full_name}
                  onChange={handleChange} placeholder="Juan Pérez García"
                  className={`w-full rounded-lg border px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.full_name ? "border-red-400 bg-red-50" : "border-slate-300"}`} />
                {errors.full_name && <p className="mt-1 text-[11px] text-red-600">{errors.full_name}</p>}
              </div>

              {/* Género */}
              <div>
                <label className="block text-[12px] font-medium text-slate-700 mb-1">Género</label>
                <select name="gender" value={formData.gender} onChange={handleChange}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {GENDER_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>

              {/* Fecha de nacimiento */}
              <div>
                <label className="block text-[12px] font-medium text-slate-700 mb-1">Fecha de nacimiento</label>
                <input type="date" name="date_of_birth" value={formData.date_of_birth}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>

              {/* Fecha desaparición */}
              <div>
                <label className="block text-[12px] font-medium text-slate-700 mb-1">
                  Fecha de desaparición <span className="text-red-500">*</span>
                </label>
                <input type="date" name="disappeared_at" value={formData.disappeared_at}
                  onChange={handleChange}
                  className={`w-full rounded-lg border px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.disappeared_at ? "border-red-400 bg-red-50" : "border-slate-300"}`} />
                {errors.disappeared_at && <p className="mt-1 text-[11px] text-red-600">{errors.disappeared_at}</p>}
              </div>

              {/* Última hora vista */}
              <div>
                <label className="block text-[12px] font-medium text-slate-700 mb-1">Última hora vista</label>
                <input type="datetime-local" name="last_seen_at" value={formData.last_seen_at}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>

              {/* Última ubicación */}
              <div className="sm:col-span-2">
                <label className="block text-[12px] font-medium text-slate-700 mb-1">Último lugar conocido</label>
                <input type="text" name="last_known_location" value={formData.last_known_location}
                  onChange={handleChange} placeholder="Ej: Parque Central, La Paz"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
          </div>

          {/* ── SECCIÓN 2: Foto ───────────────────────────────────────────── */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-[13px] font-semibold text-slate-800 mb-1">Foto</h2>
            <p className="text-[11px] text-slate-500 mb-3">
              Sube una foto reciente con la cara visible. Se analizará automáticamente para completar algunos campos.
            </p>
            <PhotoUpload photos={photos} onChange={handlePhotosChange}
              disabled={isLoading} analyses={photoAnalyses} analyzingIndexes={analyzingIndexes} />

            {/* Advertencia: fotos analizadas pero ninguna con cara detectada */}
            {photos.length > 0 &&
              analyzingIndexes.length === 0 &&
              photoAnalyses.some((a) => a !== null) &&
              !photoAnalyses.some((a) => a?.quality.is_useful) && (
              <div className="mt-3 flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                <svg className="h-5 w-5 shrink-0 text-amber-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
                <div className="min-w-0">
                  <p className="text-[12px] font-semibold text-amber-800">
                    No se detectó ningún rostro en las fotos
                  </p>
                  <p className="mt-0.5 text-[11px] text-amber-700 leading-relaxed">
                    Las fotos subidas no son útiles para el reconocimiento por IA (foto borrosa, oscura, muy pequeña, o sin cara visible). Podés enviar el reporte igual, pero te recomendamos agregar una foto clara de la cara de la persona para mejorar las chances de identificación.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* ── SECCIÓN 3: Características físicas (acordeón) ────────────── */}
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <button type="button"
              className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-50 transition-colors"
              onClick={() => setShowPhysical(!showPhysical)}>
              <span className="text-[13px] font-semibold text-slate-800 flex items-center gap-2">
                Características físicas
                {aiAutoFilled && (
                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700">
                    completado por IA
                  </span>
                )}
              </span>
              <svg className={`h-4 w-4 text-slate-400 transition-transform ${showPhysical ? "rotate-180" : ""}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showPhysical && (
              <div className="px-5 pb-5 space-y-4 border-t border-slate-100">
                <div className="grid grid-cols-2 gap-3 pt-4 sm:grid-cols-4">
                  {/* Estatura */}
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">Estatura (cm)</label>
                    <input type="number" name="height_cm" value={formData.height_cm}
                      onChange={handleChange} placeholder="170"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>

                  {/* Peso */}
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">Peso aprox. (kg)</label>
                    <input type="number" name="weight_kg"
                      value={attrs.weight_kg ?? ""}
                      onChange={(e) => setAttrs((p) => ({ ...p, weight_kg: e.target.value ? parseInt(e.target.value) : undefined }))}
                      placeholder="70"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>

                  {/* Complexión */}
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">Complexión</label>
                    <select name="build" value={attrs.build ?? ""} onChange={handleAttr}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500">
                      {BUILD_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>

                  {/* Tono de piel */}
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                      Tono de piel
                      {attrs.ai_analyzed && attrs.skin_tone && (
                        <span className="ml-1 text-[9px] text-green-600">(IA)</span>
                      )}
                    </label>
                    <select name="skin_tone" value={attrs.skin_tone ?? ""} onChange={handleAttr}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500">
                      {SKIN_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>

                  {/* Color de cabello */}
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                      Color de cabello
                      {attrs.ai_analyzed && attrs.hair_color && (
                        <span className="ml-1 text-[9px] text-green-600">(IA)</span>
                      )}
                    </label>
                    <select name="hair_color" value={attrs.hair_color ?? ""} onChange={handleAttr}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500">
                      {HAIR_COLOR_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>

                  {/* Largo de cabello */}
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">Largo de cabello</label>
                    <select name="hair_length" value={attrs.hair_length ?? ""} onChange={handleAttr}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500">
                      {HAIR_LENGTH_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>

                  {/* Color de ojos */}
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">Color de ojos</label>
                    <select name="eye_color" value={attrs.eye_color ?? ""} onChange={handleAttr}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500">
                      {EYE_COLOR_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>

                  {/* Vello facial */}
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">Vello facial</label>
                    <select name="facial_hair" value={attrs.facial_hair ?? ""} onChange={handleAttr}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500">
                      {FACIAL_HAIR_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                </div>

                {/* Usa lentes */}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" name="wears_glasses"
                    checked={attrs.wears_glasses ?? false} onChange={handleAttr}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                  <span className="text-[12px] text-slate-700">Usa lentes</span>
                </label>

                {/* Marcas distintivas */}
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Marcas distintivas (cicatrices, lunares, tatuajes)
                  </label>
                  <textarea name="distinguishing_marks" value={attrs.distinguishing_marks ?? ""}
                    onChange={handleAttr} rows={2}
                    placeholder="Ej: cicatriz en mejilla derecha, tatuaje de águila en brazo izquierdo"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
            )}
          </div>

          {/* ── SECCIÓN 4: Ropa (acordeón) ───────────────────────────────── */}
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <button type="button"
              className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-50 transition-colors"
              onClick={() => setShowClothing(!showClothing)}>
              <span className="text-[13px] font-semibold text-slate-800">Ropa al momento de la desaparición</span>
              <svg className={`h-4 w-4 text-slate-400 transition-transform ${showClothing ? "rotate-180" : ""}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showClothing && (
              <div className="px-5 pb-5 space-y-3 border-t border-slate-100 pt-4">
                {(
                  [
                    ["clothing_upper",       "Ropa superior",   "polera azul manga larga"],
                    ["clothing_lower",       "Ropa inferior",   "jean negro"],
                    ["clothing_footwear",    "Calzado",         "zapatillas blancas Nike"],
                    ["clothing_accessories", "Accesorios",      "mochila gris, gorra negra"],
                  ] as Array<[keyof PhysicalAttributes, string, string]>
                ).map(([name, label, placeholder]) => (
                  <div key={name}>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">{label}</label>
                    <input type="text" name={name}
                      value={(attrs[name] as string) ?? ""}
                      onChange={handleAttr} placeholder={`Ej: ${placeholder}`}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── SECCIÓN 5: Notas adicionales (acordeón) ──────────────────── */}
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <button type="button"
              className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-50 transition-colors"
              onClick={() => setShowNotes(!showNotes)}>
              <span className="text-[13px] font-semibold text-slate-800">Notas adicionales</span>
              <svg className={`h-4 w-4 text-slate-400 transition-transform ${showNotes ? "rotate-180" : ""}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showNotes && (
              <div className="px-5 pb-5 border-t border-slate-100 pt-4">
                <textarea name="physical_description" value={formData.physical_description}
                  onChange={handleChange} rows={3}
                  placeholder="Cualquier información adicional que pueda ayudar en la búsqueda…"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            )}
          </div>

          {/* ── Botones ───────────────────────────────────────────────────── */}
          <div className="flex gap-3">
            <button type="submit" disabled={isLoading}
              className="flex-1 rounded-xl bg-blue-600 py-3 text-[13px] font-semibold text-white hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              {isLoading ? (uploadStep || "Enviando…") : "Reportar caso"}
            </button>
            <button type="button" onClick={() => router.back()} disabled={isLoading}
              className="flex-1 rounded-xl border border-slate-300 py-3 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50">
              Cancelar
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}

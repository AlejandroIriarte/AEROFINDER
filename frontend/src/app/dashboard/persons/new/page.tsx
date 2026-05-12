// frontend/src/app/dashboard/persons/new/page.tsx
// Formulario multi-paso para registrar una persona desaparecida.
// Paso 1: datos básicos → crea el registro (POST /persons/).
// Paso 2: descripción física → personsApi.update en cada blur.
// Paso 3: fotos → presigned URL → MinIO → confirm.

"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import { personsApi, photosApi } from "@/lib/api";
import { validatePhoto, revokePreview, type PhotoValidationResult } from "@/lib/photo-validator";
import type { PersonCreate, PhotoFaceAngle } from "@/lib/types";

// ── Tipos internos ────────────────────────────────────────────────────────────

interface Step1Fields {
  full_name:            string;
  disappeared_at:       string;
  last_known_location:  string;
  gender:               string;
  age_at_disappearance: string;
}

interface Step2Fields {
  physical_description: string;
  last_known_clothing:  string;
  reporter_name:        string;
  reporter_contact:     string;
}

interface FieldError {
  [key: string]: string | undefined;
}

type Step = 1 | 2 | 3;

// ── Validadores inline (onBlur) ───────────────────────────────────────────────

function validateStep1(fields: Step1Fields): FieldError {
  const errs: FieldError = {};
  if (fields.full_name.trim().length < 3)
    errs.full_name = "El nombre debe tener al menos 3 caracteres";
  if (!fields.disappeared_at) {
    errs.disappeared_at = "La fecha de desaparición es requerida";
  } else {
    const d = new Date(fields.disappeared_at);
    if (isNaN(d.getTime()))
      errs.disappeared_at = "Fecha inválida";
    else if (d > new Date())
      errs.disappeared_at = "La fecha no puede ser futura";
  }
  if (fields.age_at_disappearance && isNaN(Number(fields.age_at_disappearance)))
    errs.age_at_disappearance = "Ingresar solo números";
  return errs;
}

// ── Barra de progreso ─────────────────────────────────────────────────────────

function ProgressBar({ step }: { step: Step }) {
  const labels = ["Datos básicos", "Descripción", "Fotos"];
  return (
    <div className="mb-6">
      <div className="mb-2 flex justify-between text-[10px] font-medium text-slate-500">
        {labels.map((l, i) => (
          <span key={l} className={i + 1 <= step ? "text-blue-600" : ""}>{i + 1}. {l}</span>
        ))}
      </div>
      <div className="h-1.5 w-full rounded-full bg-slate-100">
        <div
          className="h-1.5 rounded-full bg-blue-600 transition-all duration-300"
          style={{ width: `${((step - 1) / 2) * 100}%` }}
        />
      </div>
    </div>
  );
}

// ── Campo con validación inline ───────────────────────────────────────────────

function Field({ label, required, error, warning, hint, children }: {
  label: string; required?: boolean; error?: string; warning?: string; hint?: string; children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-semibold text-slate-600">
        {label}{required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-[10px] text-red-600">⚠ {error}</p>}
      {!error && warning && <p className="mt-1 text-[10px] text-amber-600">⚠ {warning}</p>}
      {!error && !warning && hint && <p className="mt-1 text-[10px] text-slate-400">{hint}</p>}
    </div>
  );
}

const INPUT_BASE = "w-full rounded-lg border px-3 py-2.5 text-[13px] focus:outline-none focus:ring-1 transition-colors";
const INPUT_OK    = `${INPUT_BASE} border-slate-200 focus:border-blue-500 focus:ring-blue-500`;
const INPUT_ERROR = `${INPUT_BASE} border-red-400 bg-red-50 focus:border-red-500 focus:ring-red-400`;

// ── Página principal ──────────────────────────────────────────────────────────

export default function NewPersonPage() {
  const router      = useRouter();
  const currentUser = useAuthStore((s) => s.user);

  const [step, setStep]               = useState<Step>(1);
  const [personId, setPersonId]       = useState<string | null>(null);
  const [saving, setSaving]           = useState(false);
  const [savedAt, setSavedAt]         = useState<Date | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);

  // Step 1
  const [s1, setS1] = useState<Step1Fields>({
    full_name: "", disappeared_at: "", last_known_location: "", gender: "", age_at_disappearance: "",
  });
  const [s1Errors, setS1Errors]   = useState<FieldError>({});
  const [s1Touched, setS1Touched] = useState<Record<string, boolean>>({});

  // Step 2
  const [s2, setS2] = useState<Step2Fields>({
    physical_description: "", last_known_clothing: "", reporter_name: "", reporter_contact: "",
  });

  // Step 3
  const [photoAngle, setPhotoAngle]           = useState<PhotoFaceAngle>("frontal");
  const [photoValidation, setPhotoValidation] = useState<PhotoValidationResult | null>(null);
  const [selectedFile, setSelectedFile]       = useState<File | null>(null);
  const [photoUploading, setPhotoUploading]   = useState(false);
  const [photoError, setPhotoError]           = useState<string | null>(null);
  const [uploadedPhotos, setUploadedPhotos]   = useState<string[]>([]);

  const canEdit = currentUser?.role === "admin" || currentUser?.role === "buscador";

  // ── Autoguardado ────────────────────────────────────────────────────────────

  const autosave = useCallback(async (patch: Partial<PersonCreate>) => {
    if (!personId) return;
    try {
      await personsApi.update(personId, patch);
      setSavedAt(new Date());
    } catch { /* silencioso */ }
  }, [personId]);

  // ── Blur handlers ───────────────────────────────────────────────────────────

  function touchField(field: string) {
    setS1Touched((prev) => ({ ...prev, [field]: true }));
    setS1Errors(validateStep1(s1));
  }

  // ── Submit Step 1 ───────────────────────────────────────────────────────────

  async function handleSubmitStep1(e: React.FormEvent) {
    e.preventDefault();
    const errs = validateStep1(s1);
    setS1Errors(errs);
    setS1Touched({ full_name: true, disappeared_at: true, age_at_disappearance: true });
    if (Object.keys(errs).length > 0) return;
    setSaving(true);
    setGlobalError(null);
    try {
      const payload: PersonCreate = {
        full_name:            s1.full_name.trim(),
        disappeared_at:       s1.disappeared_at,
        last_known_location:  s1.last_known_location.trim() || undefined,
        gender:               s1.gender || undefined,
        age_at_disappearance: s1.age_at_disappearance ? Number(s1.age_at_disappearance) : undefined,
      };
      const created = await personsApi.create(payload);
      setPersonId(created.id);
      setSavedAt(new Date());
      setStep(2);
    } catch {
      setGlobalError("Error al guardar. Verificá tu conexión e intentá de nuevo.");
    } finally {
      setSaving(false);
    }
  }

  // ── Submit Step 2 ───────────────────────────────────────────────────────────

  async function handleSubmitStep2(e: React.FormEvent) {
    e.preventDefault();
    if (!personId) return;
    setSaving(true);
    setGlobalError(null);
    try {
      await personsApi.update(personId, {
        physical_description: s2.physical_description.trim() || undefined,
        last_known_clothing:  s2.last_known_clothing.trim() || undefined,
        reporter_name:        s2.reporter_name.trim() || undefined,
        reporter_contact:     s2.reporter_contact.trim() || undefined,
      });
      setSavedAt(new Date());
      setStep(3);
    } catch {
      setGlobalError("Error al guardar la descripción.");
    } finally {
      setSaving(false);
    }
  }

  // ── Selección y validación de foto ─────────────────────────────────────────

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (photoValidation?.previewUrl) revokePreview(photoValidation.previewUrl);
    setSelectedFile(file);
    setPhotoError(null);
    const result = await validatePhoto(file);
    setPhotoValidation(result);
    e.target.value = "";
  }

  // ── Upload foto ─────────────────────────────────────────────────────────────

  async function handleUploadPhoto() {
    if (!selectedFile || !photoValidation?.valid || !personId) return;
    setPhotoUploading(true);
    setPhotoError(null);
    try {
      const { upload_url, photo_id } = await photosApi.requestUploadUrl(personId, photoAngle);
      const res = await fetch(upload_url, {
        method: "PUT", body: selectedFile, headers: { "Content-Type": selectedFile.type },
      });
      if (!res.ok) throw new Error("Error al subir al servidor de archivos");
      await photosApi.confirm(personId, photo_id);
      setUploadedPhotos((prev) => [...prev, photo_id]);
      if (photoValidation.previewUrl) revokePreview(photoValidation.previewUrl);
      setPhotoValidation(null);
      setSelectedFile(null);
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : "Error al subir la foto");
    } finally {
      setPhotoUploading(false);
    }
  }

  // ── Finalizar ───────────────────────────────────────────────────────────────

  function handleFinish() {
    if (personId) router.push(`/dashboard/persons/${personId}`);
    else router.push("/dashboard/persons");
  }

  if (!canEdit) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <p className="text-sm text-slate-400">No tenés permiso para registrar personas.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header sticky */}
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <button
            onClick={() => step === 1 ? router.back() : setStep((s) => (s - 1) as Step)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>
          <div className="flex-1">
            <h1 className="text-[14px] font-semibold text-slate-900">Nueva persona desaparecida</h1>
            {savedAt && (
              <p className="text-[10px] text-green-600">
                ✓ Guardado {savedAt.toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit" })}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-lg px-4 py-6">
        <ProgressBar step={step} />

        {globalError && (
          <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{globalError}</div>
        )}

        {/* ── STEP 1 ── */}
        {step === 1 && (
          <form onSubmit={handleSubmitStep1} className="space-y-4">
            <Field label="Nombre completo" required error={s1Touched.full_name ? s1Errors.full_name : undefined}>
              <input
                value={s1.full_name}
                onChange={(e) => setS1({ ...s1, full_name: e.target.value })}
                onBlur={() => touchField("full_name")}
                placeholder="Ej. María García Rodríguez"
                className={s1Touched.full_name && s1Errors.full_name ? INPUT_ERROR : INPUT_OK}
              />
            </Field>

            <Field label="Fecha de desaparición" required
              error={s1Touched.disappeared_at ? s1Errors.disappeared_at : undefined}
              hint="Fecha en que fue visto por última vez">
              <input
                type="date"
                value={s1.disappeared_at}
                onChange={(e) => setS1({ ...s1, disappeared_at: e.target.value })}
                onBlur={() => touchField("disappeared_at")}
                max={new Date().toISOString().split("T")[0]}
                className={s1Touched.disappeared_at && s1Errors.disappeared_at ? INPUT_ERROR : INPUT_OK}
              />
            </Field>

            <Field label="Última ubicación conocida" hint="Ayuda al equipo a definir la zona de búsqueda del dron">
              <input
                value={s1.last_known_location}
                onChange={(e) => setS1({ ...s1, last_known_location: e.target.value })}
                placeholder="Ej. Av. Blanco Galindo km 5, Cochabamba"
                className={INPUT_OK}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Género">
                <select value={s1.gender} onChange={(e) => setS1({ ...s1, gender: e.target.value })} className={INPUT_OK}>
                  <option value="">Sin especificar</option>
                  <option value="masculino">Masculino</option>
                  <option value="femenino">Femenino</option>
                  <option value="otro">Otro</option>
                </select>
              </Field>
              <Field label="Edad al desaparecer" error={s1Touched.age_at_disappearance ? s1Errors.age_at_disappearance : undefined}>
                <input
                  type="number" min="0" max="120"
                  value={s1.age_at_disappearance}
                  onChange={(e) => setS1({ ...s1, age_at_disappearance: e.target.value })}
                  onBlur={() => touchField("age_at_disappearance")}
                  placeholder="Años"
                  className={s1Touched.age_at_disappearance && s1Errors.age_at_disappearance ? INPUT_ERROR : INPUT_OK}
                />
              </Field>
            </div>

            <button type="submit" disabled={saving}
              className="mt-2 w-full rounded-xl bg-blue-600 py-3 text-[14px] font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {saving ? "Guardando…" : "Continuar →"}
            </button>
          </form>
        )}

        {/* ── STEP 2 ── */}
        {step === 2 && (
          <form onSubmit={handleSubmitStep2} className="space-y-4">
            <Field label="Descripción física" hint="Estatura, complexión, cabello, ojos, señas particulares">
              <textarea rows={3} value={s2.physical_description}
                onChange={(e) => setS2({ ...s2, physical_description: e.target.value })}
                onBlur={() => autosave({ physical_description: s2.physical_description || undefined })}
                placeholder="Ej. 1.65m, contextura delgada, cabello negro lacio, ojos marrones"
                className={INPUT_OK}
              />
            </Field>

            <Field label="Ropa que llevaba al momento">
              <input value={s2.last_known_clothing}
                onChange={(e) => setS2({ ...s2, last_known_clothing: e.target.value })}
                onBlur={() => autosave({ last_known_clothing: s2.last_known_clothing || undefined })}
                placeholder="Ej. jean azul, polera roja, zapatillas blancas"
                className={INPUT_OK}
              />
            </Field>

            <Field label="Reportado por" hint="Nombre de quien hace el reporte">
              <input value={s2.reporter_name}
                onChange={(e) => setS2({ ...s2, reporter_name: e.target.value })}
                onBlur={() => autosave({ reporter_name: s2.reporter_name || undefined })}
                placeholder="Ej. Carlos García (padre)"
                className={INPUT_OK}
              />
            </Field>

            <Field label="Teléfono de contacto" hint="Para notificar cuando haya novedades">
              <input type="tel" value={s2.reporter_contact}
                onChange={(e) => setS2({ ...s2, reporter_contact: e.target.value })}
                onBlur={() => autosave({ reporter_contact: s2.reporter_contact || undefined })}
                placeholder="+591 7xxxxxxx"
                className={INPUT_OK}
              />
            </Field>

            <div className="flex gap-3">
              <button type="submit" disabled={saving}
                className="flex-1 rounded-xl bg-blue-600 py-3 text-[14px] font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors">
                {saving ? "Guardando…" : "Continuar →"}
              </button>
              <button type="button" onClick={() => setStep(3)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-[13px] text-slate-500 hover:bg-slate-50">
                Saltar
              </button>
            </div>
          </form>
        )}

        {/* ── STEP 3 ── */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="rounded-xl bg-blue-50 px-4 py-3 text-[12px] text-blue-700">
              🤖 Las fotos activan el reconocimiento facial con IA. Sin foto el caso se crea igual, pero la búsqueda automática queda en pausa hasta agregar una.
            </div>

            <Field label="Ángulo de la foto">
              <select value={photoAngle} onChange={(e) => setPhotoAngle(e.target.value as PhotoFaceAngle)} className={INPUT_OK}>
                <option value="frontal">Frontal (recomendada)</option>
                <option value="profile">Perfil</option>
                <option value="three_quarter">3/4</option>
                <option value="unknown">Sin especificar</option>
              </select>
            </Field>

            {!photoValidation && (
              <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 bg-white py-8 transition-colors hover:border-blue-400 hover:bg-blue-50">
                <svg viewBox="0 0 24 24" className="h-10 w-10 text-slate-300" fill="none" stroke="currentColor" strokeWidth={1.5}>
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/>
                  <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                <span className="text-[13px] font-medium text-slate-500">Seleccionar foto</span>
                <span className="text-[10px] text-slate-400">JPG, PNG o WEBP · Máx. 10 MB · Mín. 200×200 px</span>
                <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFileSelect} />
              </label>
            )}

            {photoValidation && (
              <div className={`rounded-xl border-2 overflow-hidden ${photoValidation.valid ? "border-green-300" : "border-red-300"}`}>
                {photoValidation.previewUrl && (
                  <div className="relative h-40 bg-slate-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photoValidation.previewUrl} alt="Vista previa" className="h-full w-full object-contain" />
                    {photoValidation.dimensions && (
                      <span className="absolute bottom-2 right-2 rounded bg-black/50 px-2 py-0.5 text-[10px] text-white">
                        {photoValidation.dimensions.width}×{photoValidation.dimensions.height}px
                      </span>
                    )}
                  </div>
                )}
                <div className="p-3 space-y-1">
                  {photoValidation.errors.map((e) => <p key={e} className="text-[11px] text-red-600">❌ {e}</p>)}
                  {photoValidation.warnings.map((w) => <p key={w} className="text-[11px] text-amber-600">⚠ {w}</p>)}
                  {photoValidation.valid && photoValidation.errors.length === 0 && (
                    <p className="text-[11px] text-green-700">✓ Foto válida para reconocimiento IA</p>
                  )}
                </div>
                <div className="flex gap-2 p-3 pt-0">
                  {photoValidation.valid && (
                    <button onClick={handleUploadPhoto} disabled={photoUploading}
                      className="flex-1 rounded-lg bg-blue-600 py-2 text-[12px] font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                      {photoUploading ? "Subiendo…" : "Subir foto"}
                    </button>
                  )}
                  <button onClick={() => { revokePreview(photoValidation.previewUrl); setPhotoValidation(null); setSelectedFile(null); }}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-[12px] text-slate-500 hover:bg-slate-50">
                    Cambiar
                  </button>
                </div>
              </div>
            )}

            {photoError && <p className="rounded-lg bg-red-50 px-3 py-2 text-[11px] text-red-700">{photoError}</p>}

            {uploadedPhotos.length > 0 && (
              <div className="rounded-xl bg-green-50 px-4 py-3">
                <p className="text-[12px] font-medium text-green-700">
                  ✓ {uploadedPhotos.length} foto{uploadedPhotos.length > 1 ? "s" : ""} subida{uploadedPhotos.length > 1 ? "s" : ""} correctamente
                </p>
                <p className="mt-0.5 text-[10px] text-green-600">Pendientes de revisión por el equipo antes de activar la IA</p>
              </div>
            )}

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="mb-2 text-[11px] font-semibold text-slate-600">Guía para mejores resultados</p>
              <ul className="space-y-1 text-[10px] text-slate-500">
                <li>✅ Foto frontal con rostro visible y despejado</li>
                <li>✅ Buena iluminación — sin contraluz ni sombras fuertes</li>
                <li>✅ Sin filtros, marcos ni stickers sobre el rostro</li>
                <li>✅ Una sola persona por foto</li>
                <li>❌ Evitar fotos de grupo, selfies con brazo visible</li>
                <li>❌ Evitar capturas de pantalla de fotos (baja calidad)</li>
              </ul>
            </div>

            <button onClick={handleFinish}
              className="w-full rounded-xl bg-blue-600 py-3 text-[14px] font-semibold text-white hover:bg-blue-700 transition-colors">
              {uploadedPhotos.length > 0 ? "Finalizar" : "Finalizar sin fotos"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

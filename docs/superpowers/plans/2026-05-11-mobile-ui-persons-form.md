# Mobile UI + Person Registration Form — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hacer el dashboard completamente responsivo en móvil y reemplazar el modal de registro de personas con un formulario multi-paso en página dedicada con validación inline, autoguardado y validación de fotos para IA.

**Architecture:** Dos partes independientes. Parte A: layout móvil con Bottom Nav fija + Sidebar como drawer overlay. Parte B: página `/dashboard/persons/new` con 3 pasos progresivos, autoguardado al backend en cada blur, y validación de fotos en el cliente antes de subir a MinIO.

**Tech Stack:** Next.js 14 App Router, Tailwind CSS, React useState/useRef, Canvas API (validación de dimensiones de foto), presigned URL MinIO (flujo existente).

---

## Parte A — Mobile Navigation & Layout

### Task 1: Componente `BottomNav`

**Files:**
- Create: `frontend/src/components/layout/BottomNav.tsx`

- [ ] **Crear el componente**

```tsx
// frontend/src/components/layout/BottomNav.tsx
// Barra de navegación fija en el fondo — solo visible en móvil (md:hidden)
// Muestra 3 items según el rol + botón "Más" que llama onOpenDrawer

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { RoleName } from "@/lib/types";

interface BottomNavItem {
  label: string;
  href:  string;
  icon:  React.ReactNode;
}

interface BottomNavProps {
  role:          RoleName;
  onOpenDrawer:  () => void;
}

const IcoHome = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8}>
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
    <polyline points="9 22 9 12 15 12 15 22"/>
  </svg>
);
const IcoPersons = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8}>
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
);
const IcoMissions = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8}>
    <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
    <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
  </svg>
);
const IcoAlerts = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8}>
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
    <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>
);
const IcoCases = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8}>
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
    <circle cx="12" cy="7" r="4"/>
  </svg>
);
const IcoReport = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8}>
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
);
const IcoBell = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8}>
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
    <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
  </svg>
);
const IcoMore = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8}>
    <line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>
  </svg>
);

// Items según rol — 3 accesos directos + "Más"
const ITEMS_BY_ROLE: Record<RoleName, BottomNavItem[]> = {
  admin:    [
    { label: "Inicio",    href: "/dashboard",          icon: <IcoHome /> },
    { label: "Personas",  href: "/dashboard/persons",  icon: <IcoPersons /> },
    { label: "Misiones",  href: "/dashboard/missions", icon: <IcoMissions /> },
  ],
  buscador: [
    { label: "Inicio",    href: "/dashboard",          icon: <IcoHome /> },
    { label: "Personas",  href: "/dashboard/persons",  icon: <IcoPersons /> },
    { label: "Misiones",  href: "/dashboard/missions", icon: <IcoMissions /> },
  ],
  ayudante: [
    { label: "Inicio",    href: "/dashboard",          icon: <IcoHome /> },
    { label: "Misiones",  href: "/dashboard/missions", icon: <IcoMissions /> },
    { label: "Alertas",   href: "/dashboard/alerts",   icon: <IcoAlerts /> },
  ],
  familiar: [
    { label: "Mis casos", href: "/dashboard/familiar",        icon: <IcoCases /> },
    { label: "Reportar",  href: "/dashboard/familiar/report", icon: <IcoReport /> },
    { label: "Avisos",    href: "/dashboard/notifications",   icon: <IcoBell /> },
  ],
};

export function BottomNav({ role, onOpenDrawer }: BottomNavProps) {
  const pathname = usePathname();
  const items    = ITEMS_BY_ROLE[role] ?? ITEMS_BY_ROLE.familiar;

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 flex h-16 items-center justify-around border-t border-slate-200 bg-white px-2 safe-area-inset-bottom">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-1 transition-colors ${
            isActive(item.href) ? "text-blue-600" : "text-slate-400"
          }`}
        >
          {item.icon}
          <span className="text-[9px] font-medium">{item.label}</span>
        </Link>
      ))}
      {/* Botón "Más" — abre el drawer */}
      <button
        onClick={onOpenDrawer}
        className="flex flex-1 flex-col items-center justify-center gap-0.5 py-1 text-slate-400 transition-colors hover:text-slate-700"
      >
        <IcoMore />
        <span className="text-[9px] font-medium">Más</span>
      </button>
    </nav>
  );
}
```

- [ ] **Verificar**: El archivo existe, no hay errores de tipos obvios.

---

### Task 2: `Sidebar` — modo overlay en móvil

**Files:**
- Modify: `frontend/src/components/layout/Sidebar.tsx`

- [ ] **Cambiar el `<aside>` para soporte overlay en móvil**

Localizar la línea del `<aside>` (actualmente línea 207):
```tsx
// ANTES:
<aside className={`flex h-screen flex-col border-r border-slate-200 bg-white transition-all duration-200 flex-shrink-0 overflow-hidden ${isOpen ? "w-[216px]" : "w-[52px]"}`}>
```

Reemplazar con:
```tsx
// DESPUÉS:
<aside className={`
  flex h-screen flex-col border-r border-slate-200 bg-white transition-all duration-200 overflow-hidden flex-shrink-0
  md:relative md:translate-x-0
  fixed top-0 left-0 z-50
  ${isOpen ? "translate-x-0 w-[216px]" : "-translate-x-full md:translate-x-0 w-[216px] md:w-[52px]"}
`}>
```

- [ ] **Verificar que el import de Sidebar no cambió** — el componente sigue exportándose como `Sidebar` y recibiendo `{ isOpen, badges }`.

---

### Task 3: `Layout` — integrar BottomNav + backdrop overlay

**Files:**
- Modify: `frontend/src/app/dashboard/layout.tsx`

- [ ] **Agregar imports de BottomNav y actualizar `InnerLayout`**

Agregar import después de la línea de Sidebar:
```tsx
import { BottomNav } from "@/components/layout/BottomNav";
```

- [ ] **Reemplazar el bloque `return` de `InnerLayout` (líneas 93-109)**

```tsx
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <Topbar
        breadcrumb={breadcrumb}
        role={user.role}
        userName={user.full_name}
        onToggleSidebar={toggleSidebar}
      />
      <div className="flex flex-1 overflow-hidden">
        {/* Backdrop overlay — solo en móvil cuando sidebar está abierto */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/40 md:hidden"
            onClick={toggleSidebar}
          />
        )}
        <Sidebar isOpen={sidebarOpen} badges={badges} />
        <main className="flex-1 overflow-y-auto bg-slate-100 pb-16 md:pb-0">
          {children}
        </main>
      </div>
      <BottomNav role={user.role} onOpenDrawer={toggleSidebar} />
    </div>
  );
```

> Nota: `pb-16 md:pb-0` en `<main>` evita que el contenido quede tapado por el BottomNav en móvil.

- [ ] **Verificar**: En mobile el sidebar debe arrancar cerrado. El estado inicial en `useState` ya es `false` en localStorage vacío. Confirmar que `localStorage.getItem("aerofinder_sidebar") === "open"` solo devuelve `true` si estaba explícitamente abierto.

---

### Task 4: `Topbar` — responsive en pantallas chicas

**Files:**
- Modify: `frontend/src/components/layout/Topbar.tsx`

- [ ] **Ocultar role chip en pantallas muy chicas y ajustar breadcrumb**

Localizar el role chip (línea 98):
```tsx
// ANTES:
<div className={`${roleStyle.bg} ${roleStyle.text} px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap`}>
  {roleStyle.label}
</div>
```

Reemplazar con:
```tsx
// DESPUÉS — oculto en xs, visible en sm+
<div className={`hidden sm:block ${roleStyle.bg} ${roleStyle.text} px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap`}>
  {roleStyle.label}
</div>
```

Localizar el breadcrumb (línea 88-92):
```tsx
// ANTES:
<div className="flex items-center gap-2 text-sm">
  <span className="text-slate-500">Dashboard</span>
  <span className="text-slate-300">/</span>
  <span className="font-semibold text-slate-900">{breadcrumb}</span>
</div>
```

Reemplazar con:
```tsx
// DESPUÉS — ocultar "Dashboard /" en móvil, solo mostrar sección actual
<div className="flex items-center gap-2 text-sm min-w-0">
  <span className="hidden sm:inline text-slate-500">Dashboard</span>
  <span className="hidden sm:inline text-slate-300">/</span>
  <span className="font-semibold text-slate-900 truncate">{breadcrumb}</span>
</div>
```

- [ ] **Verificar** el archivo: sin errores de sintaxis, props no cambiaron.

---

### Task 5: `Modal` — bottom sheet en móvil

**Files:**
- Modify: `frontend/src/components/ui/Modal.tsx`

- [ ] **Reemplazar el contenido completo del archivo**

```tsx
// frontend/src/components/ui/Modal.tsx
// En móvil (< sm): sube desde abajo como bottom sheet con handle draggable visual.
// En sm+: centrado en pantalla (comportamiento original).

"use client";

import { useEffect } from "react";

interface ModalProps {
  open:     boolean;
  title:    string;
  onClose:  () => void;
  children: React.ReactNode;
}

export function Modal({ open, title, onClose, children }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      {/* Panel */}
      <div className="relative z-10 w-full sm:max-w-md rounded-t-2xl sm:rounded-xl bg-white shadow-xl max-h-[90vh] overflow-y-auto">
        {/* Handle — solo visible en móvil */}
        <div className="sm:hidden flex justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-slate-200" />
        </div>
        <div className="p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
            <button
              onClick={onClose}
              className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Verificar**: todos los lugares que usan `<Modal>` siguen funcionando — la API (props: `open`, `title`, `onClose`, `children`) no cambió.

---

### Task 6: `InfoSection` en detalle de persona — responsive

**Files:**
- Modify: `frontend/src/app/dashboard/persons/[id]/page.tsx`

- [ ] **Localizar el `<div>` de cada fila en `InfoSection` (approx línea 78)**

```tsx
// ANTES:
<div key={label} className="flex gap-4 text-sm">
  <dt className="w-40 shrink-0 font-medium text-gray-500">{label}</dt>
  <dd className="text-gray-900">{value}</dd>
</div>
```

Reemplazar con:
```tsx
// DESPUÉS — columna en móvil, fila en sm+
<div key={label} className="flex flex-col sm:flex-row sm:gap-4 text-sm">
  <dt className="font-medium text-gray-400 sm:w-40 sm:shrink-0 sm:text-gray-500 text-xs sm:text-sm">{label}</dt>
  <dd className="text-gray-900">{value}</dd>
</div>
```

- [ ] **Verificar**: el resto de la página no cambió.

---

## Parte B — Formulario Multi-Paso /persons/new

### Task 7: Utilidad de validación de fotos

**Files:**
- Create: `frontend/src/lib/photo-validator.ts`

- [ ] **Crear el archivo**

```typescript
// frontend/src/lib/photo-validator.ts
// Valida archivos de imagen en el cliente antes de subir a MinIO.
// Verifica tipo, tamaño y dimensiones mínimas para InsightFace buffalo_l.
// No hace detección de rostro (eso lo hace el backend AI).

export interface PhotoValidationResult {
  valid:      boolean;
  errors:     string[];
  warnings:   string[];
  previewUrl: string | null;
  dimensions: { width: number; height: number } | null;
}

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const MIN_DIMENSION_PX   = 200;               // mínimo para InsightFace
const WARN_DIMENSION_PX  = 400;               // por debajo avisa baja calidad
const ALLOWED_TYPES      = ["image/jpeg", "image/png", "image/webp"];

export async function validatePhoto(file: File): Promise<PhotoValidationResult> {
  const errors:   string[] = [];
  const warnings: string[] = [];

  // Tipo de archivo
  if (!ALLOWED_TYPES.includes(file.type)) {
    errors.push("Formato no válido — usar JPG, PNG o WEBP");
  }

  // Tamaño máximo
  if (file.size > MAX_FILE_SIZE_BYTES) {
    errors.push(
      `Archivo muy grande — máximo 10 MB (actual: ${(file.size / 1024 / 1024).toFixed(1)} MB)`
    );
  }

  // Tamaño mínimo (foto muy chica = probablemente baja calidad)
  if (file.size < 20 * 1024) {
    warnings.push("El archivo es muy pequeño — puede que la calidad no sea suficiente para la IA");
  }

  // Dimensiones — solo si no hubo errores de tipo/tamaño
  let dimensions: { width: number; height: number } | null = null;
  let previewUrl: string | null = null;

  if (!errors.some((e) => e.startsWith("Formato") || e.startsWith("Archivo muy grande"))) {
    try {
      const result = await loadImageDimensions(file);
      dimensions = { width: result.width, height: result.height };
      previewUrl = result.objectUrl;

      if (result.width < MIN_DIMENSION_PX || result.height < MIN_DIMENSION_PX) {
        errors.push(
          `Resolución muy baja — mínimo ${MIN_DIMENSION_PX}×${MIN_DIMENSION_PX}px ` +
          `(actual: ${result.width}×${result.height}px)`
        );
      } else if (result.width < WARN_DIMENSION_PX || result.height < WARN_DIMENSION_PX) {
        warnings.push("Resolución baja — una foto más nítida mejora la precisión del reconocimiento");
      }
    } catch {
      errors.push("No se pudo leer la imagen — puede estar corrupta");
    }
  }

  return { valid: errors.length === 0, errors, warnings, previewUrl, dimensions };
}

// Limpia la URL de objeto cuando ya no se necesita la vista previa
export function revokePreview(url: string | null) {
  if (url) URL.revokeObjectURL(url);
}

function loadImageDimensions(
  file: File
): Promise<{ width: number; height: number; objectUrl: string }> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img       = new Image();
    img.onload  = () => resolve({ width: img.naturalWidth, height: img.naturalHeight, objectUrl });
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error("Cannot load image")); };
    img.src = objectUrl;
  });
}
```

- [ ] **Verificar** que el archivo compila: no usa ninguna API de servidor, solo `URL`, `Image`, tipos nativos.

---

### Task 8: Página `/persons/new` — estructura y Step 1 (datos básicos)

**Files:**
- Create: `frontend/src/app/dashboard/persons/new/page.tsx`

- [ ] **Crear la página con Step 1 completo**

```tsx
// frontend/src/app/dashboard/persons/new/page.tsx
// Formulario multi-paso para registrar una persona desaparecida.
// Paso 1: datos básicos → crea el registro en backend (POST /persons/).
// Paso 2: descripción física → PATCH /persons/{id}.
// Paso 3: fotos → presigned URL → MinIO → confirm.
// Autoguardado al backend en cada blur de campo (no localStorage).

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
  last_seen_at:         string;
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

  if (fields.full_name.trim().length < 3) {
    errs.full_name = "El nombre debe tener al menos 3 caracteres";
  }

  if (!fields.disappeared_at) {
    errs.disappeared_at = "La fecha de desaparición es requerida";
  } else {
    const d = new Date(fields.disappeared_at);
    if (isNaN(d.getTime())) {
      errs.disappeared_at = "Fecha inválida";
    } else if (d > new Date()) {
      errs.disappeared_at = "La fecha no puede ser futura";
    }
  }

  if (fields.age_at_disappearance && isNaN(Number(fields.age_at_disappearance))) {
    errs.age_at_disappearance = "Ingresar solo números";
  }

  return errs;
}

// ── Barra de progreso ─────────────────────────────────────────────────────────

function ProgressBar({ step }: { step: Step }) {
  const pct = ((step - 1) / 2) * 100;
  const labels = ["Datos básicos", "Descripción", "Fotos"];
  return (
    <div className="mb-6">
      <div className="mb-2 flex justify-between text-[10px] font-medium text-slate-500">
        {labels.map((l, i) => (
          <span key={l} className={i + 1 <= step ? "text-blue-600" : ""}>
            {i + 1}. {l}
          </span>
        ))}
      </div>
      <div className="h-1.5 w-full rounded-full bg-slate-100">
        <div
          className="h-1.5 rounded-full bg-blue-600 transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ── Campo con validación inline ───────────────────────────────────────────────

function Field({
  label, required, error, warning, hint, children,
}: {
  label:    string;
  required?: boolean;
  error?:   string;
  warning?: string;
  hint?:    string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-semibold text-slate-600">
        {label}{required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      {children}
      {error   && <p className="mt-1 text-[10px] text-red-600">⚠ {error}</p>}
      {!error && warning && <p className="mt-1 text-[10px] text-amber-600">⚠ {warning}</p>}
      {!error && !warning && hint && <p className="mt-1 text-[10px] text-slate-400">{hint}</p>}
    </div>
  );
}

const INPUT_BASE =
  "w-full rounded-lg border px-3 py-2.5 text-[13px] focus:outline-none focus:ring-1 transition-colors";
const INPUT_OK    = `${INPUT_BASE} border-slate-200 focus:border-blue-500 focus:ring-blue-500`;
const INPUT_ERROR = `${INPUT_BASE} border-red-400 bg-red-50 focus:border-red-500 focus:ring-red-400`;

// ── Página principal ──────────────────────────────────────────────────────────

export default function NewPersonPage() {
  const router      = useRouter();
  const currentUser = useAuthStore((s) => s.user);

  const [step, setStep]           = useState<Step>(1);
  const [personId, setPersonId]   = useState<string | null>(null);
  const [saving, setSaving]       = useState(false);
  const [savedAt, setSavedAt]     = useState<Date | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);

  // Step 1
  const [s1, setS1] = useState<Step1Fields>({
    full_name: "", disappeared_at: "", last_known_location: "",
    gender: "", age_at_disappearance: "",
  });
  const [s1Errors, setS1Errors]   = useState<FieldError>({});
  const [s1Touched, setS1Touched] = useState<Record<string, boolean>>({});

  // Step 2
  const [s2, setS2] = useState<Step2Fields>({
    physical_description: "", last_seen_at: "",
    reporter_name: "", reporter_contact: "",
  });

  // Step 3 — fotos
  const [photoAngle, setPhotoAngle]             = useState<PhotoFaceAngle>("frontal");
  const [photoValidation, setPhotoValidation]   = useState<PhotoValidationResult | null>(null);
  const [selectedFile, setSelectedFile]         = useState<File | null>(null);
  const [photoUploading, setPhotoUploading]     = useState(false);
  const [photoError, setPhotoError]             = useState<string | null>(null);
  const [uploadedPhotos, setUploadedPhotos]     = useState<string[]>([]);

  const canEdit = currentUser?.role === "admin" || currentUser?.role === "buscador";

  // ── Autoguardado ────────────────────────────────────────────────────────────

  const autosave = useCallback(async (patch: Partial<PersonCreate>) => {
    if (!personId) return;
    try {
      await personsApi.update(personId, patch);
      setSavedAt(new Date());
    } catch {
      // silencioso — no interrumpir al usuario por un autoguardado fallido
    }
  }, [personId]);

  // ── Blur handlers Step 1 ────────────────────────────────────────────────────

  function touchField(field: string) {
    setS1Touched((prev) => ({ ...prev, [field]: true }));
    const errs = validateStep1(s1);
    setS1Errors(errs);
  }

  // ── Submit Step 1 → POST /persons/ ─────────────────────────────────────────

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

  // ── Submit Step 2 → PATCH /persons/{id} ────────────────────────────────────

  async function handleSubmitStep2(e: React.FormEvent) {
    e.preventDefault();
    if (!personId) return;
    setSaving(true);
    setGlobalError(null);
    try {
      await personsApi.update(personId, {
        physical_description: s2.physical_description.trim() || undefined,
        last_seen_at:         s2.last_seen_at || undefined,
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

    // Limpiar preview anterior
    if (photoValidation?.previewUrl) revokePreview(photoValidation.previewUrl);

    setSelectedFile(file);
    setPhotoError(null);

    const result = await validatePhoto(file);
    setPhotoValidation(result);
    e.target.value = "";
  }

  // ── Upload foto → MinIO (flujo existente) ──────────────────────────────────

  async function handleUploadPhoto() {
    if (!selectedFile || !photoValidation?.valid || !personId) return;
    setPhotoUploading(true);
    setPhotoError(null);
    try {
      const { upload_url, photo_id } = await photosApi.requestUploadUrl(personId, photoAngle);
      const res = await fetch(upload_url, {
        method: "PUT",
        body: selectedFile,
        headers: { "Content-Type": selectedFile.type },
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

  // ── Finalizar → ir al detalle de la persona ────────────────────────────────

  function handleFinish() {
    if (personId) router.push(`/dashboard/persons/${personId}`);
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
      {/* Header */}
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
          <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {globalError}
          </div>
        )}

        {/* ── STEP 1 ── */}
        {step === 1 && (
          <form onSubmit={handleSubmitStep1} className="space-y-4">
            <Field
              label="Nombre completo" required
              error={s1Touched.full_name ? s1Errors.full_name : undefined}
            >
              <input
                value={s1.full_name}
                onChange={(e) => setS1({ ...s1, full_name: e.target.value })}
                onBlur={() => touchField("full_name")}
                placeholder="Ej. María García Rodríguez"
                className={s1Touched.full_name && s1Errors.full_name ? INPUT_ERROR : INPUT_OK}
              />
            </Field>

            <Field
              label="Fecha de desaparición" required
              error={s1Touched.disappeared_at ? s1Errors.disappeared_at : undefined}
              hint="Fecha en que fue visto por última vez"
            >
              <input
                type="date"
                value={s1.disappeared_at}
                onChange={(e) => setS1({ ...s1, disappeared_at: e.target.value })}
                onBlur={() => touchField("disappeared_at")}
                max={new Date().toISOString().split("T")[0]}
                className={s1Touched.disappeared_at && s1Errors.disappeared_at ? INPUT_ERROR : INPUT_OK}
              />
            </Field>

            <Field
              label="Última ubicación conocida"
              hint="Ayuda al equipo a definir la zona de búsqueda del dron"
            >
              <input
                value={s1.last_known_location}
                onChange={(e) => setS1({ ...s1, last_known_location: e.target.value })}
                placeholder="Ej. Av. Blanco Galindo km 5, Cochabamba"
                className={INPUT_OK}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Género">
                <select
                  value={s1.gender}
                  onChange={(e) => setS1({ ...s1, gender: e.target.value })}
                  className={INPUT_OK}
                >
                  <option value="">Sin especificar</option>
                  <option value="masculino">Masculino</option>
                  <option value="femenino">Femenino</option>
                  <option value="otro">Otro</option>
                </select>
              </Field>

              <Field
                label="Edad al desaparecer"
                error={s1Touched.age_at_disappearance ? s1Errors.age_at_disappearance : undefined}
              >
                <input
                  type="number"
                  min="0"
                  max="120"
                  value={s1.age_at_disappearance}
                  onChange={(e) => setS1({ ...s1, age_at_disappearance: e.target.value })}
                  onBlur={() => touchField("age_at_disappearance")}
                  placeholder="Años"
                  className={s1Touched.age_at_disappearance && s1Errors.age_at_disappearance ? INPUT_ERROR : INPUT_OK}
                />
              </Field>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="mt-2 w-full rounded-xl bg-blue-600 py-3 text-[14px] font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {saving ? "Guardando…" : "Continuar →"}
            </button>
          </form>
        )}

        {/* ── STEP 2 ── */}
        {step === 2 && (
          <form onSubmit={handleSubmitStep2} className="space-y-4">
            <Field
              label="Descripción física"
              hint="Incluir: estatura, complexión, color de cabello, ojos, señas particulares"
            >
              <textarea
                rows={3}
                value={s2.physical_description}
                onChange={(e) => setS2({ ...s2, physical_description: e.target.value })}
                onBlur={() => personId && autosave({ physical_description: s2.physical_description || undefined })}
                placeholder="Ej. 1.65m, contextura delgada, cabello negro lacio, ojos marrones, lunar en mejilla izquierda"
                className={INPUT_OK}
              />
            </Field>

            <Field label="Ropa que llevaba al momento">
              <input
                value={s2.last_seen_at}
                onChange={(e) => setS2({ ...s2, last_seen_at: e.target.value })}
                onBlur={() => personId && autosave({ last_seen_at: s2.last_seen_at || undefined })}
                placeholder="Ej. jean azul, polera roja, zapatillas blancas"
                className={INPUT_OK}
              />
            </Field>

            <Field label="Reportado por" hint="Nombre de quien hace el reporte">
              <input
                value={s2.reporter_name}
                onChange={(e) => setS2({ ...s2, reporter_name: e.target.value })}
                onBlur={() => personId && autosave({ reporter_name: s2.reporter_name || undefined })}
                placeholder="Ej. Carlos García (padre)"
                className={INPUT_OK}
              />
            </Field>

            <Field label="Teléfono de contacto" hint="Para notificar cuando haya novedades">
              <input
                type="tel"
                value={s2.reporter_contact}
                onChange={(e) => setS2({ ...s2, reporter_contact: e.target.value })}
                onBlur={() => personId && autosave({ reporter_contact: s2.reporter_contact || undefined })}
                placeholder="+591 7xxxxxxx"
                className={INPUT_OK}
              />
            </Field>

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 rounded-xl bg-blue-600 py-3 text-[14px] font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {saving ? "Guardando…" : "Continuar →"}
              </button>
              <button
                type="button"
                onClick={() => setStep(3)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-[13px] text-slate-500 hover:bg-slate-50"
              >
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

            {/* Selector de ángulo */}
            <Field label="Ángulo de la foto">
              <select
                value={photoAngle}
                onChange={(e) => setPhotoAngle(e.target.value as PhotoFaceAngle)}
                className={INPUT_OK}
              >
                <option value="frontal">Frontal (recomendada)</option>
                <option value="profile">Perfil</option>
                <option value="three_quarter">3/4</option>
                <option value="unknown">Sin especificar</option>
              </select>
            </Field>

            {/* Zona de selección de foto */}
            {!photoValidation && (
              <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 bg-white py-8 transition-colors hover:border-blue-400 hover:bg-blue-50">
                <svg viewBox="0 0 24 24" className="h-10 w-10 text-slate-300" fill="none" stroke="currentColor" strokeWidth={1.5}>
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/>
                  <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                <span className="text-[13px] font-medium text-slate-500">Seleccionar foto</span>
                <span className="text-[10px] text-slate-400">JPG, PNG o WEBP · Máx. 10 MB · Mín. 200×200 px</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={handleFileSelect}
                />
              </label>
            )}

            {/* Resultado de validación */}
            {photoValidation && (
              <div className={`rounded-xl border-2 overflow-hidden ${
                photoValidation.valid ? "border-green-300" : "border-red-300"
              }`}>
                {/* Preview */}
                {photoValidation.previewUrl && (
                  <div className="relative h-40 bg-slate-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photoValidation.previewUrl}
                      alt="Vista previa"
                      className="h-full w-full object-contain"
                    />
                    {photoValidation.dimensions && (
                      <span className="absolute bottom-2 right-2 rounded bg-black/50 px-2 py-0.5 text-[10px] text-white">
                        {photoValidation.dimensions.width}×{photoValidation.dimensions.height}px
                      </span>
                    )}
                  </div>
                )}

                <div className="p-3 space-y-1">
                  {/* Errores */}
                  {photoValidation.errors.map((e) => (
                    <p key={e} className="text-[11px] text-red-600">❌ {e}</p>
                  ))}
                  {/* Advertencias */}
                  {photoValidation.warnings.map((w) => (
                    <p key={w} className="text-[11px] text-amber-600">⚠ {w}</p>
                  ))}
                  {/* OK */}
                  {photoValidation.valid && photoValidation.errors.length === 0 && (
                    <p className="text-[11px] text-green-700">✓ Foto válida para reconocimiento IA</p>
                  )}
                </div>

                <div className="flex gap-2 p-3 pt-0">
                  {photoValidation.valid && (
                    <button
                      onClick={handleUploadPhoto}
                      disabled={photoUploading}
                      className="flex-1 rounded-lg bg-blue-600 py-2 text-[12px] font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      {photoUploading ? "Subiendo…" : "Subir foto"}
                    </button>
                  )}
                  <button
                    onClick={() => { revokePreview(photoValidation.previewUrl); setPhotoValidation(null); setSelectedFile(null); }}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-[12px] text-slate-500 hover:bg-slate-50"
                  >
                    Cambiar
                  </button>
                </div>
              </div>
            )}

            {photoError && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-[11px] text-red-700">{photoError}</p>
            )}

            {/* Fotos subidas */}
            {uploadedPhotos.length > 0 && (
              <div className="rounded-xl bg-green-50 px-4 py-3">
                <p className="text-[12px] font-medium text-green-700">
                  ✓ {uploadedPhotos.length} foto{uploadedPhotos.length > 1 ? "s" : ""} subida{uploadedPhotos.length > 1 ? "s" : ""} correctamente
                </p>
                <p className="mt-0.5 text-[10px] text-green-600">
                  Pendientes de revisión por el equipo antes de activar la IA
                </p>
              </div>
            )}

            {/* Guía de fotos */}
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

            {/* Botones finales */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={handleFinish}
                className="flex-1 rounded-xl bg-blue-600 py-3 text-[14px] font-semibold text-white hover:bg-blue-700 transition-colors"
              >
                {uploadedPhotos.length > 0 ? "Finalizar" : "Finalizar sin fotos"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Verificar imports**: `personsApi.update` existe en `api.ts` como `patch`  — verificar el nombre correcto.

---

### Task 9: Verificar que `personsApi` tenga método `update` (PATCH)

**Files:**
- Read: `frontend/src/lib/api.ts` (sección personsApi)

- [ ] **Buscar el método PATCH en personsApi**

```bash
grep -n "patch\|update" frontend/src/lib/api.ts | grep -i person
```

Si el método se llama `patch` en lugar de `update`, reemplazar todas las ocurrencias en `new/page.tsx`:
- `personsApi.update(personId, ...)` → `personsApi.patch(personId, ...)`

- [ ] **Verificar que el tipo `PersonCreate` incluye todos los campos usados**

```bash
grep -A 20 "interface PersonCreate" frontend/src/lib/types.ts
```

Si falta algún campo (`gender`, `age_at_disappearance`, `last_seen_at`, etc.), agregarlos al interface en `types.ts`.

---

### Task 10: Conectar `/persons/page.tsx` con la nueva página

**Files:**
- Modify: `frontend/src/app/dashboard/persons/page.tsx`

- [ ] **Reemplazar el botón "Registrar persona" para navegar a `/persons/new`**

Localizar el botón en `PageHeader` (aprox. línea 136-145):
```tsx
// ANTES:
<button
  onClick={() => setShowCreate(true)}
  className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-[12px] font-semibold text-white hover:bg-blue-700 transition-colors"
>
  <svg .../>
  Registrar persona
</button>
```

Agregar import de `useRouter` si no está ya, y reemplazar con:
```tsx
// DESPUÉS:
import { useRouter } from "next/navigation";
// ... dentro del componente:
const router = useRouter();
// ... el botón:
<button
  onClick={() => router.push("/dashboard/persons/new")}
  className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-[12px] font-semibold text-white hover:bg-blue-700 transition-colors"
>
  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 stroke-white fill-none" strokeWidth={2.5}>
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
  Registrar persona
</button>
```

- [ ] **Eliminar el estado y modal que ya no se usan**

Eliminar de `persons/page.tsx`:
- `const [showCreate, setShowCreate] = useState(false);`
- `const [saving, setSaving] = useState(false);`
- `const [form, setForm] = useState<PersonCreate>({...});`
- La función `handleCreate`
- El bloque `<Modal open={showCreate} ...>` completo al final del JSX

También eliminar el import de `Modal` y `PersonCreate` si quedan sin usar:
```tsx
// Eliminar si ya no se usan:
import { Modal } from "@/components/ui/Modal";
import type { MissingPerson, PersonCreate } from "@/lib/types";
// Dejar solo:
import type { MissingPerson } from "@/lib/types";
```

- [ ] **Verificar**: el botón en `EmptyState` también debe apuntar a `/persons/new` (línea ~162)

```tsx
// ANTES:
onClick={() => setShowCreate(true)}

// DESPUÉS:
onClick={() => router.push("/dashboard/persons/new")}
```

---

### Task 11: Tablas con scroll horizontal en móvil

**Files:**
- Modify: `frontend/src/app/dashboard/users/page.tsx`
- Modify: `frontend/src/app/dashboard/detections/page.tsx`

- [ ] **Envolver cada tabla en `overflow-x-auto` — users/page.tsx**

Localizar el `<div className="overflow-hidden rounded-xl border...">` que envuelve la tabla (approx línea 115):
```tsx
// ANTES:
<div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
  <table className="w-full text-[12px]">

// DESPUÉS:
<div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
  <table className="w-full min-w-[640px] text-[12px]">
```

- [ ] **Mismo cambio en detections/page.tsx** — buscar el wrapper de la tabla y agregar `overflow-x-auto` + `min-w-[640px]` a la tabla.

---

## Self-Review

**Spec coverage:**
- ✅ Sidebar → overlay drawer en móvil (Task 2, 3)
- ✅ Bottom Nav por rol (Task 1)
- ✅ Topbar responsive (Task 4)
- ✅ Modal → bottom sheet (Task 5)
- ✅ InfoSection responsive (Task 6)
- ✅ Validador de fotos (Task 7)
- ✅ Formulario 3 pasos con inline validation (Task 8)
- ✅ Autosave al backend en blur (Task 8 — Step 2)
- ✅ Validación de foto: tipo, tamaño, dimensiones (Task 7)
- ✅ Guía de fotos + feedback visual (Task 8 — Step 3)
- ✅ Redirigir botón Registrar a /persons/new (Task 10)
- ✅ Tablas con overflow-x (Task 11)

**Placeholder scan:** Ningún TBD o TODO en el plan.

**Type consistency:**
- `PhotoValidationResult` definido en Task 7, importado en Task 8 ✓
- `revokePreview` definido en Task 7, importado en Task 8 ✓
- `validatePhoto` definido en Task 7, importado en Task 8 ✓
- `personsApi.update` verificado en Task 9 antes de usarlo en Task 8 ✓
- `BottomNav` definido en Task 1, importado en Task 3 ✓

**Riesgo conocido:** `personsApi` puede no tener un método `update` — Task 9 lo verifica y corrige antes de ejecutar.

# Photo Validation & Document OCR — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add face-detection validation with override on familiar photo uploads, and a PaddleOCR document scanner that auto-fills the report form from a CI boliviana or passport photo.

**Architecture:** Two independent features. Feature 1 is frontend-only (backend endpoint already exists). Feature 2 adds `ocr_service.py` + `ocr.py` router to backend (PaddleOCR CPU) and a scan button + handler to the familiar report page.

**Tech Stack:** FastAPI + PaddleOCR + Next.js 14 App Router · paddlepaddle-cpu · paddleocr · regex parsing

---

## File map

### Create
- `backend/app/services/ocr_service.py` — PaddleOCR singleton + CI/passport parsing
- `backend/app/routers/ocr.py` — `POST /ocr/document` endpoint

### Modify
- `backend/requirements.txt` — add paddlepaddle-cpu, paddleocr
- `backend/app/main.py` — register ocr router
- `frontend/src/lib/types.ts` — add `OcrDocumentResult`
- `frontend/src/lib/api.ts` — add `ocrApi.scanDocument`
- `frontend/src/app/dashboard/familiar/report/page.tsx` — face validation override + OCR button
- `frontend/src/app/dashboard/persons/[id]/page.tsx` — face check before confirm

---

## Task 1: Backend — PaddleOCR dependencies

**Files:**
- Modify: `backend/requirements.txt`

- [ ] **Agregar dependencias al final de requirements.txt**

```
paddlepaddle-cpu==2.6.1
paddleocr==2.7.3
```

- [ ] **Verificar que el archivo quedó bien**

```bash
tail -5 /home/wiz/aerofinder/backend/requirements.txt
# Esperado: líneas con paddlepaddle-cpu y paddleocr al final
```

- [ ] **Commit**

```bash
cd /home/wiz/aerofinder
git add backend/requirements.txt
git commit -m "feat: add paddlepaddle-cpu + paddleocr to backend requirements"
```

---

## Task 2: Backend — OcrService

**Files:**
- Create: `backend/app/services/ocr_service.py`

- [ ] **Crear el archivo completo**

```python
# =============================================================================
# AEROFINDER Backend — OcrService
# Extrae campos estructurados de fotos de documentos (CI boliviana, pasaporte).
# Usa PaddleOCR con CPU. Se inicializa lazy para no bloquear el arranque.
# =============================================================================

import logging
import re
from dataclasses import dataclass
from typing import Optional

import cv2
import numpy as np

logger = logging.getLogger(__name__)


@dataclass
class OcrResult:
    document_type: str          # "ci_boliviana" | "passport" | "other"
    full_name: Optional[str]
    date_of_birth: Optional[str]  # ISO YYYY-MM-DD
    gender: Optional[str]         # "M" | "F"
    document_number: Optional[str]
    address: Optional[str]


class OcrService:
    """
    Singleton para extracción de texto de documentos de identidad.
    PaddleOCR se inicializa en la primera llamada (~3-5 segundos).
    """

    def __init__(self) -> None:
        self._reader = None

    def _get_reader(self):
        if self._reader is None:
            try:
                from paddleocr import PaddleOCR  # import lazy para no bloquear arranque
                self._reader = PaddleOCR(
                    use_angle_cls=True,
                    lang="es",
                    use_gpu=False,
                    show_log=False,
                )
                logger.info("PaddleOCR inicializado correctamente")
            except Exception:
                logger.error("Error al inicializar PaddleOCR", exc_info=True)
                raise
        return self._reader

    def extract_document_fields(self, image_bytes: bytes) -> OcrResult:
        """
        Lee la imagen y extrae campos del documento.
        Detecta automáticamente si es CI boliviana o pasaporte.
        """
        try:
            reader = self._get_reader()
            nparr = np.frombuffer(image_bytes, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            if img is None:
                raise ValueError("No se pudo decodificar la imagen")

            ocr_result = reader.ocr(img, cls=True)
            if not ocr_result or not ocr_result[0]:
                return OcrResult(
                    document_type="other",
                    full_name=None,
                    date_of_birth=None,
                    gender=None,
                    document_number=None,
                    address=None,
                )

            # Filtrar líneas con confianza > 0.5
            lines = [
                item[1][0]
                for item in ocr_result[0]
                if item[1][1] > 0.5
            ]
            text = "\n".join(lines)

            if self._is_passport(lines):
                return self._parse_passport(text, lines)
            return self._parse_ci_boliviana(text, lines)

        except Exception:
            logger.error("Error en extracción OCR de documento", exc_info=True)
            raise

    # ── Detección de tipo ────────────────────────────────────────────────────

    def _is_passport(self, lines: list[str]) -> bool:
        """Detecta pasaporte por texto explícito o líneas MRZ."""
        for line in lines:
            upper = line.upper().replace(" ", "")
            if "PASSPORT" in upper or "PASAPORTE" in upper:
                return True
            # Línea MRZ: solo mayúsculas + dígitos + '<', longitud 44
            if len(line) >= 30 and re.match(r'^[A-Z0-9<\s]+$', line):
                clean = line.replace(" ", "")
                if len(clean) >= 30 and "<" in clean:
                    return True
        return False

    # ── Parser: CI boliviana ─────────────────────────────────────────────────

    def _parse_ci_boliviana(self, text: str, lines: list[str]) -> OcrResult:
        full_name   = self._extract_name_ci(text, lines)
        dob         = self._extract_date(text)
        gender      = self._extract_gender(text)
        doc_number  = self._extract_ci_number(text)
        address     = self._extract_address(text)

        return OcrResult(
            document_type="ci_boliviana",
            full_name=full_name,
            date_of_birth=dob,
            gender=gender,
            document_number=doc_number,
            address=address,
        )

    def _extract_name_ci(self, text: str, lines: list[str]) -> Optional[str]:
        # Intenta extraer de etiquetas APELLIDO(S) + NOMBRE(S)
        ap = re.search(r'APELLIDOS?\s*:?\s*([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s]+)', text, re.IGNORECASE)
        nm = re.search(r'NOMBRES?\s*:?\s*([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s]+)', text, re.IGNORECASE)
        if ap and nm:
            apellidos = ap.group(1).strip()
            nombres   = nm.group(1).strip()
            return f"{apellidos} {nombres}".strip()
        # Fallback: línea en mayúsculas con al menos 2 palabras, sin dígitos
        for line in lines:
            if (
                line.isupper()
                and len(line.split()) >= 2
                and not re.search(r'\d', line)
                and len(line) > 6
            ):
                return line.strip()
        return None

    def _extract_date(self, text: str) -> Optional[str]:
        # Formato DD/MM/YYYY o DD-MM-YYYY con etiqueta opcional
        patterns = [
            r'(?:NAC(?:IMIENTO)?\s*:?\s*)(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})',
            r'(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})',
        ]
        for pattern in patterns:
            m = re.search(pattern, text, re.IGNORECASE)
            if m:
                day, month, year = m.group(1), m.group(2), m.group(3)
                return f"{year}-{month.zfill(2)}-{day.zfill(2)}"
        return None

    def _extract_gender(self, text: str) -> Optional[str]:
        m = re.search(r'SEXO\s*:?\s*([MF])', text, re.IGNORECASE)
        if m:
            return m.group(1).upper()
        if re.search(r'\bMASCULINO\b', text, re.IGNORECASE):
            return "M"
        if re.search(r'\bFEMENINO\b', text, re.IGNORECASE):
            return "F"
        return None

    def _extract_ci_number(self, text: str) -> Optional[str]:
        m = re.search(r'\b(\d{7,9})\b', text)
        return m.group(1) if m else None

    def _extract_address(self, text: str) -> Optional[str]:
        m = re.search(r'DOMICILIO\s*:?\s*([A-ZÁÉÍÓÚÑ0-9][^\n]{3,80})', text, re.IGNORECASE)
        if m:
            return m.group(1).strip()
        return None

    # ── Parser: Pasaporte (MRZ ICAO 9303) ───────────────────────────────────

    def _parse_passport(self, text: str, lines: list[str]) -> OcrResult:
        full_name  = None
        dob        = None
        gender     = None
        doc_number = None

        # Buscar líneas MRZ (solo A-Z, 0-9, <, longitud >= 30)
        mrz = [
            line.replace(" ", "")
            for line in lines
            if len(line.replace(" ", "")) >= 30
            and re.match(r'^[A-Z0-9<]+$', line.replace(" ", ""))
            and "<" in line
        ]

        if len(mrz) >= 2:
            line1, line2 = mrz[0], mrz[1]

            # Línea 1: P<BOLSURNAME<<GIVEN<NAME<...
            name_match = re.match(r'P[<A-Z](?:BOL)?([A-Z<]+)', line1)
            if name_match:
                name_part = name_match.group(1)
                parts = name_part.split("<<", 1)
                if len(parts) == 2:
                    surname = parts[0].replace("<", " ").strip()
                    given   = parts[1].replace("<", " ").strip()
                    full_name = f"{surname} {given}".strip()

            # Línea 2: posición 0-8=doc_no, 13-18=DOB(YYMMDD), 20=gender
            if len(line2) >= 21:
                doc_number = line2[:9].replace("<", "").strip() or None
                dob_str    = line2[13:19]
                gender_ch  = line2[20]

                if dob_str.isdigit():
                    yy, mm, dd = int(dob_str[:2]), dob_str[2:4], dob_str[4:6]
                    year = 1900 + yy if yy > 24 else 2000 + yy
                    dob  = f"{year}-{mm}-{dd}"

                if gender_ch in ("M", "F"):
                    gender = gender_ch

        return OcrResult(
            document_type="passport",
            full_name=full_name,
            date_of_birth=dob,
            gender=gender,
            document_number=doc_number,
            address=None,
        )


# Singleton compartido
ocr_service = OcrService()
```

- [ ] **Verificar sintaxis**

```bash
cd /home/wiz/aerofinder/backend
python -c "from app.services.ocr_service import ocr_service, OcrResult; print('OK', OcrResult)"
# Esperado: OK <class 'app.services.ocr_service.OcrResult'>
```

- [ ] **Commit**

```bash
cd /home/wiz/aerofinder
git add backend/app/services/ocr_service.py
git commit -m "feat: add OcrService with PaddleOCR — CI boliviana + passport parser"
```

---

## Task 3: Backend — Router OCR

**Files:**
- Create: `backend/app/routers/ocr.py`
- Modify: `backend/app/main.py`

- [ ] **Crear backend/app/routers/ocr.py**

```python
# =============================================================================
# AEROFINDER Backend — Router: OCR de documentos de identidad
# POST /ocr/document — recibe imagen, retorna campos extraídos
# =============================================================================

import logging

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel

from app.core.deps import get_current_user
from app.services.ocr_service import ocr_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/ocr", tags=["ocr"])

_MAX_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB
_ALLOWED_TYPES  = {"image/jpeg", "image/png", "image/webp"}


class OcrDocumentResponse(BaseModel):
    document_type:   str
    full_name:       str | None
    date_of_birth:   str | None
    gender:          str | None
    document_number: str | None
    address:         str | None


@router.post("/document", response_model=OcrDocumentResponse)
async def scan_document(
    file: UploadFile = File(...),
    _=Depends(get_current_user),
) -> OcrDocumentResponse:
    """
    Extrae campos de un documento de identidad (CI boliviana o pasaporte).
    Devuelve los campos reconocidos; los no reconocidos vienen como null.
    """
    if file.content_type not in _ALLOWED_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Tipo de archivo no soportado: {file.content_type}",
        )

    image_bytes = await file.read()
    if len(image_bytes) > _MAX_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="La imagen no puede superar 10 MB",
        )

    try:
        result = ocr_service.extract_document_fields(image_bytes)
    except Exception:
        logger.error("Error en OCR de documento", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="No se pudo procesar el documento",
        )

    return OcrDocumentResponse(
        document_type=result.document_type,
        full_name=result.full_name,
        date_of_birth=result.date_of_birth,
        gender=result.gender,
        document_number=result.document_number,
        address=result.address,
    )
```

- [ ] **Registrar el router en main.py**

En `backend/app/main.py`, en la sección de imports de routers, agregar:

```python
    ocr as ocr_router,
```

En la sección `app.include_router(...)`, agregar:

```python
app.include_router(ocr_router.router)
```

- [ ] **Verificar sintaxis**

```bash
cd /home/wiz/aerofinder/backend
python -c "from app.routers.ocr import router; print('OK', router.prefix)"
# Esperado: OK /ocr
```

- [ ] **Commit**

```bash
cd /home/wiz/aerofinder
git add backend/app/routers/ocr.py backend/app/main.py
git commit -m "feat: add POST /ocr/document endpoint — CI boliviana + passport"
```

---

## Task 4: Frontend — tipos y api

**Files:**
- Modify: `frontend/src/lib/types.ts`
- Modify: `frontend/src/lib/api.ts`

- [ ] **Agregar OcrDocumentResult a types.ts**

Al final de `frontend/src/lib/types.ts`, antes del último comentario o al final del archivo:

```typescript
// ── OCR de documentos ─────────────────────────────────────────────────────────

export interface OcrDocumentResult {
  document_type:   "ci_boliviana" | "passport" | "other";
  full_name:       string | null;
  date_of_birth:   string | null;   // ISO YYYY-MM-DD
  gender:          string | null;   // "M" | "F"
  document_number: string | null;
  address:         string | null;
}
```

- [ ] **Agregar ocrApi a api.ts**

En `frontend/src/lib/api.ts`, agregar el import del nuevo tipo al bloque de imports de types:

```typescript
  OcrDocumentResult,
```

Al final del archivo, antes de `export default api`:

```typescript
// ── API de OCR de documentos ──────────────────────────────────────────────────

export const ocrApi = {
  async scanDocument(file: File): Promise<OcrDocumentResult> {
    const formData = new FormData();
    formData.append("file", file);
    const { data } = await api.post<OcrDocumentResult>("/ocr/document", formData);
    return data;
  },
};
```

- [ ] **Verificar que el build de tipos no tiene errores**

```bash
cd /home/wiz/aerofinder/frontend
npm run build 2>&1 | grep -E "error|Error" | head -20
# Esperado: sin errores de tipos relacionados con OcrDocumentResult
```

- [ ] **Commit**

```bash
cd /home/wiz/aerofinder
git add frontend/src/lib/types.ts frontend/src/lib/api.ts
git commit -m "feat: add OcrDocumentResult type and ocrApi.scanDocument"
```

---

## Task 5: Frontend — Validación de cara en familiar report

**Files:**
- Modify: `frontend/src/app/dashboard/familiar/report/page.tsx`

- [ ] **Agregar estado confirmedNoFace**

En la sección `// ── UI ────────────────────────────────────────────────────────────────────` (cerca de línea 76), agregar después de `const [showToast, setShowToast]`:

```typescript
  const [confirmedNoFace, setConfirmedNoFace] = useState(false);
```

- [ ] **Resetear confirmedNoFace cuando cambian las fotos**

Al inicio de `handlePhotosChange`, después de `setPhotos(newPhotos)`:

```typescript
    setConfirmedNoFace(false);
```

- [ ] **Bloquear submit si no hay cara confirmada**

En `validateForm()`, después de la validación de `disappeared_at`:

```typescript
    // Bloquear si hay fotos analizadas pero ninguna con cara, y no confirmó
    const allAnalyzed =
      photos.length > 0 &&
      analyzingIndexes.length === 0 &&
      photoAnalyses.some((a) => a !== null);
    const noneUseful = allAnalyzed && !photoAnalyses.some((a) => a?.quality.is_useful);
    if (noneUseful && !confirmedNoFace) {
      e.photos_no_face = "Confirmá que querés continuar sin foto con cara visible";
    }
```

Nota: `e` ya es el objeto de errores local en `validateForm`. Agregar la clave `photos_no_face` al tipo `Record<string, string>` que ya maneja esa función.

- [ ] **Agregar checkbox al banner existente**

Localizar el banner amarillo (empieza con `<div className="mt-3 flex gap-3 rounded-lg border border-amber-200`). Al final del contenido del banner, después del `</div>` de texto, agregar:

```tsx
                <label className="mt-2 flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={confirmedNoFace}
                    onChange={(e) => setConfirmedNoFace(e.target.checked)}
                    className="mt-0.5 h-3.5 w-3.5 rounded border-amber-400 text-amber-600 focus:ring-amber-500"
                  />
                  <span className="text-[11px] text-amber-800 leading-relaxed">
                    Entiendo y quiero enviar el reporte sin foto con cara visible
                  </span>
                </label>
```

- [ ] **Mostrar error de validación si no confirmó**

Después del banner amarillo, agregar:

```tsx
            {errors.photos_no_face && (
              <p className="mt-2 text-[11px] text-red-600">{errors.photos_no_face}</p>
            )}
```

- [ ] **Verificar que el build no rompe nada**

```bash
cd /home/wiz/aerofinder/frontend
npm run build 2>&1 | grep -E "^.*error" | head -20
# Esperado: sin errores
```

- [ ] **Commit**

```bash
cd /home/wiz/aerofinder
git add frontend/src/app/dashboard/familiar/report/page.tsx
git commit -m "feat: face validation override in familiar report — checkbox to force submit"
```

---

## Task 6: Frontend — Validación de cara en persona detail

**Files:**
- Modify: `frontend/src/app/dashboard/persons/[id]/page.tsx`

- [ ] **Agregar estado de advertencia en PhotosSection**

En el componente `PhotosSection`, agregar estos estados al inicio del componente (después de `const [uploading, setUploading]`):

```typescript
  const [faceWarning,   setFaceWarning]   = useState<File | null>(null);
  const [analyzing,     setAnalyzing]     = useState(false);
```

- [ ] **Reemplazar handleFileChange para agregar chequeo de cara**

Reemplazar la función `handleFileChange` completa en `PhotosSection`:

```typescript
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadError(null);
    setAnalyzing(true);

    try {
      // Analizar cara antes de subir
      const analysis = await photosApi.analyzePhoto(file);
      setAnalyzing(false);

      if (!analysis.quality.face_detected) {
        // Mostrar advertencia, guardar archivo pendiente, esperar decisión del usuario
        setFaceWarning(file);
        setUploading(false);
        e.target.value = "";
        return;
      }

      // Sin advertencia — subir directamente
      await _uploadFile(file, personId, selectedAngle, onPhotoUpdated, setUploadError);
    } catch {
      setAnalyzing(false);
      setUploadError("Error al analizar la foto. Intenta de nuevo.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }
```

- [ ] **Agregar función helper _uploadFile**

Dentro de `PhotosSection`, antes de `handleFileChange`, agregar:

```typescript
  async function _uploadFile(
    file: File,
    pId: string,
    angle: PhotoFaceAngle,
    onUpdated: () => void,
    setError: (msg: string | null) => void,
  ) {
    try {
      const { upload_url, photo_id } = await photosApi.requestUploadUrl(pId, angle);
      const res = await fetch(upload_url, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });
      if (!res.ok) throw new Error("Error al subir la imagen");
      await photosApi.confirm(pId, photo_id);
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    }
  }
```

- [ ] **Agregar modal de advertencia en el JSX de PhotosSection**

En el JSX de `PhotosSection`, después del bloque `{uploadError && ...}`, agregar:

```tsx
      {/* Modal advertencia cara no detectada */}
      {faceWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100">
                <svg className="h-5 w-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">No se detectó ningún rostro</p>
                <p className="mt-1 text-xs text-gray-500">
                  Esta foto no es útil para el reconocimiento por IA. Podés cancelar y elegir otra, o subir igual si creés que la foto es válida.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setFaceWarning(null)}
                className="flex-1 rounded-lg border border-gray-300 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={async () => {
                  const file = faceWarning;
                  setFaceWarning(null);
                  setUploading(true);
                  await _uploadFile(file, personId, selectedAngle, onPhotoUpdated, setUploadError);
                  setUploading(false);
                }}
                className="flex-1 rounded-lg bg-amber-500 py-2 text-sm font-semibold text-white hover:bg-amber-600"
              >
                Subir igual
              </button>
            </div>
          </div>
        </div>
      )}
```

- [ ] **Agregar import de photosApi si no está ya importado en el archivo**

Verificar que en el archivo `/dashboard/persons/[id]/page.tsx` ya existe:
```typescript
import { personsApi, photosApi, detectionsApi, missionsApi } from "@/lib/api";
```
Ya está importado — no hace falta cambiar nada.

- [ ] **Mostrar estado de análisis en el botón de subir**

En el label del botón "+ Subir foto" en `PhotosSection`, cambiar el texto para reflejar el análisis:

```tsx
            <label className={`cursor-pointer rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition ${uploading ? "bg-gray-400" : "bg-blue-600 hover:bg-blue-700"}`}>
              {analyzing ? "Analizando…" : uploading ? "Subiendo…" : "+ Subir foto"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                disabled={uploading || analyzing}
                onChange={handleFileChange}
              />
            </label>
```

- [ ] **Verificar build**

```bash
cd /home/wiz/aerofinder/frontend
npm run build 2>&1 | grep -E "^.*error" | head -20
# Esperado: sin errores
```

- [ ] **Commit**

```bash
cd /home/wiz/aerofinder
git add frontend/src/app/dashboard/persons/[id]/page.tsx
git commit -m "feat: face detection warning + override modal on person photo upload"
```

---

## Task 7: Frontend — Botón OCR en familiar report

**Files:**
- Modify: `frontend/src/app/dashboard/familiar/report/page.tsx`

- [ ] **Agregar imports necesarios**

En la línea de imports de api del archivo, agregar `ocrApi`:

```typescript
import { personsApi, photosApi, ocrApi } from "@/lib/api";
```

Agregar el tipo al import de types:

```typescript
import type { PersonReportCreate, PhysicalAttributes, PhotoAnalysisResult, OcrDocumentResult } from "@/lib/types";
```

- [ ] **Agregar estado OCR**

En la sección `// ── UI`, agregar:

```typescript
  const [ocrLoading,  setOcrLoading]  = useState(false);
  const [ocrSuccess,  setOcrSuccess]  = useState(false);
  const ocrInputRef = useRef<HTMLInputElement>(null);
```

- [ ] **Agregar handler OCR**

Después de `handleAttr`, agregar la función `handleOcrFile`:

```typescript
  const handleOcrFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setOcrLoading(true);
    setOcrSuccess(false);
    try {
      const result: OcrDocumentResult = await ocrApi.scanDocument(file);
      // Solo rellenar campos vacíos — nunca pisar lo que el usuario ya escribió
      setFormData((prev) => ({
        ...prev,
        full_name:           prev.full_name           || result.full_name           || prev.full_name,
        gender:              prev.gender              || result.gender              || prev.gender,
        date_of_birth:       prev.date_of_birth       || result.date_of_birth       || prev.date_of_birth,
        last_known_location: prev.last_known_location || result.address             || prev.last_known_location,
      }));
      const filled = [result.full_name, result.gender, result.date_of_birth, result.address].filter(Boolean).length;
      if (filled > 0) {
        setOcrSuccess(true);
        showNotification("success", `Documento escaneado — ${filled} campo${filled > 1 ? "s" : ""} completado${filled > 1 ? "s" : ""} automáticamente.`);
      } else {
        showNotification("error", "No se pudieron extraer datos del documento. Intentá con otra foto más clara.");
      }
    } catch {
      showNotification("error", "No se pudo leer el documento. Intentá con otra foto más clara.");
    } finally {
      setOcrLoading(false);
      e.target.value = "";
    }
  };
```

- [ ] **Agregar botón OCR en SECCIÓN 1**

En `{/* ── SECCIÓN 1: Datos básicos ── */}`, justo después del `<h2>Datos básicos</h2>`, agregar:

```tsx
            {/* Botón escanear documento */}
            <div className="flex items-center gap-3">
              <input
                ref={ocrInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleOcrFile}
              />
              <button
                type="button"
                disabled={ocrLoading}
                onClick={() => ocrInputRef.current?.click()}
                className="flex items-center gap-2 rounded-lg border border-violet-300 bg-violet-50 px-3 py-2 text-[12px] font-semibold text-violet-700 hover:bg-violet-100 transition-colors disabled:opacity-50"
              >
                {ocrLoading ? (
                  <>
                    <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Escaneando…
                  </>
                ) : (
                  <>
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    Escanear carnet / pasaporte
                  </>
                )}
              </button>
              {ocrSuccess && (
                <span className="text-[11px] font-medium text-green-700">
                  ✓ Datos extraídos del documento
                </span>
              )}
            </div>
```

- [ ] **Verificar build final**

```bash
cd /home/wiz/aerofinder/frontend
npm run build 2>&1 | grep -E "^.*error" | head -20
# Esperado: sin errores
```

- [ ] **Commit**

```bash
cd /home/wiz/aerofinder
git add frontend/src/app/dashboard/familiar/report/page.tsx
git commit -m "feat: OCR scan button in familiar report — auto-fill from CI/passport"
```

---

## Task 8: Rebuild y verificación

**Files:** ninguno

- [ ] **Rebuild completo**

```bash
cd /home/wiz/aerofinder
./scripts/aerofinder.sh start --rebuild
```

- [ ] **Verificar que el backend arranca con el nuevo router**

```bash
curl -s http://localhost:8000/docs | grep -c "ocr"
# Esperado: número > 0
```

- [ ] **Verificar que el endpoint responde correctamente a un request sin archivo**

```bash
curl -s -X POST http://localhost:8000/ocr/document \
  -H "Authorization: Bearer $(curl -s -X POST http://localhost:8000/auth/login \
    -H 'Content-Type: application/json' \
    -d '{"email":"admin@aerofinder.local","password":"AeroAdmin2024!"}' | python3 -c 'import sys,json; print(json.load(sys.stdin)["access_token"])')" \  # pragma: allowlist secret
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('detail','sin detail'))"
# Esperado: "Field required" o similar (falta el archivo)
```

- [ ] **Commit final de spec y plan**

```bash
cd /home/wiz/aerofinder
git add docs/superpowers/specs/2026-06-01-photo-validation-ocr-design.md \
        docs/superpowers/plans/2026-06-01-photo-validation-ocr.md
git commit -m "docs: photo validation + OCR spec and implementation plan"
```

---

## Orden de ejecución

1. Task 1 (requirements) — prerequisito del backend
2. Task 2 (OcrService) — prerequisito del router
3. Task 3 (router OCR) — prerequisito del frontend api
4. Task 4 (types + api) — prerequisito del OCR button
5. Task 5 (face validation familiar report) — independiente del OCR
6. Task 6 (face validation person detail) — independiente del OCR
7. Task 7 (OCR button familiar report) — necesita Task 4
8. Task 8 (rebuild + verify) — último

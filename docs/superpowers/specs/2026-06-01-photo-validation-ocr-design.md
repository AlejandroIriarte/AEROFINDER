# Photo Validation & Document OCR — Design Spec

**Date:** 2026-06-01

## Overview

Two independent features to improve the familiar report flow:

1. **Face validation with override** — warn the familiar when an uploaded reference photo has no detectable face, but allow them to force-upload after explicit confirmation.
2. **Document OCR** — scan a CI boliviana or passport photo to auto-fill the report form (name, gender, birth date, address), only overwriting empty fields.

---

## Feature 1 — Face Validation with Override

### What already exists
- `POST /photos/analyze` endpoint in `backend/app/routers/photo_analysis.py` returns `{ quality: { face_detected, is_useful, issues, issue_labels } }`.
- `photosApi.analyzePhoto(file)` in frontend calls this endpoint.
- `/dashboard/familiar/report/page.tsx` already calls `analyzePhoto` in `handlePhotosChange` and shows an amber warning banner when no face is detected.
- `/dashboard/persons/[id]/page.tsx` has `handleFileChange` that uploads and confirms without any face check.

### What changes

**`/dashboard/familiar/report/page.tsx`:**
- Add `confirmedNoFace: boolean` state (default `false`).
- Reset to `false` whenever `handlePhotosChange` is called with new photos.
- In the existing amber warning banner: add a checkbox "Entiendo y quiero enviar igual" that sets `confirmedNoFace = true`.
- In `validateForm()`: if the warning condition is active (photos present, all analyzed, none useful) AND `!confirmedNoFace`, return `false` and add an error message.

**`/dashboard/persons/[id]/page.tsx` — `PhotosSection` → `handleFileChange`:**
- After the user selects a file, before calling `photosApi.confirm()`, call `photosApi.analyzePhoto(file)`.
- If `!result.quality.face_detected`: show an inline warning with two buttons — "Cancelar" and "Subir igual".
- "Subir igual" proceeds to `photosApi.confirm()`. "Cancelar" aborts.
- Use a local `pendingFile` state to hold the file while waiting for user decision.

### Invariants preserved
- Auto-fill of `skin_tone` / `hair_color` via `aiAutoFilledRef` is untouched.
- Toast notifications for analysis results are untouched.
- The amber banner content/copy is preserved; only the checkbox is added.

---

## Feature 2 — Document OCR

### Architecture

```
[familiar picks image file]
        ↓
POST /ocr/document  (multipart, image)
        ↓
OcrService.extract_document_fields(bytes)
  → PaddleOCR (CPU, lazy init)
  → detect CI boliviana vs passport
  → regex parse fields
  → return OcrResult JSON
        ↓
Frontend fills empty form fields only
```

### Backend

**`backend/app/services/ocr_service.py`** — singleton `OcrService`:
- Lazy-initializes `PaddleOCR(use_angle_cls=True, lang='es', use_gpu=False)` on first call.
- `extract_document_fields(image_bytes: bytes) → OcrResult`.
- Detects document type from OCR text: if MRZ lines present → passport; otherwise → CI boliviana.
- Parses CI boliviana: APELLIDOS + NOMBRES labels → `full_name`; date pattern DD/MM/YYYY → `date_of_birth`; SEXO M/F → `gender`; DOMICILIO → `address`; 7–9 digit number → `document_number`.
- Parses passport: MRZ line 1 for surname+given name; MRZ line 2 positions 13–20 for DOB+gender.
- Returns `OcrResult(document_type, full_name, date_of_birth, gender, document_number, address)`.

**`backend/app/routers/ocr.py`** — router prefix `/ocr`:
- `POST /ocr/document` — accepts `UploadFile` (image/jpeg, image/png, image/webp; max 10 MB).
- Reads bytes, calls `ocr_service.extract_document_fields(bytes)`.
- Returns `OcrDocumentResponse` schema.
- Auth: `get_current_user` (any authenticated user).

**`backend/app/main.py`** — register `ocr_router`.

**`backend/requirements.txt`** — add `paddlepaddle-cpu` and `paddleocr`.

### Frontend

**`frontend/src/lib/types.ts`** — add `OcrDocumentResult` interface:
```typescript
interface OcrDocumentResult {
  document_type: "ci_boliviana" | "passport" | "other";
  full_name: string | null;
  date_of_birth: string | null;   // ISO YYYY-MM-DD
  gender: string | null;           // "M" | "F"
  document_number: string | null;
  address: string | null;
}
```

**`frontend/src/lib/api.ts`** — add `ocrApi.scanDocument(file: File)`.

**`/dashboard/familiar/report/page.tsx`:**
- Add `ocrInputRef`, `ocrLoading`, `ocrError` state.
- Add `handleOcrFile(e)`: sends file to `ocrApi.scanDocument`, fills empty fields via `setFormData(prev => ({ ...prev, full_name: prev.full_name || result.full_name || "", ... }))`.
- Add "Escanear carnet / pasaporte" button at top of SECCIÓN 1 (datos básicos), with hidden file input and loading state.

### Auto-fill rules (strict — never overwrite)
| OCR field | Fills form field | Condition |
|---|---|---|
| `full_name` | `formData.full_name` | only if currently `""` |
| `gender` | `formData.gender` | only if currently `""` |
| `date_of_birth` | `formData.date_of_birth` | only if currently `""` |
| `address` | `formData.last_known_location` | only if currently `""` |

---

## Out of Scope
- PaddleOCR GPU support (CPU is sufficient for this volume).
- OCR on the PWA field report flow (`/app/report/photos`) — different purpose.
- Storing the scanned document image.
- OCR for other document types beyond CI boliviana and passport (extensible via `document_type: "other"`).

# Familiar Report Improvements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corregir 3 bugs (sesión, MinIO URLs, validación de fotos) y enriquecer el formulario de reporte familiar con campos físicos completos y auto-relleno por IA desde la foto.

**Architecture:** Se añade `isInitialized` al auth store para evitar redirecciones prematuras al refrescar. Las URLs de MinIO se reescriben con `server_host` al generarlas. Un nuevo endpoint `POST /photos/analyze` usa OpenCV (Haar Cascade) para detectar cara y calidad, más análisis de color para skin_tone/hair_color — sin cargar InsightFace en el backend. Los atributos físicos se almacenan en un campo `physical_attributes JSONB` nuevo en `missing_persons`. El formulario familiar reemplaza los campos sueltos por secciones progresivas con auto-relleno desde la foto analizada.

**Tech Stack:** PostgreSQL 16 JSONB, Alembic, FastAPI, SQLAlchemy 2.0 async, OpenCV 4.x, Pillow, Next.js 14 App Router, Zustand, TypeScript

---

## File Map

| Archivo | Acción |
|---------|--------|
| `frontend/src/store/auth.ts` | Modificar — agregar `isInitialized` |
| `frontend/src/app/dashboard/layout.tsx` | Modificar — usar `isInitialized` en guard |
| `backend/app/routers/photos.py` | Modificar — reescribir host MinIO en presigned URL |
| `backend/migrations/versions/0011_add_physical_attributes_jsonb.py` | Crear |
| `backend/app/models/persons.py` | Modificar — agregar columna `physical_attributes` |
| `backend/app/schemas/persons.py` | Modificar — `PhysicalAttributes`, actualizar schemas |
| `backend/requirements.txt` | Modificar — agregar Pillow + opencv-python-headless |
| `backend/app/services/face_analyzer.py` | Crear — singleton OpenCV |
| `backend/app/routers/photo_analysis.py` | Crear — `POST /photos/analyze` |
| `backend/app/main.py` | Modificar — registrar router |
| `frontend/src/lib/types.ts` | Modificar — `PhysicalAttributes`, actualizar interfaces |
| `frontend/src/lib/api.ts` | Modificar — agregar `photosApi.analyzePhoto()` |
| `frontend/src/components/ui/PhotoUpload.tsx` | Modificar — prop `analyses` + badge calidad |
| `frontend/src/app/dashboard/familiar/report/page.tsx` | Modificar — formulario completo |

---

## Task 1: Fix sesión — isInitialized en auth store

**Files:**
- Modify: `frontend/src/store/auth.ts`
- Modify: `frontend/src/app/dashboard/layout.tsx`

### Diagnóstico

En `dashboard/layout.tsx` hay dos `useEffect` independientes. En el primer render, `isLoading=false` e `isAuthenticated=false` simultáneamente. El segundo `useEffect` ve `!isLoading && !isAuthenticated = true` y redirige a `/login` ANTES de que `loadUser()` pueda completarse. La solución: agregar `isInitialized` que indica que `loadUser()` ya terminó (éxito o fallo).

- [ ] **Step 1: Agregar `isInitialized` a la interfaz y estado inicial del store**

En `frontend/src/store/auth.ts`, reemplazar la definición de la interfaz `AuthState` y el estado inicial:

```typescript
interface AuthState {
  user:            User | null;
  accessToken:     string | null;
  isLoading:       boolean;
  isAuthenticated: boolean;
  isInitialized:   boolean;           // ← nuevo

  register:       (email: string, password: string, fullName: string, phone?: string) => Promise<void>;
  login:          (email: string, password: string) => Promise<void>;
  logout:         () => Promise<void>;
  refreshToken:   () => Promise<boolean>;
  loadUser:       () => Promise<void>;
  setAccessToken: (token: string) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user:            null,
  accessToken:     null,
  isLoading:       false,
  isAuthenticated: false,
  isInitialized:   false,             // ← nuevo
```

- [ ] **Step 2: Setear `isInitialized = true` al final de `loadUser()`**

En `loadUser()`, el bloque `try/catch` actual termina así:

```typescript
    } catch {
      // Token inválido: limpiar
      if (typeof window !== "undefined") {
        localStorage.removeItem(TOKEN_KEY);
      }
      set({
        user:            null,
        accessToken:     null,
        isAuthenticated: false,
        isLoading:       false,
      });
      Cookies.remove(REFRESH_COOKIE);
    }
```

Agregar `isInitialized: true` en ambos terminadores (éxito y fallo). Reemplazar todo el `loadUser:` con:

```typescript
  loadUser: async () => {
    let { accessToken } = get();
    const { refreshToken: doRefresh } = get() as AuthState & {
      refreshToken: () => Promise<boolean>;
    };

    // Intentar recuperar token desde localStorage si no está en memoria
    if (!accessToken && typeof window !== "undefined") {
      const stored = localStorage.getItem(TOKEN_KEY);
      if (stored) {
        accessToken = stored;
        set({ accessToken: stored, isAuthenticated: true });
      }
    }

    // Si sigue sin token, intentar refresh desde cookie
    if (!accessToken) {
      const refreshed = await doRefresh();
      if (!refreshed) {
        set({ isInitialized: true });   // ← sin token, inicialización completa
        return;
      }
    }

    set({ isLoading: true });
    try {
      const user = await authApi.me();
      set({ user, isAuthenticated: true, isLoading: false, isInitialized: true });
    } catch {
      if (typeof window !== "undefined") {
        localStorage.removeItem(TOKEN_KEY);
      }
      set({
        user:            null,
        accessToken:     null,
        isAuthenticated: false,
        isLoading:       false,
        isInitialized:   true,          // ← fallo, pero inicialización completa
      });
      Cookies.remove(REFRESH_COOKIE);
    }
  },
```

- [ ] **Step 3: Actualizar el guard de redirección en dashboard/layout.tsx**

Reemplazar el bloque de selectors y los dos `useEffect` en `InnerLayout`:

```typescript
  const user            = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading       = useAuthStore((s) => s.isLoading);
  const isInitialized   = useAuthStore((s) => s.isInitialized);  // ← nuevo
  const loadUser        = useAuthStore((s) => s.loadUser);
```

Reemplazar los dos `useEffect`:

```typescript
  useEffect(() => {
    if (!isInitialized) loadUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Solo redirigir cuando la inicialización completó y no está autenticado
    if (isInitialized && !isLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isInitialized, isLoading, isAuthenticated, router]);
```

Reemplazar el guard de render:

```typescript
  if (!isInitialized || isLoading || !isAuthenticated || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <div className="text-center text-slate-400">
          <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-500" />
          <p className="text-sm">Verificando sesión…</p>
        </div>
      </div>
    );
  }
```

- [ ] **Step 4: Verificar en browser**

```bash
# 1. Iniciar sesión normalmente
# 2. Refrescar la página (F5)
# Esperado: la sesión se mantiene, NO redirige a /login
# Esperado: spinner breve durante la verificación (~300ms)
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/store/auth.ts frontend/src/app/dashboard/layout.tsx
git commit -m "fix: sesión persiste al refrescar — isInitialized en auth store

Evita redirección prematura a /login cuando isLoading=false e isAuthenticated=false
coinciden en el primer render antes de que loadUser() complete."
```

---

## Task 2: Fix MinIO URLs en vista admin

**Files:**
- Modify: `backend/app/routers/photos.py`

### Diagnóstico

`minio_service.get_presigned_url()` usa el cliente Minio configurado con `http://minio:9000` (hostname Docker interno). Las URLs presignadas generadas contienen `http://minio:9000/...`. El browser del admin intenta resolver `minio` que no existe fuera del container → las fotos no cargan.

Fix: reemplazar el netloc interno por `settings.server_host` al construir la `view_url`.

- [ ] **Step 1: Importar `urlparse` y `settings` en photos.py**

Al inicio de `backend/app/routers/photos.py`, verificar que ya están importados:
- `from app.config import settings` → ya está en la línea 35
- Agregar `from urllib.parse import urlparse, urlunparse` al bloque de imports estándar:

```python
import asyncio
import logging
import uuid
from urllib.parse import urlparse, urlunparse
```

- [ ] **Step 2: Agregar helper `_rewrite_minio_host` al principio del archivo**

Después de las constantes `_PHOTO_MAX_PER_PERSON`, `_PHOTO_PRESIGN_EXPIRES`, `_PHOTO_VIEW_EXPIRES` y antes de `_check_person_access`, agregar:

```python
def _rewrite_minio_host(url: str) -> str:
    """
    Reemplaza el host interno de MinIO (Docker) por el host externo del servidor.
    La URL presignada contiene el endpoint interno (ej: http://minio:9000/...)
    que no es accesible desde el browser del cliente.
    settings.server_host tiene la IP pública del servidor (ej: 192.168.100.213).
    """
    internal = urlparse(settings.minio_url)
    external_netloc = f"{settings.server_host}:{internal.port or 9000}"
    parsed = urlparse(url)
    return urlunparse(parsed._replace(netloc=external_netloc))
```

- [ ] **Step 3: Aplicar el helper en `_photo_to_response`**

En la función `_photo_to_response`, el bloque que genera `view_url` actualmente es:

```python
            view_url = await asyncio.get_running_loop().run_in_executor(
                None,
                lambda: minio_service.get_presigned_url(bucket, object_key, _PHOTO_VIEW_EXPIRES),
            )
```

Reemplazar por:

```python
            raw_url = await asyncio.get_running_loop().run_in_executor(
                None,
                lambda: minio_service.get_presigned_url(bucket, object_key, _PHOTO_VIEW_EXPIRES),
            )
            view_url = _rewrite_minio_host(raw_url)
```

- [ ] **Step 4: Verificar en browser**

```bash
# Con el backend corriendo en Docker:
# 1. Ir a http://192.168.100.213:3000/dashboard/persons/{id}
# 2. Las fotos deben cargarse correctamente
# 3. Inspeccionar red: la URL de la imagen debe ser http://192.168.100.213:9000/...
#    (NO http://minio:9000/...)
```

- [ ] **Step 5: Commit**

```bash
git add backend/app/routers/photos.py
git commit -m "fix: reescribir host interno MinIO en presigned URLs de fotos

Las URLs presignadas usaban minio:9000 (hostname Docker interno) que no
resuelve desde el browser del cliente. Se reemplaza por settings.server_host."
```

---

## Task 3: Migración DB 0011 — physical_attributes JSONB

**Files:**
- Create: `backend/migrations/versions/0011_add_physical_attributes_jsonb.py`

- [ ] **Step 1: Crear la migración**

```python
# backend/migrations/versions/0011_add_physical_attributes_jsonb.py
"""Add physical_attributes JSONB to missing_persons

Almacena atributos físicos estructurados (complexión, tono de piel, color de cabello,
ropa, etc.) en un campo JSONB flexible. Evita múltiples columnas escalares y permite
agregar nuevos campos sin migraciones futuras.

Revision ID: 0011
Revises: 0010
Create Date: 2026-05-24
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "missing_persons",
        sa.Column("physical_attributes", JSONB, nullable=True),
    )


def downgrade() -> None:
    op.drop_column("missing_persons", "physical_attributes")
```

- [ ] **Step 2: Aplicar la migración**

```bash
docker exec aerofinder_backend alembic upgrade head
```

Esperado:
```
INFO  [alembic.runtime.migration] Running upgrade 0010 -> 0011, Add physical_attributes JSONB to missing_persons
```

- [ ] **Step 3: Verificar columna en DB**

```bash
docker exec aerofinder_postgres psql -U postgres -d aerofinder -c \
  "\d missing_persons" | grep physical
```

Esperado:
```
 physical_attributes | jsonb    |
```

- [ ] **Step 4: Commit**

```bash
git add backend/migrations/versions/0011_add_physical_attributes_jsonb.py
git commit -m "feat: migración 0011 — physical_attributes JSONB en missing_persons"
```

---

## Task 4: Backend — modelo ORM + schemas actualizados

**Files:**
- Modify: `backend/app/models/persons.py`
- Modify: `backend/app/schemas/persons.py`

- [ ] **Step 1: Agregar columna `physical_attributes` al modelo ORM**

En `backend/app/models/persons.py`, agregar el import de JSONB:

```python
from sqlalchemy.dialects.postgresql import JSONB, UUID
```

(Reemplazar la línea existente `from sqlalchemy.dialects.postgresql import UUID`)

Luego en la clase `MissingPerson`, después de `last_known_clothing`:

```python
    # Atributos físicos estructurados: complexión, tono piel, cabello, ropa, etc.
    physical_attributes: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
```

- [ ] **Step 2: Agregar `PhysicalAttributes` Pydantic model en schemas**

En `backend/app/schemas/persons.py`, después de los imports y antes de `PersonCreate`, agregar:

```python
class PhysicalAttributes(BaseModel):
    """Atributos físicos estructurados de la persona desaparecida."""
    weight_kg: Optional[int] = None
    build: Optional[str] = None                  # delgado/normal/robusto/corpulento
    skin_tone: Optional[str] = None              # muy_claro/claro/medio/moreno/oscuro
    hair_color: Optional[str] = None             # negro/castaño/rubio/pelirrojo/canoso/blanco/calvo
    hair_length: Optional[str] = None            # calvo/muy_corto/corto/mediano/largo
    eye_color: Optional[str] = None              # negros/marrones/verdes/azules/grises/miel
    wears_glasses: Optional[bool] = None
    facial_hair: Optional[str] = None            # ninguno/barba/bigote/barba_y_bigote/incipiente
    distinguishing_marks: Optional[str] = None   # cicatrices, lunares, tatuajes
    clothing_upper: Optional[str] = None
    clothing_lower: Optional[str] = None
    clothing_footwear: Optional[str] = None
    clothing_accessories: Optional[str] = None
    ai_analyzed: bool = False
    ai_confidence: Optional[float] = None
```

- [ ] **Step 3: Actualizar `PersonReportCreate` con campos nuevos**

Reemplazar la clase `PersonReportCreate` completa:

```python
class PersonReportCreate(BaseModel):
    """Schema para que un familiar reporte un caso (crea person en pending_review)"""
    full_name: str
    disappeared_at: date
    date_of_birth: Optional[date] = None
    age_at_disappearance: Optional[int] = None
    gender: Optional[str] = None
    physical_description: Optional[str] = None
    height_cm: Optional[int] = None
    last_known_location: Optional[str] = None
    last_seen_at: Optional[datetime] = None
    physical_attributes: Optional[PhysicalAttributes] = None
```

Nota: `last_known_clothing` se elimina del schema (ya no se usa como campo suelto; queda en `physical_attributes.clothing_upper` etc.).

- [ ] **Step 4: Actualizar `PersonResponse` para incluir `physical_attributes`**

En `PersonResponse`, agregar después de `last_known_clothing`:

```python
    physical_attributes: Optional[dict] = None
```

- [ ] **Step 5: Actualizar `PersonUpdate` para incluir `physical_attributes`**

En `PersonUpdate`, agregar después de `last_known_clothing`:

```python
    physical_attributes: Optional[PhysicalAttributes] = None
```

- [ ] **Step 6: Commit**

```bash
git add backend/app/models/persons.py backend/app/schemas/persons.py
git commit -m "feat: physical_attributes JSONB — modelo ORM y schemas Pydantic"
```

---

## Task 5: Backend — servicio FaceAnalyzer + endpoint /photos/analyze

**Files:**
- Modify: `backend/requirements.txt`
- Create: `backend/app/services/face_analyzer.py`
- Create: `backend/app/routers/photo_analysis.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: Agregar dependencias de imagen al backend**

En `backend/requirements.txt`, antes del comentario `# Redis Streams`, agregar:

```
# Procesamiento de imágenes (análisis de fotos para validación y atributos)
Pillow>=10.0.0
opencv-python-headless>=4.9.0
numpy>=1.26.0
```

- [ ] **Step 2: Reconstruir imagen Docker del backend**

```bash
docker compose build backend
docker compose up -d backend
```

Verificar que levanta sin errores:
```bash
docker logs aerofinder_backend --tail 20
```

- [ ] **Step 3: Crear `backend/app/services/face_analyzer.py`**

```python
# =============================================================================
# AEROFINDER Backend — Servicio de análisis de fotos con OpenCV
# Detecta rostros (Haar Cascade), evalúa calidad y extrae atributos de color.
# No requiere GPU ni InsightFace — análisis ligero para feedback en tiempo real.
# =============================================================================

import logging
from typing import Optional

import cv2
import numpy as np

logger = logging.getLogger(__name__)

# Etiquetas legibles para los issues
_ISSUE_LABELS: dict[str, str] = {
    "no_face":        "No se detectó ningún rostro",
    "multiple_faces": "Se detectaron múltiples rostros",
    "blurry":         "La foto está desenfocada",
    "poor_lighting":  "Iluminación insuficiente",
    "overexposed":    "La foto está sobreexpuesta",
}


class FaceAnalyzer:
    """
    Singleton para análisis de imágenes con OpenCV.
    Carga los Haar Cascades una sola vez al primer uso.
    """

    _instance: Optional["FaceAnalyzer"] = None

    @classmethod
    def get(cls) -> "FaceAnalyzer":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def __init__(self) -> None:
        self._frontal_cascade = cv2.CascadeClassifier(
            cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        )
        self._profile_cascade = cv2.CascadeClassifier(
            cv2.data.haarcascades + "haarcascade_profileface.xml"
        )
        logger.info("FaceAnalyzer inicializado con Haar Cascades")

    def analyze(self, image_bytes: bytes) -> dict:
        """
        Analiza una imagen y retorna calidad y atributos faciales detectados.

        Returns:
            {
                "quality": {
                    "is_useful": bool,
                    "face_detected": bool,
                    "face_angle": str,
                    "blur_score": float,   # 0.0 (borroso) a 1.0 (nítido)
                    "issues": list[str],
                    "issue_labels": list[str],
                },
                "attributes": {
                    "skin_tone": str | None,
                    "hair_color": str | None,
                },
            }
        """
        try:
            nparr = np.frombuffer(image_bytes, np.uint8)
            img_bgr = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            if img_bgr is None:
                return self._error_result("Formato de imagen no reconocido")

            img_gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)

            # Detección frontal
            faces_frontal = self._frontal_cascade.detectMultiScale(
                img_gray, scaleFactor=1.1, minNeighbors=5, minSize=(60, 60)
            )
            face_angle = "frontal"
            faces = faces_frontal

            # Si no hay cara frontal, intentar perfil
            if len(faces_frontal) == 0:
                faces_profile = self._profile_cascade.detectMultiScale(
                    img_gray, scaleFactor=1.1, minNeighbors=5, minSize=(60, 60)
                )
                if len(faces_profile) > 0:
                    faces = faces_profile
                    face_angle = "profile"

            face_detected = len(faces) > 0
            multiple_faces = len(faces) > 1

            # Nitidez: varianza del Laplaciano normalizada
            lap_var = float(cv2.Laplacian(img_gray, cv2.CV_64F).var())
            blur_score = round(min(lap_var / 500.0, 1.0), 2)

            # Brillo promedio
            brightness = float(np.mean(img_gray)) / 255.0

            issues: list[str] = []
            if not face_detected:
                issues.append("no_face")
            if multiple_faces:
                issues.append("multiple_faces")
            if blur_score < 0.1:
                issues.append("blurry")
            if brightness < 0.2:
                issues.append("poor_lighting")
            elif brightness > 0.92:
                issues.append("overexposed")

            is_useful = (
                face_detected
                and not multiple_faces
                and blur_score >= 0.1
                and 0.2 <= brightness <= 0.92
            )

            attributes: dict = {}
            if face_detected and len(faces) > 0:
                x, y, w, h = max(faces, key=lambda f: int(f[2]) * int(f[3]))
                face_roi = img_bgr[int(y):int(y + h), int(x):int(x + w)]

                skin = self._detect_skin_tone(face_roi)
                if skin:
                    attributes["skin_tone"] = skin

                # Región de cabello: sobre el bounding box de la cara
                hair_y_start = max(0, int(y) - int(h) // 3)
                if hair_y_start < int(y):
                    hair_roi = img_bgr[hair_y_start:int(y), int(x):int(x + w)]
                    if hair_roi.size > 0:
                        hair = self._detect_hair_color(hair_roi)
                        if hair:
                            attributes["hair_color"] = hair

            return {
                "quality": {
                    "is_useful": is_useful,
                    "face_detected": face_detected,
                    "face_angle": face_angle if face_detected else "unknown",
                    "blur_score": blur_score,
                    "issues": issues,
                    "issue_labels": [_ISSUE_LABELS.get(i, i) for i in issues],
                },
                "attributes": attributes,
            }

        except Exception:
            logger.error("Error al analizar imagen", exc_info=True)
            return self._error_result("Error interno al procesar la imagen")

    def _detect_skin_tone(self, face_roi: np.ndarray) -> Optional[str]:
        """Clasifica el tono de piel por luminancia en espacio CIE Lab."""
        if face_roi.size == 0:
            return None
        try:
            # Máscara de piel en HSV (hue 0-35, sat moderado)
            hsv = cv2.cvtColor(face_roi, cv2.COLOR_BGR2HSV)
            lower = np.array([0, 15, 40], dtype=np.uint8)
            upper = np.array([35, 255, 255], dtype=np.uint8)
            mask = cv2.inRange(hsv, lower, upper)

            if cv2.countNonZero(mask) < 80:
                return None

            lab = cv2.cvtColor(face_roi, cv2.COLOR_BGR2Lab)
            l_channel = lab[:, :, 0]
            skin_pixels = l_channel[mask > 0]
            if len(skin_pixels) == 0:
                return None

            avg_l = float(np.mean(skin_pixels))

            if avg_l > 185:
                return "muy_claro"
            elif avg_l > 162:
                return "claro"
            elif avg_l > 132:
                return "medio"
            elif avg_l > 100:
                return "moreno"
            else:
                return "oscuro"
        except Exception:
            return None

    def _detect_hair_color(self, hair_roi: np.ndarray) -> Optional[str]:
        """Clasifica el color de cabello dominante en la región superior."""
        if hair_roi.size == 0:
            return None
        try:
            hsv = cv2.cvtColor(hair_roi, cv2.COLOR_BGR2HSV)
            avg_h = float(np.mean(hsv[:, :, 0]))
            avg_s = float(np.mean(hsv[:, :, 1]))
            avg_v = float(np.mean(hsv[:, :, 2]))

            if avg_v > 200 and avg_s < 25:
                return "blanco"
            if avg_v > 150 and avg_s < 45:
                return "canoso"
            if avg_v < 55:
                return "negro"
            if 12 <= avg_h <= 38 and avg_v > 115 and avg_s > 55:
                return "rubio"
            if avg_h < 12 and avg_s > 80:
                return "pelirrojo"
            if avg_v < 115:
                return "castaño"
            return "castaño"
        except Exception:
            return None

    @staticmethod
    def _error_result(message: str) -> dict:
        return {
            "quality": {
                "is_useful": False,
                "face_detected": False,
                "face_angle": "unknown",
                "blur_score": 0.0,
                "issues": ["error"],
                "issue_labels": [message],
            },
            "attributes": {},
        }
```

- [ ] **Step 4: Crear `backend/app/routers/photo_analysis.py`**

```python
# =============================================================================
# AEROFINDER Backend — Router: Análisis de fotos para validación y auto-relleno
# POST /photos/analyze — recibe imagen, retorna calidad + atributos detectados.
# Stateless: no guarda nada en DB, solo procesa en memoria.
# =============================================================================

import logging

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from pydantic import BaseModel

from app.core.deps import CurrentUser, get_current_user
from app.services.face_analyzer import FaceAnalyzer

logger = logging.getLogger(__name__)
router = APIRouter(tags=["análisis de fotos"])

_MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB


class PhotoQualityResult(BaseModel):
    is_useful: bool
    face_detected: bool
    face_angle: str
    blur_score: float
    issues: list[str]
    issue_labels: list[str]


class PhotoAttributesResult(BaseModel):
    skin_tone: str | None = None
    hair_color: str | None = None


class PhotoAnalysisResponse(BaseModel):
    quality: PhotoQualityResult
    attributes: PhotoAttributesResult


@router.post(
    "/photos/analyze",
    response_model=PhotoAnalysisResponse,
    status_code=status.HTTP_200_OK,
)
async def analyze_photo(
    file: UploadFile = File(...),
    current_user: CurrentUser = Depends(get_current_user),
) -> PhotoAnalysisResponse:
    """
    Analiza una foto para verificar si es útil para reconocimiento facial por IA
    y extrae atributos visibles (tono de piel, color de cabello).
    No almacena nada — procesamiento en memoria.
    """
    # Validar tipo de archivo
    if file.content_type not in ("image/jpeg", "image/png", "image/webp"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Formato no válido. Se aceptan JPG, PNG o WebP.",
        )

    # Leer bytes con límite de tamaño
    try:
        image_bytes = await file.read(_MAX_UPLOAD_BYTES + 1)
    except Exception:
        logger.error("Error al leer imagen para análisis", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

    if len(image_bytes) > _MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Imagen demasiado grande. Máximo 10 MB.",
        )

    # Analizar
    try:
        analyzer = FaceAnalyzer.get()
        result = analyzer.analyze(image_bytes)
    except Exception:
        logger.error("Error en FaceAnalyzer", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error al analizar la imagen")

    return PhotoAnalysisResponse(
        quality=PhotoQualityResult(**result["quality"]),
        attributes=PhotoAttributesResult(**result.get("attributes", {})),
    )
```

- [ ] **Step 5: Registrar el router en `backend/app/main.py`**

Agregar el import junto a los demás routers:

```python
from app.routers import (
    admin_import as admin_import_router,
    alerts as alerts_router,
    audit_log as audit_log_router,
    auth as auth_router,
    detections as detections_router,
    drones as drones_router,
    field_reports as field_reports_router,
    missions as missions_router,
    persons as persons_router,
    photo_analysis as photo_analysis_router,   # ← nuevo
    photos as photos_router,
    public as public_router,
    push as push_router,
    system as system_router,
    telemetry as telemetry_router,
    users as users_router,
    ws as ws_router,
)
```

Y en la sección de routers:

```python
app.include_router(photos_router.router)
app.include_router(photo_analysis_router.router)   # ← nuevo, después de photos
```

- [ ] **Step 6: Verificar endpoint**

```bash
# Crear un archivo de imagen de prueba
curl -s -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@aerofinder.local","password":"AeroAdmin2024!"}' \  # pragma: allowlist secret
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])" > /tmp/token.txt

TOKEN=$(cat /tmp/token.txt)

# Enviar una foto de prueba
curl -s -X POST http://localhost:8000/photos/analyze \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@/path/to/test_photo.jpg" \
  | python3 -m json.tool
```

Esperado — respuesta con calidad y atributos:
```json
{
  "quality": {
    "is_useful": true,
    "face_detected": true,
    "face_angle": "frontal",
    "blur_score": 0.72,
    "issues": [],
    "issue_labels": []
  },
  "attributes": {
    "skin_tone": "medio",
    "hair_color": "castaño"
  }
}
```

- [ ] **Step 7: Commit**

```bash
git add backend/requirements.txt backend/app/services/face_analyzer.py \
        backend/app/routers/photo_analysis.py backend/app/main.py
git commit -m "feat: endpoint POST /photos/analyze con OpenCV — calidad y atributos faciales"
```

---

## Task 6: Frontend — tipos + API client

**Files:**
- Modify: `frontend/src/lib/types.ts`
- Modify: `frontend/src/lib/api.ts`

- [ ] **Step 1: Agregar interfaces en `types.ts`**

En `frontend/src/lib/types.ts`, agregar después de la interfaz `MissingPerson`:

```typescript
// ── Atributos físicos estructurados ──────────────────────────────────────────

export interface PhysicalAttributes {
  weight_kg?: number;
  build?: string;              // delgado/normal/robusto/corpulento
  skin_tone?: string;          // muy_claro/claro/medio/moreno/oscuro
  hair_color?: string;         // negro/castaño/rubio/pelirrojo/canoso/blanco/calvo
  hair_length?: string;        // calvo/muy_corto/corto/mediano/largo
  eye_color?: string;          // negros/marrones/verdes/azules/grises/miel
  wears_glasses?: boolean;
  facial_hair?: string;        // ninguno/barba/bigote/barba_y_bigote/incipiente
  distinguishing_marks?: string;
  clothing_upper?: string;
  clothing_lower?: string;
  clothing_footwear?: string;
  clothing_accessories?: string;
  ai_analyzed?: boolean;
  ai_confidence?: number;
}

// ── Resultado análisis de foto ────────────────────────────────────────────────

export interface PhotoAnalysisResult {
  quality: {
    is_useful: boolean;
    face_detected: boolean;
    face_angle: string;
    blur_score: number;
    issues: string[];
    issue_labels: string[];
  };
  attributes: {
    skin_tone?: string;
    hair_color?: string;
  };
}
```

- [ ] **Step 2: Actualizar `MissingPerson` en `types.ts`**

En la interfaz `MissingPerson`, agregar:

```typescript
export interface MissingPerson {
  id: string;
  full_name: string;
  date_of_birth: string | null;
  age_at_disappearance: number | null;
  gender: string | null;
  physical_description: string | null;
  last_known_location: string | null;
  last_seen_at: string | null;
  disappeared_at: string;
  status: MissingPersonStatus;
  reporter_name: string | null;
  reporter_contact: string | null;
  found_at: string | null;
  created_at: string;
  updated_at: string;
  physical_attributes: PhysicalAttributes | null;   // ← nuevo
}
```

- [ ] **Step 3: Actualizar `PersonReportCreate` en `types.ts`**

Reemplazar `PersonReportCreate`:

```typescript
export interface PersonReportCreate {
  full_name: string;
  disappeared_at: string;
  date_of_birth?: string;
  age_at_disappearance?: number;
  gender?: string;
  physical_description?: string;
  height_cm?: number;
  last_known_location?: string;
  last_seen_at?: string;
  physical_attributes?: PhysicalAttributes;   // ← nuevo
}
```

- [ ] **Step 4: Agregar `analyzePhoto` en `api.ts`**

En `frontend/src/lib/api.ts`, dentro del objeto `photosApi`, agregar después de `list`:

```typescript
  async analyzePhoto(file: File): Promise<PhotoAnalysisResult> {
    const formData = new FormData();
    formData.append("file", file);
    const { data } = await api.post<PhotoAnalysisResult>(
      "/photos/analyze",
      formData,
      { headers: { "Content-Type": "multipart/form-data" } }
    );
    return data;
  },
```

Agregar el import del tipo al inicio del archivo (si no está ya):
```typescript
import type { ..., PhotoAnalysisResult } from "@/lib/types";
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/types.ts frontend/src/lib/api.ts
git commit -m "feat: tipos PhotoAnalysisResult, PhysicalAttributes y photosApi.analyzePhoto"
```

---

## Task 7: Frontend — PhotoUpload con badge de calidad

**Files:**
- Modify: `frontend/src/components/ui/PhotoUpload.tsx`

- [ ] **Step 1: Actualizar props e interfaz del componente**

Reemplazar `PhotoUploadProps` y la firma del componente:

```typescript
import type { PhotoAnalysisResult } from "@/lib/types";

interface PhotoUploadProps {
  photos: SelectedPhoto[];
  onChange: (photos: SelectedPhoto[]) => void;
  maxPhotos?: number;
  disabled?: boolean;
  analyses?: (PhotoAnalysisResult | null)[];   // ← nuevo: resultado por foto
  analyzingIndexes?: number[];                  // ← nuevo: índices en análisis
}

export function PhotoUpload({
  photos,
  onChange,
  maxPhotos = MAX_PHOTOS,
  disabled = false,
  analyses = [],
  analyzingIndexes = [],
}: PhotoUploadProps) {
```

- [ ] **Step 2: Agregar badge de calidad en la previsualización de cada foto**

Dentro del `{photos.map((photo, index) => (...))}`, después del overlay de estado `uploaded` y antes del botón eliminar, agregar el badge de análisis:

```tsx
              {/* Badge de análisis de IA */}
              {analyzingIndexes.includes(index) && (
                <div className="absolute bottom-0 left-0 right-0 bg-blue-600/90 px-2 py-1 flex items-center gap-1">
                  <div className="h-2.5 w-2.5 border-2 border-white border-t-transparent rounded-full animate-spin flex-shrink-0" />
                  <p className="text-[10px] text-white">Analizando…</p>
                </div>
              )}
              {analyses[index] && !analyzingIndexes.includes(index) && (
                <div
                  className={`absolute bottom-0 left-0 right-0 px-2 py-1 flex items-center gap-1 ${
                    analyses[index]!.quality.is_useful
                      ? "bg-green-600/90"
                      : "bg-amber-500/90"
                  }`}
                >
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
```

- [ ] **Step 3: Actualizar el texto guía inferior del componente**

Reemplazar el párrafo final:

```tsx
      <p className="text-xs text-gray-500">
        Sube una foto reciente con la cara visible y bien iluminada para activar el reconocimiento con IA.
        Formatos: JPG, PNG, WebP. Máximo 5MB por foto.
      </p>
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ui/PhotoUpload.tsx
git commit -m "feat: badge de calidad IA en PhotoUpload — útil/no útil por foto"
```

---

## Task 8: Frontend — formulario de reporte familiar completo

**Files:**
- Modify: `frontend/src/app/dashboard/familiar/report/page.tsx`

Este task reemplaza el formulario actual con la versión completa: secciones progresivas, auto-relleno desde foto, y todos los campos físicos.

- [ ] **Step 1: Actualizar imports y estado del formulario**

Reemplazar el bloque de imports y el estado inicial del componente:

```typescript
"use client";

import { useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Toast } from "@/components/ui/Toast";
import { PhotoUpload, type SelectedPhoto } from "@/components/ui/PhotoUpload";
import { personsApi, photosApi } from "@/lib/api";
import type { PersonReportCreate, PhysicalAttributes, PhotoAnalysisResult } from "@/lib/types";

// ── Opciones de selectores ──────────────────────────────────────────────────
const GENDER_OPTIONS    = [["", "No especificado"], ["M", "Masculino"], ["F", "Femenino"], ["O", "Otro"]];
const BUILD_OPTIONS     = [["", "—"], ["delgado", "Delgado"], ["normal", "Normal"], ["robusto", "Robusto"], ["corpulento", "Corpulento"]];
const SKIN_OPTIONS      = [["", "—"], ["muy_claro", "Muy claro"], ["claro", "Claro"], ["medio", "Medio"], ["moreno", "Moreno"], ["oscuro", "Oscuro"]];
const HAIR_COLOR_OPTIONS = [["", "—"], ["negro", "Negro"], ["castaño", "Castaño"], ["rubio", "Rubio"], ["pelirrojo", "Pelirrojo"], ["canoso", "Canoso"], ["blanco", "Blanco"], ["calvo", "Calvo"]];
const HAIR_LENGTH_OPTIONS = [["", "—"], ["calvo", "Calvo"], ["muy_corto", "Muy corto"], ["corto", "Corto"], ["mediano", "Mediano"], ["largo", "Largo"]];
const EYE_COLOR_OPTIONS = [["", "—"], ["negros", "Negros"], ["marrones", "Marrones"], ["verdes", "Verdes"], ["azules", "Azules"], ["grises", "Grises"], ["miel", "Miel"]];
const FACIAL_HAIR_OPTIONS = [["", "—"], ["ninguno", "Ninguno"], ["barba", "Barba"], ["bigote", "Bigote"], ["barba_y_bigote", "Barba y bigote"], ["incipiente", "Incipiente"]];

// ── Estado inicial de atributos físicos ─────────────────────────────────────
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
```

- [ ] **Step 2: Definir el estado del componente**

Reemplazar todo el bloque `export default function FamiliarReportPage()` y el estado interno:

```typescript
export default function FamiliarReportPage() {
  const router = useRouter();

  // ── Datos básicos ──────────────────────────────────────────────────────────
  const [formData, setFormData] = useState({
    full_name:          "",
    gender:             "",
    date_of_birth:      "",
    disappeared_at:     new Date().toISOString().split("T")[0],
    last_known_location: "",
    last_seen_at:       "",
    physical_description: "",
    height_cm:          "",
  });

  // ── Atributos físicos ──────────────────────────────────────────────────────
  const [attrs, setAttrs] = useState<PhysicalAttributes>({ ...EMPTY_ATTRS });

  // ── Fotos y análisis ───────────────────────────────────────────────────────
  const [photos,           setPhotos]           = useState<SelectedPhoto[]>([]);
  const [photoAnalyses,    setPhotoAnalyses]     = useState<(PhotoAnalysisResult | null)[]>([]);
  const [analyzingIndexes, setAnalyzingIndexes]  = useState<number[]>([]);
  const aiAutoFilledRef = useRef(false);         // useRef para evitar stale closure en callback async

  // ── Acordeones ────────────────────────────────────────────────────────────
  const [showPhysical, setShowPhysical]     = useState(false);
  const [showClothing, setShowClothing]     = useState(false);
  const [showNotes,    setShowNotes]        = useState(false);

  // ── UI ────────────────────────────────────────────────────────────────────
  const [isLoading,    setIsLoading]   = useState(false);
  const [uploadStep,   setUploadStep]  = useState("");
  const [errors,       setErrors]      = useState<Record<string, string>>({});
  const [toastMessage, setToastMessage] = useState("");
  const [toastType,    setToastType]   = useState<"success" | "error">("success");
  const [showToast,    setShowToast]   = useState(false);
```

- [ ] **Step 3: Agregar handlers para fotos con análisis automático**

Después del estado, agregar:

```typescript
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

  // Cuando cambian las fotos, analizar las nuevas automáticamente
  const handlePhotosChange = useCallback(async (newPhotos: SelectedPhoto[]) => {
    setPhotos(newPhotos);

    // Detectar fotos nuevas (pending, no analizadas aún)
    const newIndexes: number[] = [];
    newPhotos.forEach((p, i) => {
      if (p.status === "pending" && photoAnalyses[i] === undefined) {
        newIndexes.push(i);
      }
    });

    if (newIndexes.length === 0) return;

    // Marcar como analizando
    setAnalyzingIndexes((prev) => [...prev, ...newIndexes]);
    const newAnalyses = [...photoAnalyses];
    while (newAnalyses.length < newPhotos.length) newAnalyses.push(null);

    for (const idx of newIndexes) {
      const photo = newPhotos[idx];
      if (!photo || photo.status === "error") continue;
      try {
        const result = await photosApi.analyzePhoto(photo.file);
        newAnalyses[idx] = result;

        // Auto-rellenar desde la primera foto útil (solo una vez)
        if (result.quality.is_useful && !aiAutoFilledRef.current) {
          aiAutoFilledRef.current = true;
          setAttrs((prev) => ({
            ...prev,
            skin_tone:  result.attributes.skin_tone  || prev.skin_tone,
            hair_color: result.attributes.hair_color || prev.hair_color,
            ai_analyzed:  true,
            ai_confidence: result.quality.blur_score,
          }));
          setShowPhysical(true);  // abrir acordeón automáticamente
          showNotification("success", "Foto analizada — se completaron algunos campos automáticamente.");
        } else if (!result.quality.is_useful && result.quality.issues.length > 0) {
          showNotification("error", `Foto ${idx + 1}: ${result.quality.issue_labels[0] ?? "baja calidad para IA"}. Se recomienda una mejor foto.`);
        }
      } catch {
        newAnalyses[idx] = null;
      }
    }

    setPhotoAnalyses([...newAnalyses]);
    setAnalyzingIndexes((prev) => prev.filter((i) => !newIndexes.includes(i)));
  }, [photoAnalyses]);

  // Handlers de campos de texto
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
```

- [ ] **Step 4: Agregar validación y submit**

```typescript
  const validateForm = (): boolean => {
    const e: Record<string, string> = {};
    if (!formData.full_name.trim())       e.full_name      = "El nombre es obligatorio";
    else if (formData.full_name.length < 3) e.full_name    = "Mínimo 3 caracteres";
    if (!formData.disappeared_at)          e.disappeared_at = "La fecha de desaparición es obligatoria";
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
      const cleanAttrs: PhysicalAttributes = {};
      (Object.keys(attrs) as (keyof PhysicalAttributes)[]).forEach((k) => {
        const v = attrs[k];
        if (v !== "" && v !== undefined && v !== null) {
          (cleanAttrs as Record<string, unknown>)[k] = v;
        }
      });

      const payload: PersonReportCreate = {
        full_name:           formData.full_name,
        disappeared_at:      formData.disappeared_at,
        gender:              formData.gender || undefined,
        date_of_birth:       formData.date_of_birth || undefined,
        age_at_disappearance: formData.date_of_birth ? (calculateAge(formData.date_of_birth) ?? undefined) : undefined,
        last_known_location: formData.last_known_location || undefined,
        last_seen_at:        formData.last_seen_at || undefined,
        height_cm:           formData.height_cm ? parseInt(formData.height_cm) : undefined,
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
```

- [ ] **Step 5: Renderizar el formulario completo**

Reemplazar todo el `return (...)`:

```tsx
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

          {/* ── SECCIÓN 1: Datos básicos (siempre visible) ──────────────────── */}
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

          {/* ── SECCIÓN 2: Foto (siempre visible) ───────────────────────────── */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-[13px] font-semibold text-slate-800 mb-1">Foto</h2>
            <p className="text-[11px] text-slate-500 mb-3">
              Sube una foto reciente con la cara visible. Se analizará automáticamente para completar algunos campos.
            </p>
            <PhotoUpload photos={photos} onChange={handlePhotosChange}
              disabled={isLoading} analyses={photoAnalyses} analyzingIndexes={analyzingIndexes} />
          </div>

          {/* ── SECCIÓN 3: Características físicas (acordeón) ───────────────── */}
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <button type="button"
              className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-50 transition-colors"
              onClick={() => setShowPhysical(!showPhysical)}>
              <span className="text-[13px] font-semibold text-slate-800 flex items-center gap-2">
                Características físicas
                {aiAutoFilledRef.current && (
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

          {/* ── SECCIÓN 4: Ropa (acordeón) ───────────────────────────────────── */}
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
                {[
                  ["clothing_upper",       "Ropa superior",   "polera azul manga larga"],
                  ["clothing_lower",       "Ropa inferior",   "jean negro"],
                  ["clothing_footwear",    "Calzado",         "zapatillas blancas Nike"],
                  ["clothing_accessories", "Accesorios",      "mochila gris, gorra negra"],
                ].map(([name, label, placeholder]) => (
                  <div key={name}>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">{label}</label>
                    <input type="text" name={name}
                      value={(attrs as Record<string, string>)[name] ?? ""}
                      onChange={handleAttr} placeholder={`Ej: ${placeholder}`}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── SECCIÓN 5: Notas adicionales (acordeón) ─────────────────────── */}
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

          {/* ── Botones ──────────────────────────────────────────────────────── */}
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
```

- [ ] **Step 6: Verificar en browser**

```bash
# 1. Entrar como familiar (testfamiliar@test.com / Test1234)
# 2. Ir a /dashboard/familiar/report
# 3. Subir una foto con cara visible → debe aparecer "Analizando…" y luego badge verde "Útil para IA"
# 4. El acordeón "Características físicas" debe abrirse automáticamente con tono de piel y color de cabello pre-rellenos
# 5. Verificar que el badge dice "(IA)" junto a los campos auto-rellenados
# 6. Completar nombre y fecha de desaparición → enviar reporte
# 7. Verificar en DB que physical_attributes tiene los datos
docker exec aerofinder_postgres psql -U postgres -d aerofinder -c \
  "SELECT full_name, physical_attributes FROM missing_persons ORDER BY created_at DESC LIMIT 1;"
```

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/dashboard/familiar/report/page.tsx
git commit -m "feat: formulario reporte familiar completo — secciones progresivas, auto-relleno IA desde foto"
```

---

## Notas de implementación

### Por qué OpenCV en vez de InsightFace en el backend

InsightFace no está en `backend/requirements.txt` y requiere descargar el modelo buffalo_l (~500MB) + GPU. Para el análisis de calidad y color, OpenCV con Haar Cascade es suficiente y arranca en milisegundos. InsightFace sigue siendo el motor de reconocimiento facial en el ai-worker para generar embeddings — eso no cambia.

### Por qué JSONB y no columnas separadas

15+ columnas nuevas vs un solo campo flexible. Los atributos físicos son semi-estructurados (no todos aplican a todos los casos). JSONB permite consultas en PostgreSQL (`physical_attributes->>'skin_tone' = 'medio'`) y no requiere migración para añadir nuevos campos futuros.

### Rate limiting del endpoint /photos/analyze

No se implementa rate limiting en este plan — el middleware de producción (nginx/caddy) lo maneja. Para desarrollo, el límite de tamaño (10MB) y la autenticación JWT son suficientes.

### Migración 0011 no requiere superusuario

`op.add_column` es DDL estándar que `aerofinder_app` puede ejecutar. A diferencia de las migraciones de políticas RLS (0009/0010), esta migración puede aplicarse normalmente con `alembic upgrade head`.

# Mejoras al flujo de reporte familiar — Diseño

**Fecha:** 2026-05-24

## Objetivo

Corregir 3 bugs críticos y enriquecer el formulario de reporte de personas desaparecidas para el rol `familiar`, priorizando facilidad de uso y completitud del reporte.

---

## Alcance

| # | Tipo | Descripción |
|---|------|-------------|
| 1 | Bug | Sesión se cierra al refrescar la página |
| 2 | Bug | Fotos no cargan en vista admin (host MinIO interno) |
| 3 | Feature | Validación de calidad de foto antes de enviar reporte |
| 4 | Feature | Auto-relleno de atributos físicos desde foto + formulario completo |

El campo `physical_description` (texto libre) se mantiene como "notas adicionales". Los campos estructurados de ropa (`last_known_clothing`) se reemplazan por 4 campos de texto específicos.

---

## Bug 1 — Sesión se cierra al refrescar

### Diagnóstico

`auth.ts` tiene `loadUser()` que lee el token desde `localStorage`. El problema es que el guard de rutas evalúa `isAuthenticated` de forma síncrona antes de que `loadUser()` termine (es async). Resultado: `isAuthenticated = false` → redirige a login.

### Solución

Agregar `isInitialized: boolean` al store. El guard espera hasta `isInitialized = true` antes de tomar cualquier decisión de redirección. `loadUser()` setea `isInitialized = true` al terminar (éxito o fallo).

**Archivos:**
- `frontend/src/store/auth.ts` — agregar `isInitialized`, setearlo al final de `loadUser()`
- `frontend/src/components/auth/AuthGuard.tsx` (o equivalente) — esperar `isInitialized`

---

## Bug 2 — Fotos no cargan en vista admin

### Diagnóstico

MinIO genera URLs presignadas con el hostname interno de Docker (`http://minio:9000/...`). El browser del admin intenta acceder a `minio` que no resuelve fuera del container.

### Solución

Al generar la `view_url` en el backend, reemplazar el host interno por la variable de entorno `SERVER_HOST`. Ya existe esta variable en `.env`.

```python
# backend/app/routers/photos.py (o donde se genere view_url)
view_url = view_url.replace("http://minio:9000", f"http://{settings.SERVER_HOST}:9000")
```

**Archivos:**
- `backend/app/routers/photos.py` — fix en generación de presigned URL

---

## Feature 3 — Validación de calidad de foto

### Flujo

1. Familiar sube foto en el formulario de reporte
2. Frontend llama `POST /photos/analyze` con la imagen (multipart)
3. Backend responde en <2s con resultado de calidad
4. Frontend muestra badge junto a la foto: **"✓ Útil para IA"** o **"⚠ Cara no detectada"**
5. Si la foto no sirve, se sugiere tomar otra con la cara visible y bien iluminada
6. El familiar puede continuar con fotos de baja calidad (no es bloqueante), pero siempre se le informa

### Endpoint

```
POST /photos/analyze
Content-Type: multipart/form-data
Body: { file: <imagen> }
Autenticación: Bearer token (rol familiar o superior)
```

**Response:**
```json
{
  "quality": {
    "is_useful": true,
    "face_detected": true,
    "face_angle": "frontal",
    "blur_score": 0.92,
    "issues": []
  },
  "attributes": {
    "estimated_age": 32,
    "gender_hint": "masculino",
    "skin_tone": "medio",
    "hair_color": "castaño"
  }
}
```

`issues` puede contener: `"no_face"`, `"multiple_faces"`, `"blurry"`, `"poor_lighting"`, `"non_frontal"`.

### Implementación backend

- Nuevo router `backend/app/routers/photo_analysis.py`
- Usa la instancia global de InsightFace (buffalo_l) ya cargada por `ai_worker`
- El análisis de `skin_tone` y `hair_color` usa análisis de color sobre la región de la cara (sin modelo adicional — extracción de tono dominante en espacio HSV)
- No persiste nada en DB — endpoint stateless

---

## Feature 4 — Formulario de reporte completo con auto-relleno

### Principios UX

- **Progressive disclosure:** campos críticos visibles siempre, detalles opcionales bajo acordeón "Más detalles físicos"
- **Auto-relleno suave:** los campos detectados por IA se pre-llenan con indicador visual `(detectado automáticamente)` — el usuario puede editarlos
- **Todo opcional salvo nombre y fecha:** no bloquear el reporte si faltan datos físicos
- **Lenguaje simple:** labels en español cotidiano, sin tecnicismos

### Estructura del formulario

#### Sección 1 — Datos básicos (siempre visible)
| Campo | Tipo | Obligatorio |
|-------|------|-------------|
| Nombre completo | Texto | ✓ |
| Fecha de desaparición | Date picker | ✓ |
| Último lugar conocido | Texto | — |

#### Sección 2 — Foto (siempre visible)
- Subida de foto con feedback de calidad (Feature 3)
- Mensaje guía: "Sube una foto reciente con la cara visible para activar el reconocimiento automático"
- Al subir foto válida: campos de la Sección 3 se auto-rellenan

#### Sección 3 — Características físicas (acordeón, se abre automáticamente si hay auto-relleno)

**Fila 1:**
| Campo | Tipo | Auto-relleno |
|-------|------|-------------|
| Edad al desaparecer | Número (años) | Sí (InsightFace) |
| Género | Selector | Sí (InsightFace) |
| Estatura | Número (cm) | — |
| Peso aprox. | Número (kg) | — |

**Fila 2:**
| Campo | Tipo | Auto-relleno |
|-------|------|-------------|
| Complexión | Selector | — |
| Tono de piel | Selector | Sí (análisis color) |
| Color de cabello | Selector | Sí (análisis color) |
| Largo de cabello | Selector | — |

**Fila 3:**
| Campo | Tipo | Auto-relleno |
|-------|------|-------------|
| Color de ojos | Selector | — |
| Usa lentes | Checkbox | — |
| Vello facial | Selector | — |
| Marcas distintivas | Textarea | — |

**Opciones de selectores:**
- Género: `masculino / femenino / no especificado`
- Complexión: `delgado / normal / robusto / corpulento`
- Tono de piel: `muy claro / claro / medio / moreno / oscuro`
- Color de cabello: `negro / castaño / rubio / pelirrojo / canoso / blanco / calvo`
- Largo de cabello: `calvo / muy corto / corto / mediano / largo`
- Color de ojos: `negros / marrones / verdes / azules / grises / miel`
- Vello facial: `ninguno / barba / bigote / barba y bigote / incipiente`

#### Sección 4 — Ropa al momento de la desaparición (acordeón)
| Campo | Tipo |
|-------|------|
| Ropa superior | Texto (placeholder: "polera azul manga larga") |
| Ropa inferior | Texto (placeholder: "jean negro") |
| Calzado | Texto (placeholder: "zapatillas blancas Nike") |
| Accesorios | Texto (placeholder: "mochila gris, gorra negra") |

#### Sección 5 — Información adicional (acordeón)
| Campo | Tipo |
|-------|------|
| Descripción adicional | Textarea (campo existente `physical_description`) |

### Almacenamiento en DB

Nuevo campo `physical_attributes JSONB` en tabla `missing_persons`. Almacena todos los atributos estructurados:

```json
{
  "gender": "masculino",
  "estimated_age": 32,
  "height_cm": 170,
  "weight_kg": 70,
  "build": "normal",
  "skin_tone": "medio",
  "hair_color": "castaño",
  "hair_length": "corto",
  "eye_color": "marrones",
  "wears_glasses": false,
  "facial_hair": "ninguno",
  "distinguishing_marks": "cicatriz en mejilla derecha",
  "clothing_upper": "polera azul",
  "clothing_lower": "jean negro",
  "clothing_footwear": "zapatillas blancas",
  "clothing_accessories": "mochila gris",
  "ai_analyzed": true,
  "ai_confidence": 0.87
}
```

Usar JSONB evita migración de schema ante futuros campos nuevos.

**Migración Alembic:** `0011_add_physical_attributes_jsonb.py`

---

## Archivos involucrados

| Archivo | Acción |
|---------|--------|
| `frontend/src/store/auth.ts` | Agregar `isInitialized` |
| `frontend/src/components/auth/AuthGuard.tsx` | Esperar `isInitialized` |
| `backend/app/routers/photos.py` | Fix host MinIO en presigned URL |
| `backend/app/routers/photo_analysis.py` | Nuevo endpoint `POST /photos/analyze` |
| `backend/app/main.py` | Registrar nuevo router |
| `backend/migrations/versions/0011_add_physical_attributes_jsonb.py` | Nueva migración JSONB |
| `backend/app/models/persons.py` | Agregar campo `physical_attributes` |
| `backend/app/schemas/persons.py` | Actualizar schemas con nuevos campos |
| `frontend/src/app/dashboard/familiar/report/page.tsx` | Formulario completo + auto-relleno |
| `frontend/src/components/ui/PhotoUpload.tsx` | Integrar feedback de calidad |

---

## Notas de implementación

### InsightFace en el backend web

El `ai_worker` ya tiene InsightFace cargado. Para evitar duplicar la carga en el backend FastAPI, el endpoint `/photos/analyze` hace una llamada interna HTTP al ai_worker (que expone un endpoint interno), o bien se carga InsightFace de forma lazy en el backend con un singleton. **Decisión:** singleton lazy en el backend — más simple, evita acoplamiento de servicios.

### Análisis de color (skin_tone, hair_color)

Sin modelo adicional. Algoritmo:
1. Detectar landmarks faciales (InsightFace 2d106det)
2. Extraer región de piel (mejillas) y región de cabello
3. Calcular tono dominante en espacio HSV
4. Mapear a categorías predefinidas con umbrales

### Seguridad del endpoint /photos/analyze

- Requiere token JWT válido (cualquier rol)
- Límite de tamaño: 10MB
- Rate limit: 10 requests/minuto por usuario (evitar abuso)
- La imagen NO se guarda — solo se procesa en memoria

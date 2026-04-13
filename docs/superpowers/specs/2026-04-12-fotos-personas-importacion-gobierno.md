# AEROFINDER — Spec: Fotos de Personas, Importación Gubernamental y Correcciones del Sistema

**Fecha:** 2026-04-12  
**Estado:** Aprobado  
**Sesión:** BE-6

---

## 1. Contexto

El backend tiene CRUD completo de personas desaparecidas pero carece de:
- Subida de fotos de referencia para el pipeline de IA
- Campos físicos relevantes para la búsqueda (estatura, ropa)
- Importación batch desde sistemas gubernamentales
- Corrección de 5 inconsistencias detectadas en el sistema actual

---

## 2. Inconsistencias del Sistema Actual (a corregir en esta sesión)

### 2.1 CRÍTICO — `Alert` sin `recipient_user_id`

**Problema:** `detection_consumer.py` crea alertas con `recipient_user_id = NULL`. La política RLS `alerts_select_own` bloquea la visibilidad para usuarios no-admin. El `notification_worker` no puede notificar a nadie (JOIN con `users` retorna NULL → skip silencioso). Los familiares y buscadores NUNCA reciben notificaciones.

**Causa raíz:** El consumer debe crear una alerta por cada usuario relevante:
- `buscadores` activos en la misión → content_level `full`
- `ayudantes` con acceso → content_level `partial`
- `familiares` vinculados a la persona → content_level `confirmation_only`

**Fix:** En `_handle_message`, tras insertar la detección:
1. Consultar `mission_drones` → `missions` → `missing_person_id`
2. Consultar `person_relatives` para obtener los familiares
3. Consultar usuarios con rol `buscador`/`ayudante` activos
4. Crear una `Alert` por cada recipient con su `content_level` correspondiente
5. El trigger `fn_create_notification_queue_entries()` ya maneja el fan-out a `notification_queue`

### 2.2 IMPORTANTE — `config_cache` no se invalida tras PATCH

**Problema:** `PATCH /config/{key}` actualiza en DB pero no llama `config_cache.invalidate()`. Los workers usan el valor viejo hasta que expire el TTL (30s). Para umbrales de IA esto puede ser crítico.

**Fix:** En `system.py`, llamar `await config_cache.invalidate()` antes de retornar.

### 2.3 MENOR — `asyncio.get_event_loop()` deprecado

**Archivo:** `routers/detections.py:80`  
**Fix:** Cambiar a `asyncio.get_running_loop()`

### 2.4 MENOR — `datetime.utcnow()` deprecado

**Archivo:** `services/config_cache.py:51, 101`  
**Fix:** Cambiar a `datetime.now(timezone.utc)`

### 2.5 MENOR — Método privado `_build_public_url` llamado externamente

**Archivo:** `services/detection_consumer.py` llama `minio_service._build_public_url()`  
**Fix:** Hacer el método público (quitar el underscore)

---

## 3. Campos Nuevos en `missing_persons`

### 3.1 Migración de DB (Alembic 0004)

```sql
ALTER TABLE missing_persons
    ADD COLUMN height_cm          SMALLINT,          -- estatura en cm (opcional)
    ADD COLUMN last_known_clothing TEXT,              -- ropa al momento de desaparecer
    ADD COLUMN source             TEXT NOT NULL DEFAULT 'manual';
    -- valores: 'manual' | 'public_form' | 'gov_import'
```

### 3.2 Actualizar ORM `MissingPerson`

Agregar tres campos al modelo en `models/persons.py`:
```python
height_cm: Mapped[Optional[int]] = mapped_column(SmallInteger, nullable=True)
last_known_clothing: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
source: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'manual'"))
```

### 3.3 Actualizar Schemas

- `PersonCreate`: añadir `height_cm`, `last_known_clothing` (opcionales)
- `PersonUpdate`: añadir `height_cm`, `last_known_clothing` (opcionales)
- `PersonResponse`: añadir `height_cm`, `last_known_clothing`, `source`
- `RescueRequestCreate`: añadir `height_cm`, `last_known_clothing` (opcionales)
- `public.py`: setear `source="public_form"` al crear persona

---

## 4. Subida de Fotos (Presigned URL)

### 4.1 Flujo completo

```
1. POST /persons/{id}/photos/upload-url
   → body: { face_angle: "frontal"|"profile"|"three_quarter"|"unknown" }
   → respuesta: { upload_url: str, photo_id: UUID, expires_in: 300 }

2. Cliente hace PUT <upload_url> con el archivo binario directo a MinIO
   → headers: Content-Type: image/jpeg (o image/png, image/webp)

3. POST /persons/{id}/photos/confirm
   → body: { photo_id: UUID }
   → backend verifica que el objeto existe en MinIO (stat_object)
   → calcula SHA256 del objeto descargado para detectar corrupción
   → crea registro en PersonPhoto + File
   → si rol = admin/buscador: is_active=True, lanza tarea background para generar embedding
   → si rol = familiar: is_active=False, requiere aprobación

4. GET /persons/{id}/photos
   → retorna lista con presigned GET URL (1h de validez) para cada foto activa

5. PATCH /persons/{id}/photos/{photo_id}
   → admin/ayudante puede cambiar is_active (aprobar/rechazar foto de familiar)

6. DELETE /persons/{id}/photos/{photo_id}
   → admin/buscador: soft delete (is_active=False en DB; NO se borra de MinIO)
```

### 4.2 Restricciones

- Formatos aceptados: `image/jpeg`, `image/png`, `image/webp`
- Tamaño máximo: 5 MB por foto
- Máximo 10 fotos activas por persona
- Mínimo 1 foto activa con `has_embedding=True` para que el caso entre al pipeline de IA
- La presigned PUT URL expira en 5 minutos (300s)
- El paso de confirm valida con MinIO `stat_object` (no descarga la imagen completa)

### 4.3 Permisos por rol

| Acción | admin | buscador | ayudante | familiar |
|--------|-------|----------|----------|----------|
| Solicitar upload URL | ✅ | ✅ | ✅ | ✅ (solo sus personas) |
| Confirmar subida | ✅ | ✅ | ✅ | ✅ (solo sus personas) |
| Foto activa al confirmar | ✅ | ✅ | ❌ | ❌ |
| Aprobar foto de familiar | ✅ | ❌ | ✅ | ❌ |
| Eliminar foto | ✅ | ✅ | ❌ | ❌ |
| Ver fotos (con URL) | ✅ | ✅ | ✅ | ✅ (solo sus personas) |

### 4.4 Método nuevo en `MinioService`

```python
def get_presigned_put_url(
    self,
    bucket: str,
    object_key: str,
    expires_seconds: int = 300,
    content_type: str = "image/jpeg",
) -> str:
    """Genera URL firmada para PUT directo desde el cliente."""
```

También hacer público el método `build_public_url` (quitar underscore).

### 4.5 Schemas nuevos

```python
class PhotoUploadUrlRequest(BaseModel):
    face_angle: PhotoFaceAngle = PhotoFaceAngle.unknown

class PhotoUploadUrlResponse(BaseModel):
    upload_url: str
    photo_id: uuid.UUID
    object_key: str
    expires_in: int  # segundos

class PhotoConfirmRequest(BaseModel):
    photo_id: uuid.UUID

class PhotoPatchRequest(BaseModel):
    is_active: bool

# PhotoResponse (existente) añade:
class PhotoResponse(BaseModel):
    ...
    view_url: Optional[str]  # presigned GET URL, 1h de validez
```

---

## 5. Importación Gubernamental (Batch CSV)

### 5.1 Plantilla CSV

```csv
full_name,disappeared_at,date_of_birth,age_at_disappearance,gender,
physical_description,height_cm,last_known_clothing,last_known_location,
last_seen_at,reporter_name,reporter_contact,
photo_url_1,photo_url_2,photo_url_3
```

**Reglas del CSV:**
- `disappeared_at` y `date_of_birth`: formato `YYYY-MM-DD`
- `last_seen_at`: formato ISO 8601 (`2024-03-15T14:30:00`)
- `height_cm`: entero (ej: `175`); vacío si desconocido
- `photo_url_*`: URL pública de imagen JPEG/PNG; vacío si no aplica
- Encoding: UTF-8
- Separador: coma; campos con comas entre comillas dobles

### 5.2 Endpoint de importación

```
POST /admin/import/missing-persons
Content-Type: multipart/form-data
campo: file (CSV)
campo: dry_run (bool, default false) — valida sin persistir

Respuesta:
{
  "total_rows": 150,
  "created": 147,
  "skipped": 2,      // ya existen (mismo nombre + fecha)
  "errors": 1,
  "error_details": [
    { "row": 45, "field": "disappeared_at", "error": "formato inválido" }
  ]
}
```

Solo accesible por `admin`. Las personas importadas quedan con `source="gov_import"` y `status="active"` (ya fueron validadas por el gobierno).

### 5.3 Descarga de plantilla

```
GET /admin/import/missing-persons/template
→ retorna el CSV de plantilla vacío con headers y una fila de ejemplo
```

### 5.4 Procesamiento de fotos en importación

Para cada `photo_url_*` no vacío:
1. Descargar la imagen con `httpx` (timeout 10s)
2. Validar Content-Type y tamaño (≤5MB)
3. Subir a MinIO bucket `aerofinder-photos`
4. Crear registro `File` + `PersonPhoto` con `is_active=True`
5. Errores en fotos no abortan la fila — se registran como warning

### 5.5 Tipo de BD gubernamental recomendada

Para que el gobierno pueda exportar datos al sistema AEROFINDER:

**Formato entregado al gobierno:**
- **CSV con plantilla fija** (descargable desde `/admin/import/missing-persons/template`)
- UTF-8, separador coma, comillas dobles para campos con comas
- Universal: compatible con Excel, LibreOffice, Oracle, SAP, sistemas legacy

**Campos mínimos obligatorios:**
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `full_name` | Texto | Nombre completo del desaparecido |
| `disappeared_at` | Fecha (YYYY-MM-DD) | Fecha de desaparición |
| `reporter_name` | Texto | Nombre del familiar o funcionario que reporta |
| `reporter_contact` | Texto | Teléfono o correo |

**Campos recomendados:**
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `date_of_birth` | Fecha | Para calcular edad aproximada |
| `height_cm` | Entero | Estatura (ayuda al filtrado por cámara de dron) |
| `last_known_clothing` | Texto libre | Ropa al desaparecer (filtrado futuro por color) |
| `photo_url_1..3` | URL | Fotos de referencia para IA |

**Evolución futura (cuando el gobierno tenga API):**
- Fase 2: SFTP con archivos CSV cifrados PGP (para automatización nocturna)
- Fase 3: REST API JSON con autenticación OAuth2 (sincronización en tiempo real)

---

## 6. Resumen de Archivos a Modificar/Crear

### Nuevos
- `backend/app/routers/photos.py` — endpoints de fotos
- `backend/app/routers/admin_import.py` — importación CSV
- `backend/app/schemas/photos.py` — schemas de fotos
- `backend/migrations/versions/0004_add_person_fields.py` — height_cm, last_known_clothing, source

### Modificados
- `backend/app/models/persons.py` — 3 campos nuevos
- `backend/app/schemas/persons.py` — campos nuevos en Create/Update/Response
- `backend/app/schemas/public.py` — campos nuevos en RescueRequestCreate
- `backend/app/services/minio_service.py` — presigned PUT + build_public_url público
- `backend/app/services/detection_consumer.py` — fan-out de alertas por usuario + SET LOCAL
- `backend/app/routers/system.py` — invalidar config_cache tras PATCH
- `backend/app/routers/detections.py` — get_running_loop()
- `backend/app/services/config_cache.py` — datetime.now(timezone.utc)
- `backend/app/routers/public.py` — setear source="public_form"
- `backend/app/main.py` — registrar router photos y admin_import

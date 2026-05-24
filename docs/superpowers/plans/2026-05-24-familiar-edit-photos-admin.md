# Familiar Edit + Photo Fixes + Admin Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 5 mejoras: (1) fix fotos no cargan — `SERVER_HOST` faltante; (2) familiar puede ver/editar datos del desaparecido; (3) validación de fotos mejorada (resolución mínima); (4) admin puede solicitar más fotos al familiar; (5) admin mobile UI con proporciones correctas.

**Architecture:**
- Task 1: 1 línea en `.env` — `SERVER_HOST=192.168.100.213` es la raíz del bug de fotos.
- Task 2: nuevo endpoint backend `PATCH /persons/{id}/my-report` solo para familiar + formulario inline en `/dashboard/persons/[id]`.
- Task 3: `PhotoUpload.tsx` agrega check de resolución mínima via `Image` + `createObjectURL`.
- Task 4: endpoint `POST /persons/{id}/request-photos` (admin/buscador) → push notification al familiar; familiar ve banner en su caso.
- Task 5: `overflow-x-auto` wrapper en tablas admin; usar `min-w-[600px]` en table.

**Tech Stack:** FastAPI, Next.js 14 App Router, Zustand, pywebpush, Tailwind CSS.

---

## Archivos modificados

| Archivo | Tarea |
|---|---|
| `.env` | Task 1 |
| `backend/app/routers/persons.py` | Task 2, Task 4 |
| `backend/app/schemas/persons.py` | Task 2 |
| `frontend/src/lib/api.ts` | Task 2, Task 4 |
| `frontend/src/app/dashboard/persons/[id]/page.tsx` | Task 2, Task 4 |
| `frontend/src/components/ui/PhotoUpload.tsx` | Task 3 |
| `frontend/src/app/dashboard/admin/pending-review/page.tsx` | Task 4, Task 5 |
| `frontend/src/app/dashboard/familiar/page.tsx` | Task 4 |

---

## Task 1: Fix `SERVER_HOST` en `.env` — fotos no cargan

**Raíz del bug:** `_rewrite_minio_host()` en `photos.py` usa `settings.server_host`. El default en `config.py` es `"localhost"`. El `.env` tiene `NEXT_PUBLIC_API_URL=http://192.168.100.213:8000` pero NO tiene `SERVER_HOST`. Resultado: todas las `view_url` de fotos apuntan a `http://localhost:9000/...` — inaccesible desde el celular.

- [ ] **Paso 1: Agregar `SERVER_HOST` al `.env`**

Abrir `/home/wiz/aerofinder/.env` y agregar después de `NEXT_PUBLIC_API_URL`:

```bash
SERVER_HOST=192.168.100.213
```

**IMPORTANTE:** La IP debe coincidir con `NEXT_PUBLIC_API_URL`. Si el servidor tiene otra IP, usarla.

- [ ] **Paso 2: Verificar que `aerofinder.sh ip` también escribe `SERVER_HOST`**

Revisar `scripts/aerofinder.sh`, función `cmd_ip`. Si no actualiza `SERVER_HOST`, agregar la línea correspondiente junto a donde actualiza `NEXT_PUBLIC_API_URL`.

Buscar el bloque de `cmd_ip` y verificar/agregar:
```bash
sed -i "s/^SERVER_HOST=.*/SERVER_HOST=${new_ip}/" "$ENV_FILE"
```
Si `SERVER_HOST` no existe aún en `.env` en ese momento, el sed no hará nada — por eso el Paso 1 es primero.

- [ ] **Paso 3: Reiniciar backend y verificar**

```bash
cd /home/wiz/aerofinder
docker compose restart backend
```

Abrir una foto en el admin o familiar y confirmar que la imagen carga correctamente. La URL en el `<img src>` debe ser `http://192.168.100.213:9000/...` y no `http://localhost:9000/...`.

- [ ] **Paso 4: Commit**

```bash
cd /home/wiz/aerofinder
git add .env scripts/aerofinder.sh
git commit -m "fix: SERVER_HOST en .env — view_url de fotos usa IP del servidor en vez de localhost"
```

---

## Task 2: Familiar puede ver y editar datos del desaparecido

**Contexto:**
- `PATCH /persons/{id}` requiere `_staff` (admin/buscador) — familiar no puede.
- Familiar accede a `/dashboard/persons/{id}` que ya muestra datos pero sin botón de edición.
- Solo campos básicos editables por familiar: `full_name`, `age_at_disappearance`, `gender`, `physical_description`, `height_cm`, `last_known_clothing`, `last_known_location`, `last_seen_at`, `disappeared_at`, `reporter_name`, `reporter_contact`, `physical_attributes`.
- NO puede cambiar `status`.

### Paso backend

- [ ] **Paso 1: Leer `backend/app/routers/persons.py` líneas 200-225 y `backend/app/schemas/persons.py`**

- [ ] **Paso 2: Agregar `PersonFamiliarUpdate` schema en `backend/app/schemas/persons.py`**

Al final del bloque de `PersonUpdate` (después de línea ~69), agregar:

```python
class PersonFamiliarUpdate(BaseModel):
    """Campos que el familiar puede actualizar de su propio reporte."""
    full_name: Optional[str] = None
    age_at_disappearance: Optional[int] = None
    gender: Optional[str] = None
    physical_description: Optional[str] = None
    height_cm: Optional[int] = None
    last_known_clothing: Optional[str] = None
    physical_attributes: Optional[PhysicalAttributes] = None
    last_known_location: Optional[str] = None
    last_seen_at: Optional[datetime] = None
    disappeared_at: Optional[date] = None
    reporter_name: Optional[str] = None
    reporter_contact: Optional[str] = None
```

- [ ] **Paso 3: Agregar import en `backend/app/routers/persons.py`**

En los imports de schemas (línea ~30):
```python
from app.schemas.persons import (
    ...
    PersonFamiliarUpdate,
)
```

- [ ] **Paso 4: Agregar endpoint `PATCH /persons/{id}/my-report` en `backend/app/routers/persons.py`**

Insertar después del endpoint `update_person` (~línea 225):

```python
@router.patch("/{person_id}/my-report", response_model=PersonResponse)
async def familiar_update_person(
    person_id: uuid.UUID,
    body: PersonFamiliarUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PersonResponse:
    """Familiar actualiza datos básicos de su propia persona reportada. No puede cambiar status."""
    if current_user.role.name != RoleName.familiar:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Solo familiares pueden usar este endpoint")

    try:
        result = await db.execute(
            select(MissingPerson).where(MissingPerson.id == person_id)
        )
        person: MissingPerson | None = result.scalar_one_or_none()
    except Exception:
        logger.error("Error al buscar persona id=%s", person_id, exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

    if person is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Persona no encontrada")

    # Verificar que el familiar es relativo de la persona (RLS lo maneja, pero chequeamos igual)
    try:
        rel_result = await db.execute(
            select(PersonRelative).where(
                PersonRelative.missing_person_id == person_id,
                PersonRelative.user_id == current_user.id,
            )
        )
        relative = rel_result.scalar_one_or_none()
    except Exception:
        logger.error("Error al buscar relativo persona_id=%s user_id=%s", person_id, current_user.id, exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

    if relative is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No tienes acceso a este reporte")

    update_fields = body.model_dump(exclude_none=True)
    for field, value in update_fields.items():
        setattr(person, field, value)

    return PersonResponse.model_validate(person)
```

- [ ] **Paso 5: Verificar build backend**

```bash
cd /home/wiz/aerofinder
docker compose exec -T backend python -c "from app.routers.persons import router; print('OK')"
```
Esperado: `OK`

### Paso frontend

- [ ] **Paso 6: Agregar `updateMyReport` en `frontend/src/lib/api.ts`**

En `personsApi` (después de `updateStatus`):

```typescript
  async updateMyReport(id: string, payload: Partial<PersonCreate>): Promise<MissingPerson> {
    const { data } = await api.patch<MissingPerson>(`/persons/${id}/my-report`, payload);
    return data;
  },
```

- [ ] **Paso 7: Leer `frontend/src/app/dashboard/persons/[id]/page.tsx` completo**

- [ ] **Paso 8: Agregar modo edición inline para familiar en `persons/[id]/page.tsx`**

El archivo tiene una sección de InfoSection para el rol familiar. Agregar estado `isEditing` y formulario de edición que se muestra cuando el familiar presiona "Editar":

Encontrar el bloque donde se renderiza el botón/acciones para familiar (busca `role === "familiar"` o el retorno del componente para familiar). Agregar **antes** del `return` del componente principal:

```typescript
  // Estado de edición inline (solo familiar)
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<Partial<PersonCreate>>({});
  const [isSaving, setIsSaving] = useState(false);

  const handleEditSave = async () => {
    if (!person) return;
    setIsSaving(true);
    try {
      const updated = await personsApi.updateMyReport(person.id, editData);
      setPerson(updated);
      setIsEditing(false);
      setEditData({});
    } catch (err) {
      console.error("Error al guardar:", err);
    } finally {
      setIsSaving(false);
    }
  };
```

En el JSX, para el rol familiar, reemplazar el bloque de InfoSection por:

```tsx
{role === "familiar" && (
  <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
    <div className="mb-4 flex items-center justify-between">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Datos del caso</h2>
      {!isEditing ? (
        <button
          onClick={() => { setIsEditing(true); setEditData({}); }}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] font-medium text-slate-700 hover:bg-slate-50 transition-colors"
        >
          Editar
        </button>
      ) : (
        <div className="flex gap-2">
          <button
            onClick={() => { setIsEditing(false); setEditData({}); }}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleEditSave}
            disabled={isSaving}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {isSaving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      )}
    </div>

    {!isEditing ? (
      // Vista de solo lectura — igual que InfoSection actual
      <dl className="space-y-3">
        {([
          ["Nombre completo", person?.full_name],
          ["Fecha desaparición", fmt(person?.disappeared_at)],
          ["Última vez visto", fmt(person?.last_seen_at)],
          ["Edad al desaparecer", person?.age_at_disappearance ? `${person.age_at_disappearance} años` : "—"],
          ["Género", person?.gender ?? "—"],
          ["Última ubicación", person?.last_known_location ?? "—"],
          ["Descripción física", person?.physical_description ?? "—"],
          ["Contacto de reporte", person?.reporter_contact ?? "—"],
        ] as [string, string | undefined][]).map(([label, value]) => (
          <div key={label} className="flex flex-col sm:flex-row sm:gap-4 text-sm">
            <dt className="text-xs font-medium text-gray-400 sm:w-40 sm:shrink-0">{label}</dt>
            <dd className="text-gray-900">{value ?? "—"}</dd>
          </div>
        ))}
      </dl>
    ) : (
      // Formulario de edición
      <div className="space-y-3">
        {[
          { key: "full_name", label: "Nombre completo", type: "text", value: editData.full_name ?? person?.full_name ?? "" },
          { key: "age_at_disappearance", label: "Edad al desaparecer", type: "number", value: String(editData.age_at_disappearance ?? person?.age_at_disappearance ?? "") },
          { key: "gender", label: "Género", type: "text", value: editData.gender ?? person?.gender ?? "" },
          { key: "last_known_location", label: "Última ubicación", type: "text", value: editData.last_known_location ?? person?.last_known_location ?? "" },
          { key: "physical_description", label: "Descripción física", type: "text", value: editData.physical_description ?? person?.physical_description ?? "" },
          { key: "reporter_contact", label: "Contacto de reporte", type: "text", value: editData.reporter_contact ?? person?.reporter_contact ?? "" },
        ].map(({ key, label, type, value }) => (
          <div key={key}>
            <label className="mb-1 block text-[11px] font-medium text-slate-600">{label}</label>
            <input
              type={type}
              value={value}
              onChange={(e) => setEditData((prev) => ({
                ...prev,
                [key]: type === "number" ? Number(e.target.value) || undefined : e.target.value || undefined,
              }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        ))}
      </div>
    )}
  </div>
)}
```

IMPORTANTE: Si el archivo tiene un bloque condicional existente para familiar, reemplazarlo. Si no lo tiene, agregar este bloque en el render donde corresponde el familiar.

- [ ] **Paso 9: Verificar build frontend**

```bash
cd /home/wiz/aerofinder/frontend && npm run build 2>&1 | grep -E "error TS|✓ Compiled|Failed" | tail -5
```
Esperado: `✓ Compiled successfully`

- [ ] **Paso 10: Commit**

```bash
cd /home/wiz/aerofinder
git add backend/app/schemas/persons.py backend/app/routers/persons.py frontend/src/lib/api.ts frontend/src/app/dashboard/persons/[id]/page.tsx
git commit -m "feat: familiar puede editar datos básicos de su reporte desde /persons/[id]"
```

---

## Task 3: Validación de fotos — resolución mínima

**Archivo:** `frontend/src/components/ui/PhotoUpload.tsx`

**Problema:** Se valida tipo y tamaño pero no resolución. Una foto de 50x50px pasa la validación y llega al servidor.

**Fix:** En `addFiles`, después del check de tamaño, verificar resolución mínima 200×200px con `Image` API asíncrona. Como `addFiles` es síncrono actualmente, convertirlo a async.

- [ ] **Paso 1: Leer `frontend/src/components/ui/PhotoUpload.tsx` completo**

- [ ] **Paso 2: Agregar constante y helper de resolución**

Al inicio del archivo, después de las constantes existentes:

```typescript
const MIN_WIDTH  = 200;   // px mínimos de ancho
const MIN_HEIGHT = 200;   // px mínimos de alto

/** Retorna dimensiones de imagen via Promise */
function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload  = () => { URL.revokeObjectURL(url); resolve({ width: img.naturalWidth, height: img.naturalHeight }); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("No se pudo leer la imagen")); };
    img.src = url;
  });
}
```

- [ ] **Paso 3: Convertir `addFiles` a async con check de resolución**

Reemplazar la función `addFiles` actual por:

```typescript
  const addFiles = useCallback(
    async (files: FileList | File[]) => {
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
        // Check resolución mínima
        try {
          const { width, height } = await getImageDimensions(file);
          if (width < MIN_WIDTH || height < MIN_HEIGHT) {
            newPhotos.push({
              file,
              preview: "",
              status: "error",
              errorMessage: `Foto muy pequeña (${width}×${height}px). Mínimo ${MIN_WIDTH}×${MIN_HEIGHT}px.`,
            });
            continue;
          }
        } catch {
          newPhotos.push({
            file,
            preview: "",
            status: "error",
            errorMessage: "No se pudo leer la imagen.",
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
```

- [ ] **Paso 4: Ajustar handlers que llaman `addFiles` (ahora es async)**

Buscar `handleFileChange` y `handleDrop` que llaman `addFiles`. Deben usar `void addFiles(...)` para no bloquear el handler de evento:

```typescript
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      void addFiles(e.target.files);
    }
    e.target.value = "";
  };
```

```typescript
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (!disabled) void addFiles(e.dataTransfer.files);
  };
```

- [ ] **Paso 5: Verificar build**

```bash
cd /home/wiz/aerofinder/frontend && npm run build 2>&1 | grep -E "error TS|✓ Compiled|Failed" | tail -5
```

- [ ] **Paso 6: Commit**

```bash
cd /home/wiz/aerofinder
git add frontend/src/components/ui/PhotoUpload.tsx
git commit -m "feat: PhotoUpload valida resolución mínima 200x200px antes de aceptar"
```

---

## Task 4: Admin puede solicitar más fotos al familiar

**Flujo:**
1. Admin ve un caso en pending-review o persons/[id] sin fotos suficientes.
2. Presiona "Solicitar fotos" → llama `POST /persons/{id}/request-photos`.
3. Backend verifica que el usuario tiene rol admin/buscador/ayudante.
4. Backend encuentra el familiar vinculado (PersonRelative) y envía push notification.
5. Familiar recibe notificación "Se solicitaron más fotos para [nombre]" → toca → va a `/dashboard/persons/{id}`.
6. En la vista del familiar para ese caso, se muestra un banner "El equipo solicitó fotos adicionales".

**Implementación simplificada:** No se agrega tabla nueva. Se agrega columna `photos_requested_at` a `missing_persons` + push notification al familiar.

### Backend

- [ ] **Paso 1: Agregar migración Alembic para `photos_requested_at`**

Crear archivo `backend/migrations/versions/0010_add_photos_requested_at.py`:

```python
"""add photos_requested_at to missing_persons

Revision ID: 0010
Revises: 0009
Create Date: 2026-05-24
"""
from alembic import op
import sqlalchemy as sa

revision = '0010'
down_revision = '0009'
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.add_column(
        'missing_persons',
        sa.Column('photos_requested_at', sa.DateTime(timezone=True), nullable=True)
    )

def downgrade() -> None:
    op.drop_column('missing_persons', 'photos_requested_at')
```

- [ ] **Paso 2: Agregar `photos_requested_at` al modelo ORM**

En `backend/app/models/persons.py`, en la clase `MissingPerson`, agregar campo:

```python
    photos_requested_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
```

- [ ] **Paso 3: Agregar `photos_requested_at` en `PersonResponse` schema**

En `backend/app/schemas/persons.py`, clase `PersonResponse`:

```python
    photos_requested_at: Optional[datetime] = None
```

- [ ] **Paso 4: Agregar endpoint `POST /persons/{id}/request-photos`**

En `backend/app/routers/persons.py`, importar `datetime` si no está (verificar imports). Agregar después del endpoint `familiar_update_person`:

```python
from datetime import datetime, timezone

@router.post("/{person_id}/request-photos", status_code=status.HTTP_204_NO_CONTENT)
async def request_more_photos(
    person_id: uuid.UUID,
    current_user: CurrentUser = Depends(_approvers),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Admin o ayudante solicita más fotos al familiar. Envía push notification."""
    try:
        result = await db.execute(
            select(MissingPerson).where(MissingPerson.id == person_id)
        )
        person: MissingPerson | None = result.scalar_one_or_none()
    except Exception:
        logger.error("Error al buscar persona id=%s", person_id, exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

    if person is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Persona no encontrada")

    # Marcar timestamp de solicitud
    person.photos_requested_at = datetime.now(timezone.utc)

    # Buscar familiar vinculado y enviar push notification
    try:
        rel_result = await db.execute(
            select(PersonRelative).where(PersonRelative.missing_person_id == person_id)
        )
        relatives = rel_result.scalars().all()
    except Exception:
        logger.error("Error al buscar familiares persona_id=%s", person_id, exc_info=True)
        relatives = []

    # Enviar push a cada familiar vinculado
    from app.services.push_service import push_service
    for relative in relatives:
        try:
            await push_service.send_to_user(
                user_id=relative.user_id,
                title="Fotos adicionales solicitadas",
                body=f"El equipo de búsqueda solicita más fotos de {person.full_name}.",
                url=f"/dashboard/persons/{person_id}",
                db=db,
            )
        except Exception:
            logger.warning("No se pudo enviar push a user_id=%s", relative.user_id, exc_info=True)
```

- [ ] **Paso 5: Verificar que `push_service` tiene método `send_to_user`**

Buscar en `backend/app/services/push_service.py` si existe `send_to_user`. Si el método se llama diferente (ej: `send_notification`), ajustar la llamada en el Paso 4.

```bash
grep -n "async def send" backend/app/services/push_service.py | head -10
```

Adaptar la llamada según lo que exista.

- [ ] **Paso 6: Aplicar migración**

```bash
docker compose exec -T backend alembic upgrade head 2>&1 | tail -5
```

Si falla por ownership, aplicar manualmente:
```bash
docker compose exec -T postgres psql -U postgres -d aerofinder -c "ALTER TABLE missing_persons ADD COLUMN IF NOT EXISTS photos_requested_at TIMESTAMPTZ;"
docker compose exec -T backend alembic stamp 0010
```

### Frontend

- [ ] **Paso 7: Agregar `requestMorePhotos` en `frontend/src/lib/api.ts`**

En `personsApi` (después de `updateMyReport`):

```typescript
  async requestMorePhotos(id: string): Promise<void> {
    await api.post(`/persons/${id}/request-photos`);
  },
```

También actualizar el tipo `MissingPerson` en `frontend/src/lib/types.ts` para incluir el nuevo campo (si existe el tipo):

```typescript
  photos_requested_at?: string | null;
```

- [ ] **Paso 8: Agregar botón "Solicitar fotos" en `pending-review/page.tsx`**

En la tabla de casos, dentro de `<div className="flex flex-col gap-1.5">` junto a los botones existentes:

```tsx
<button
  onClick={() => handleRequestPhotos(person.id)}
  className="rounded-lg bg-blue-100 px-2.5 py-1 text-[10px] font-semibold text-blue-700 hover:bg-blue-200 transition-colors"
>
  📷 Solicitar fotos
</button>
```

Y agregar la función `handleRequestPhotos`:

```typescript
  const handleRequestPhotos = async (personId: string) => {
    try {
      await personsApi.requestMorePhotos(personId);
      setToastMessage("Solicitud de fotos enviada al familiar");
      setToastType("success");
      setShowToast(true);
    } catch (error) {
      console.error("Error requesting photos:", error);
      setToastMessage("Error al enviar solicitud");
      setToastType("error");
      setShowToast(true);
    }
  };
```

- [ ] **Paso 9: Agregar banner en `persons/[id]/page.tsx` para familiar**

En la sección del familiar (donde se muestra el caso), agregar banner si `person.photos_requested_at` existe:

```tsx
{role === "familiar" && person?.photos_requested_at && (
  <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
    <div className="flex gap-3">
      <svg className="h-5 w-5 text-amber-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
      <div>
        <p className="text-[13px] font-semibold text-amber-800">El equipo solicita más fotos</p>
        <p className="mt-0.5 text-[12px] text-amber-700">
          Por favor subí fotos adicionales claras y de buena calidad para mejorar la búsqueda.
        </p>
      </div>
    </div>
  </div>
)}
```

- [ ] **Paso 10: Verificar build**

```bash
cd /home/wiz/aerofinder/frontend && npm run build 2>&1 | grep -E "error TS|✓ Compiled|Failed" | tail -5
```

- [ ] **Paso 11: Commit**

```bash
cd /home/wiz/aerofinder
git add backend/migrations/versions/0010_add_photos_requested_at.py \
        backend/app/models/persons.py \
        backend/app/schemas/persons.py \
        backend/app/routers/persons.py \
        frontend/src/lib/api.ts \
        frontend/src/lib/types.ts \
        frontend/src/app/dashboard/admin/pending-review/page.tsx \
        frontend/src/app/dashboard/persons/[id]/page.tsx
git commit -m "feat: admin puede solicitar más fotos al familiar — push notification + banner en caso"
```

---

## Task 5: Admin mobile UI — proporciones correctas

**Problema:** La tabla en `pending-review/page.tsx` tiene 7 columnas y no tiene `overflow-x-auto`, rompiendo el layout en móvil.

- [ ] **Paso 1: Leer `pending-review/page.tsx` buscando el wrapper de la tabla**

- [ ] **Paso 2: Agregar `overflow-x-auto` y `min-w` a la tabla**

En `pending-review/page.tsx`, el contenedor de la tabla es:
```tsx
<div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
  <table className="w-full text-[12px]">
```

Reemplazar por:
```tsx
<div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
  <div className="overflow-x-auto">
    <table className="min-w-[640px] w-full text-[12px]">
```

Y cerrar el `div` extra antes del cierre actual del div externo. Verificar que el JSX cierre correctamente.

- [ ] **Paso 3: Verificar otros admin pages con tablas similares**

Revisar rápidamente si `frontend/src/app/dashboard/alerts/page.tsx`, `frontend/src/app/dashboard/detections/page.tsx`, o `frontend/src/app/dashboard/missions/page.tsx` tienen tablas sin `overflow-x-auto`. Aplicar el mismo patrón a las que lo necesiten.

Patrón a aplicar (wrapper + min-w):
```tsx
<div className="overflow-x-auto">
  <table className="min-w-[600px] w-full text-[12px]">
```

- [ ] **Paso 4: Verificar build**

```bash
cd /home/wiz/aerofinder/frontend && npm run build 2>&1 | grep -E "error TS|✓ Compiled|Failed" | tail -5
```

- [ ] **Paso 5: Commit**

```bash
cd /home/wiz/aerofinder
git add frontend/src/app/dashboard/admin/pending-review/page.tsx \
        frontend/src/app/dashboard/alerts/page.tsx \
        frontend/src/app/dashboard/detections/page.tsx \
        frontend/src/app/dashboard/missions/page.tsx
git commit -m "fix: overflow-x-auto en tablas admin para mobile — proporciones correctas"
```

---

## Verificación final

- [ ] Foto de perfil carga correctamente en admin y familiar (no localhost:9000)
- [ ] Familiar puede editar nombre, edad, descripción de su caso
- [ ] Subir foto pequeña (<200px) muestra error de resolución
- [ ] Botón "Solicitar fotos" en pending-review funciona y envía notificación
- [ ] Familiar ve banner "El equipo solicita más fotos" en su caso
- [ ] Tabla en admin/pending-review hace scroll horizontal en móvil sin romper layout

# Fix: Familiar no puede registrar casos — Error 500 interno

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corregir el error 500 que impide a usuarios con rol `familiar` registrar un caso de persona desaparecida via `POST /persons/report`.

**Architecture:**
El bug es una condición de carrera en las políticas RLS de PostgreSQL. SQLAlchemy usa `INSERT ... RETURNING` para obtener los campos generados por el servidor (`id`, `created_at`, `updated_at`). PostgreSQL evalúa la política SELECT (`missing_persons_select`) sobre las filas devueltas por `RETURNING`. En ese momento el familiar aún no está en `person_relatives` (esa inserción ocurre después del flush), por lo que la política SELECT falla y lanza `InsufficientPrivilegeError`. La solución es añadir `reported_by_user_id = fn_current_app_user_id()` a la política SELECT, permitiendo al reporter ver su propia fila recién insertada.

**Tech Stack:** PostgreSQL 16 RLS, Alembic, FastAPI, SQLAlchemy 2.0 async

---

## Diagnóstico completado

Antes de ejecutar las tareas, el bug ya está completamente entendido:

| Prueba | Resultado |
|--------|-----------|
| `INSERT INTO missing_persons` (sin RETURNING) como familiar con GUCs seteados | ✅ Funciona |
| `INSERT INTO missing_persons ... RETURNING id, created_at, updated_at` ídem | ❌ `new row violates row-level security policy for table "missing_persons"` |
| Mismo INSERT con `DISABLE ROW LEVEL SECURITY` | ✅ Funciona |
| Mismo INSERT con `BYPASSRLS` en el rol | ✅ Funciona |

**Causa raíz:** `RETURNING` en PostgreSQL evalúa la cláusula `USING` del SELECT policy sobre las filas devueltas. La política `missing_persons_select` exige que el usuario sea staff O esté en `person_relatives`. El familiar no está en `person_relatives` cuando se ejecuta el `INSERT...RETURNING`, por lo que RETURNING falla y arrastra al INSERT.

**Política actual (bloqueante):**
```sql
-- missing_persons_select (USING):
(fn_current_app_user_role() = ANY (ARRAY['admin', 'buscador', 'ayudante']))
OR (EXISTS (
    SELECT 1 FROM person_relatives pr
    WHERE pr.missing_person_id = missing_persons.id
      AND pr.user_id = fn_current_app_user_id()
))
```

**Política corregida:**
```sql
-- Añadir tercer caso: el propio reporter puede ver su fila
(fn_current_app_user_role() = ANY (ARRAY['admin', 'buscador', 'ayudante']))
OR (EXISTS (
    SELECT 1 FROM person_relatives pr
    WHERE pr.missing_person_id = missing_persons.id
      AND pr.user_id = fn_current_app_user_id()
))
OR (reported_by_user_id = fn_current_app_user_id())
```

---

## Archivos involucrados

| Archivo | Acción | Descripción |
|---------|--------|-------------|
| `backend/migrations/versions/0010_fix_rls_familiar_insert_returning.py` | Crear | Migración Alembic que actualiza la política `missing_persons_select` |
| `backend/app/routers/persons.py` | No cambia | El router está correcto; el bug es en la DB |

---

## Task 1: Crear migración Alembic para corregir la política RLS

**Files:**
- Create: `backend/migrations/versions/0010_fix_rls_familiar_insert_returning.py`

- [ ] **Step 1: Crear el archivo de migración**

```python
# backend/migrations/versions/0010_fix_rls_familiar_insert_returning.py
"""Fix política RLS missing_persons_select para permitir INSERT...RETURNING de familiar

La política SELECT se evalúa sobre las filas devueltas por INSERT...RETURNING.
Un familiar que reporta un caso aún no está en person_relatives en ese momento,
por lo que RETURNING falla con InsufficientPrivilegeError.
Se añade OR (reported_by_user_id = fn_current_app_user_id()) para que el
reporter pueda ver su propia fila recién insertada.

Revision ID: 0010
Revises: 0009
Create Date: 2026-05-24
"""

from alembic import op

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Eliminar la política existente y recrearla con la cláusula adicional
    op.execute("DROP POLICY IF EXISTS missing_persons_select ON missing_persons")
    op.execute("""
        CREATE POLICY missing_persons_select
            ON missing_persons
            FOR SELECT
            TO aerofinder_app
            USING (
                (fn_current_app_user_role() = ANY (ARRAY['admin'::text, 'buscador'::text, 'ayudante'::text]))
                OR (EXISTS (
                    SELECT 1
                    FROM person_relatives pr
                    WHERE pr.missing_person_id = missing_persons.id
                      AND pr.user_id = fn_current_app_user_id()
                ))
                OR (reported_by_user_id = fn_current_app_user_id())
            )
    """)


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS missing_persons_select ON missing_persons")
    op.execute("""
        CREATE POLICY missing_persons_select
            ON missing_persons
            FOR SELECT
            TO aerofinder_app
            USING (
                (fn_current_app_user_role() = ANY (ARRAY['admin'::text, 'buscador'::text, 'ayudante'::text]))
                OR (EXISTS (
                    SELECT 1
                    FROM person_relatives pr
                    WHERE pr.missing_person_id = missing_persons.id
                      AND pr.user_id = fn_current_app_user_id()
                ))
            )
    """)
```

- [ ] **Step 2: Verificar que la migración es syntácticamente válida**

Desde el container o localmente:
```bash
cd backend
alembic check
```

Esperado: `INFO  [alembic.runtime.migration] Context impl PostgreSQLImpl.` sin errores de syntax.

Si alembic no está disponible localmente, verificar que el archivo tiene sintaxis Python correcta:
```bash
python3 -c "import py_compile; py_compile.compile('backend/migrations/versions/0010_fix_rls_familiar_insert_returning.py'); print('OK')"
```

- [ ] **Step 3: Aplicar la migración en la DB**

> **Nota:** La DB está en alembic version 0008. La migración 0009 existe pero aún no fue aplicada. Aplicar ambas:

```bash
# Si el backend corre en Docker:
docker exec aerofinder_backend alembic upgrade head
```

Esperado:
```
INFO  [alembic.runtime.migration] Running upgrade 0008 -> 0009, Fix constraint missing_persons_closure_consistency
INFO  [alembic.runtime.migration] Running upgrade 0009 -> 0010, Fix política RLS missing_persons_select
```

> **Si la migración 0009 ya está aplicada manualmente** (el constraint ya existe en la DB), Alembic puede fallar al intentar ADD CONSTRAINT si ya existe. En ese caso:
> 1. Marcar 0009 como aplicada sin ejecutarla: `docker exec aerofinder_backend alembic stamp 0009`
> 2. Luego: `docker exec aerofinder_backend alembic upgrade head`

- [ ] **Step 4: Verificar la política en la DB**

```bash
docker exec aerofinder_postgres psql -U postgres -d aerofinder -c "
SELECT policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'missing_persons' AND policyname = 'missing_persons_select';"
```

Esperado — la cláusula `qual` debe contener las 3 condiciones OR incluyendo `reported_by_user_id`:
```
 policyname           | cmd    | qual
----------------------+--------+-----------------------------------------------------
 missing_persons_select | SELECT | ... OR (reported_by_user_id = fn_current_app_user_id())
```

- [ ] **Step 5: Commit**

```bash
git add backend/migrations/versions/0010_fix_rls_familiar_insert_returning.py
git commit -m "fix: RLS missing_persons_select para permitir INSERT...RETURNING de familiar

PostgreSQL evalúa la política SELECT sobre las filas devueltas por RETURNING.
Un familiar no está en person_relatives cuando ocurre el flush del INSERT,
causando que RETURNING falle. La nueva cláusula OR (reported_by_user_id =
fn_current_app_user_id()) permite al reporter ver su propia fila recién insertada."
```

---

## Task 2: Verificar que el bug está corregido

- [ ] **Step 1: Test directo en psql**

```bash
# Obtener el UUID del usuario testfamiliar
FAM_UUID=$(docker exec aerofinder_postgres psql -U aerofinder_app -d aerofinder -t -c \
  "SELECT id FROM users WHERE email = 'testfamiliar@test.com';" | tr -d ' \n')

docker exec -i aerofinder_postgres psql -U aerofinder_app -d aerofinder << PSQL
BEGIN;
SELECT set_config('aerofinder.current_user_id', '$FAM_UUID', true);
SELECT set_config('aerofinder.current_user_role', 'familiar', true);
INSERT INTO missing_persons (full_name, disappeared_at, status, source, reported_by_user_id)
VALUES ('Test RETURNING Fix', '2026-05-20', 'pending_review', 'familiar_app', '$FAM_UUID')
RETURNING id, created_at;
ROLLBACK;
PSQL
```

Esperado: `INSERT 0 1` con una fila devuelta (no error).

- [ ] **Step 2: Test end-to-end via API**

```bash
FAM_TOKEN=$(curl -s -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"testfamiliar@test.com","password":"Test1234"}' \  # pragma: allowlist secret
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

curl -s -X POST http://localhost:8000/persons/report \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $FAM_TOKEN" \
  -d '{
    "full_name": "Juan García Test",
    "disappeared_at": "2026-05-20",
    "last_known_location": "La Paz, Bolivia",
    "physical_description": "Hombre contextura media"
  }' | python3 -m json.tool
```

Esperado: respuesta 201 con el objeto `MissingPerson` completo (id, full_name, status="pending_review", etc.).

- [ ] **Step 3: Verificar que el caso queda en la DB con person_relatives**

```bash
docker exec aerofinder_postgres psql -U postgres -d aerofinder -c "
SELECT mp.full_name, mp.status, pr.user_id as familiar_id
FROM missing_persons mp
JOIN person_relatives pr ON pr.missing_person_id = mp.id
WHERE mp.full_name = 'Juan García Test';"
```

Esperado: una fila con `status = pending_review` y `familiar_id` = UUID del testfamiliar.

- [ ] **Step 4: Verificar que el familiar puede listar sus casos via API**

```bash
FAM_TOKEN=$(curl -s -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"testfamiliar@test.com","password":"Test1234"}' \  # pragma: allowlist secret
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

curl -s http://localhost:8000/persons/ \
  -H "Authorization: Bearer $FAM_TOKEN" | python3 -m json.tool
```

Esperado: array con el caso recién creado visible para el familiar.

- [ ] **Step 5: Verificar que staff puede ver y aprobar el caso**

```bash
ADMIN_TOKEN=$(curl -s -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@aerofinder.local","password":"AeroAdmin2024!"}' \  # pragma: allowlist secret
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# Listar personas pendientes como admin
curl -s "http://localhost:8000/persons/?status=pending_review" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | python3 -m json.tool
```

Esperado: el caso aparece en la lista con `status = pending_review`.

---

## Task 3: Limpiar datos de prueba

- [ ] **Step 1: Eliminar casos de prueba creados durante el debug**

```bash
docker exec aerofinder_postgres psql -U postgres -d aerofinder -c "
DELETE FROM missing_persons WHERE full_name IN (
    'Juan García Test',
    'Test Debug',
    'Test Local GUC',
    'Test Sin Trigger',
    'Test set_config local',
    'Test RETURNING Fix'
);"
```

Esperado: `DELETE N` (N = número de filas eliminadas).

---

## Notas de implementación

### Por qué no se modifica el backend (persons.py)

El endpoint `report_person_familiar` es correcto. El ORM usa `db.flush()` que internamente hace `INSERT ... RETURNING`. Cambiar esto requeriría:
- Escribir SQL raw para evitar RETURNING
- O reestructurar para hacer person_relatives primero (imposible sin el ID de missing_persons)

La solución DB es más limpia, semánticamente correcta, y no rompe nada.

### Implicaciones de seguridad de la nueva cláusula

`reported_by_user_id = fn_current_app_user_id()` significa: el usuario que reportó el caso puede verlo siempre, incluso sin estar en `person_relatives`. Esto es correcto porque:
- `reported_by_user_id` siempre se setea a `current_user.id` en el endpoint
- Ningún endpoint externo permite poner el ID de otro usuario en `reported_by_user_id`
- Después del report, el mismo endpoint inserta `person_relatives`, así que ambas condiciones aplican

### Relación con migración 0009

La migración 0009 (`fix_closure_consistency_constraint`) está sin aplicar (alembic en 0008) pero el constraint ya está corregido manualmente en la DB. La migración 0010 apunta a `down_revision = "0009"`. Si 0009 ya está aplicada manualmente, marcarla con `alembic stamp 0009` antes de `upgrade head`.

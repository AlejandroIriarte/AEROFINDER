# Super Admin Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introducir el rol `super_admin` con separación total de interfaces respecto a `admin`, con datos reales del backend conectados al frontend.

**Architecture:** Opción B — dashboards independientes. El backend agrega el enum value `super_admin` a PostgreSQL, nuevos endpoints en `/superadmin/*`, y restricción de endpoints críticos. El frontend tiene `/dashboard/superadmin/` como ruta nueva y `/dashboard/admin/` simplificado sin config técnica. Sidebar con grupos colapsables para ambos roles.

**Tech Stack:** FastAPI + SQLAlchemy async + Alembic · Next.js 14 App Router · httpx (para pings a MediaMTX) · redis.asyncio · Minio client · Tailwind CSS

---

## Mapa de archivos

### Backend — crear
- `backend/migrations/versions/0013_superadmin_role.py` — altera enum PG + inserta fila en roles
- `backend/app/routers/superadmin.py` — health, admins, sessions, hard-delete, soft-deleted

### Backend — modificar
- `backend/app/models/enums.py` — añadir `super_admin` a `RoleName`
- `backend/app/routers/users.py` — bloquear creación/cambio a rol admin solo a super_admin
- `backend/app/routers/audit_log.py` — cambiar guard a super_admin
- `backend/app/routers/system.py` — network-info y PATCH config → super_admin
- `backend/app/main.py` — registrar superadmin router

### Frontend — crear
- `frontend/src/components/layout/CollapsibleNavGroup.tsx` — grupo colapsable de nav
- `frontend/src/app/dashboard/superadmin/page.tsx` — dashboard super admin

### Frontend — modificar
- `frontend/src/lib/types.ts` — añadir `super_admin` a RoleName + tipos InfraHealth, AdminSession
- `frontend/src/lib/api.ts` — añadir `superadminApi` namespace
- `frontend/src/components/layout/Sidebar.tsx` — grupos colapsables + rutas super_admin
- `frontend/src/app/dashboard/layout.tsx` — breadcrumbs superadmin
- `frontend/src/app/dashboard/admin/page.tsx` — quitar sección infra/red/config
- `README.md` — actualizar referencias DJI Mini 2 + tabla de roles

---

## Task 1: Migración Alembic — add super_admin al enum PG y tabla roles

**Files:**
- Create: `backend/migrations/versions/0013_superadmin_role.py`

- [ ] **Crear el archivo de migración**

```python
"""add super_admin role

Revision ID: 0013
Revises: 0012
Create Date: 2026-05-24
"""
from alembic import op

revision = '0013'
down_revision = '0012'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ALTER TYPE no puede ejecutarse dentro de un bloque transaccional
    # en PostgreSQL < 12. En PG 16 (el de este proyecto) sí es seguro.
    op.execute("ALTER TYPE role_name ADD VALUE IF NOT EXISTS 'super_admin'")
    op.execute("""
        INSERT INTO roles (id, name, description, created_at)
        VALUES (gen_random_uuid(), 'super_admin',
                'Super administrador — control total del sistema e infraestructura',
                NOW())
        ON CONFLICT (name) DO NOTHING
    """)


def downgrade() -> None:
    # PostgreSQL no soporta DROP VALUE de un enum.
    # Solo eliminar la fila de roles; el valor del enum queda (inofensivo si no hay usuarios con ese rol).
    op.execute("DELETE FROM roles WHERE name = 'super_admin'")
```

- [ ] **Ejecutar y verificar**

```bash
cd backend
alembic upgrade 0013
# Esperado: "Running upgrade 0012 -> 0013, add super_admin role"
```

---

## Task 2: Backend — añadir super_admin al enum Python

**Files:**
- Modify: `backend/app/models/enums.py`

- [ ] **Añadir valor al enum RoleName (línea 22)**

Cambiar:
```python
class RoleName(str, enum.Enum):
    admin    = "admin"
    buscador = "buscador"
    ayudante = "ayudante"
    familiar = "familiar"
```

Por:
```python
class RoleName(str, enum.Enum):
    super_admin = "super_admin"
    admin       = "admin"
    buscador    = "buscador"
    ayudante    = "ayudante"
    familiar    = "familiar"
```

- [ ] **Verificar que el backend arranca sin errores**

```bash
cd backend
python -c "from app.models.enums import RoleName; print(list(RoleName))"
# Esperado: [<RoleName.super_admin: 'super_admin'>, <RoleName.admin: 'admin'>, ...]
```

---

## Task 3: Backend — nuevo router superadmin.py

**Files:**
- Create: `backend/app/routers/superadmin.py`

- [ ] **Crear el archivo completo**

```python
# =============================================================================
# AEROFINDER Backend — Router: Super Admin
# Solo accesible por super_admin.
# Endpoints: health, admins, sessions, hard delete, soft-deleted
# =============================================================================

import logging
import time
import uuid
from typing import Optional

import httpx
import redis.asyncio as aioredis
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.deps import CurrentUser, require_role
from app.db.session import get_db
from app.models.auth import Role, User, UserSession
from app.models.enums import RoleName
from app.schemas.users import UserResponse
from app.services.minio_service import minio_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/superadmin", tags=["superadmin"])

_super_admin = require_role(RoleName.super_admin)


# ── Schemas de respuesta ──────────────────────────────────────────────────────

class ServiceHealth(BaseModel):
    status: str          # "ok" | "error" | "stale" | "unknown"
    latency_ms: Optional[float] = None
    detail: Optional[str] = None


class InfraHealth(BaseModel):
    redis:     ServiceHealth
    minio:     ServiceHealth
    mediamtx:  ServiceHealth
    ai_worker: ServiceHealth


class AdminSessionResponse(BaseModel):
    id: str
    user_id: str
    user_name: str
    user_email: str
    user_role: str
    ip_address: str
    user_agent: Optional[str]
    issued_at: str
    expires_at: str

    class Config:
        from_attributes = True


class SoftDeletedUser(BaseModel):
    id: str
    email: str
    full_name: str
    role: str
    deactivated_at: Optional[str]


# ── Helpers ───────────────────────────────────────────────────────────────────

def _build_user_response(user: User, role_name: RoleName) -> UserResponse:
    from app.schemas.users import UserResponse as UR
    return UR(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        phone=user.phone,
        role=role_name,
        is_active=user.is_active,
        created_at=user.created_at,
        last_login_at=user.last_login_at,
    )


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/health", response_model=InfraHealth)
async def get_infra_health(
    _: CurrentUser = Depends(_super_admin),
) -> InfraHealth:
    """Estado en tiempo real de Redis, MinIO, MediaMTX y AI Worker."""

    # Redis
    redis_health: ServiceHealth
    try:
        r = aioredis.from_url(settings.redis_url, decode_responses=True)
        t0 = time.monotonic()
        await r.ping()
        latency = round((time.monotonic() - t0) * 1000, 1)
        # Contar streams conocidos
        stream_names = [
            settings.redis_stream_detections,
            settings.redis_stream_telemetry,
            settings.redis_stream_notifications,
        ]
        active = 0
        for s in stream_names:
            try:
                await r.xlen(s)
                active += 1
            except Exception:
                pass
        await r.aclose()
        redis_health = ServiceHealth(
            status="ok",
            latency_ms=latency,
            detail=f"{active} streams activos",
        )
    except Exception as exc:
        logger.error("Redis health check fallido", exc_info=True)
        redis_health = ServiceHealth(status="error", detail=str(exc)[:120])

    # MinIO (cliente síncrono — rápido)
    minio_health: ServiceHealth
    try:
        t0 = time.monotonic()
        exists = minio_service._client.bucket_exists(settings.minio_bucket_photos)
        latency = round((time.monotonic() - t0) * 1000, 1)
        minio_health = ServiceHealth(
            status="ok",
            latency_ms=latency,
            detail=f"bucket {'encontrado' if exists else 'no encontrado'}",
        )
    except Exception as exc:
        logger.error("MinIO health check fallido", exc_info=True)
        minio_health = ServiceHealth(status="error", detail=str(exc)[:120])

    # MediaMTX
    mediamtx_health: ServiceHealth
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            t0 = time.monotonic()
            resp = await client.get(f"{settings.mediamtx_api_url}/v3/paths/list")
            latency = round((time.monotonic() - t0) * 1000, 1)
            paths = resp.json().get("items", [])
            mediamtx_health = ServiceHealth(
                status="ok",
                latency_ms=latency,
                detail=f"{len(paths)} streams RTMP activos",
            )
    except Exception as exc:
        logger.error("MediaMTX health check fallido", exc_info=True)
        mediamtx_health = ServiceHealth(status="error", detail=str(exc)[:120])

    # AI Worker — vía heartbeat key en Redis
    ai_health: ServiceHealth
    try:
        r = aioredis.from_url(settings.redis_url, decode_responses=True)
        heartbeat = await r.get("aerofinder:ai_worker:heartbeat")
        await r.aclose()
        if heartbeat:
            age_s = round(time.time() - float(heartbeat), 0)
            ai_health = ServiceHealth(
                status="ok" if age_s < 30 else "stale",
                detail=f"último heartbeat hace {int(age_s)} s",
            )
        else:
            ai_health = ServiceHealth(status="unknown", detail="sin heartbeat registrado")
    except Exception as exc:
        logger.error("AI Worker health check fallido", exc_info=True)
        ai_health = ServiceHealth(status="error", detail=str(exc)[:120])

    return InfraHealth(
        redis=redis_health,
        minio=minio_health,
        mediamtx=mediamtx_health,
        ai_worker=ai_health,
    )


@router.get("/admins", response_model=list[UserResponse])
async def list_admins(
    _: CurrentUser = Depends(_super_admin),
    db: AsyncSession = Depends(get_db),
) -> list[UserResponse]:
    """Lista todos los usuarios con rol admin."""
    try:
        result = await db.execute(
            select(User, Role)
            .join(Role, User.role_id == Role.id)
            .where(Role.name == RoleName.admin)
            .order_by(User.created_at.desc())
        )
        return [_build_user_response(u, r.name) for u, r in result.all()]
    except Exception:
        logger.error("Error al listar admins", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")


@router.get("/sessions", response_model=list[AdminSessionResponse])
async def list_active_sessions(
    _: CurrentUser = Depends(_super_admin),
    db: AsyncSession = Depends(get_db),
) -> list[AdminSessionResponse]:
    """Lista todas las sesiones activas del sistema (no revocadas y no expiradas)."""
    import datetime
    try:
        now = datetime.datetime.now(datetime.timezone.utc)
        result = await db.execute(
            select(UserSession, User, Role)
            .join(User, UserSession.user_id == User.id)
            .join(Role, User.role_id == Role.id)
            .where(
                UserSession.is_revoked.is_(False),
                UserSession.expires_at > now,
            )
            .order_by(UserSession.issued_at.desc())
            .limit(50)
        )
        rows = result.all()
    except Exception:
        logger.error("Error al listar sesiones activas", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

    return [
        AdminSessionResponse(
            id=str(sess.id),
            user_id=str(user.id),
            user_name=user.full_name,
            user_email=user.email,
            user_role=role.name.value,
            ip_address=str(sess.ip_address),
            user_agent=sess.user_agent,
            issued_at=sess.issued_at.isoformat(),
            expires_at=sess.expires_at.isoformat(),
        )
        for sess, user, role in rows
    ]


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_session(
    session_id: uuid.UUID,
    current_user: CurrentUser = Depends(_super_admin),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Revoca una sesión activa. No puede revocar la propia sesión."""
    if session_id == current_user.session_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No puedes revocar tu propia sesión activa",
        )
    try:
        result = await db.execute(
            select(UserSession).where(UserSession.id == session_id)
        )
        sess: UserSession | None = result.scalar_one_or_none()
    except Exception:
        logger.error("Error al buscar sesión id=%s", session_id, exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

    if sess is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sesión no encontrada")

    import datetime
    sess.is_revoked = True
    sess.revoked_at = datetime.datetime.now(datetime.timezone.utc)


@router.get("/soft-deleted", response_model=list[SoftDeletedUser])
async def list_soft_deleted(
    _: CurrentUser = Depends(_super_admin),
    db: AsyncSession = Depends(get_db),
) -> list[SoftDeletedUser]:
    """Lista usuarios desactivados (is_active=False) candidatos a borrado definitivo."""
    try:
        result = await db.execute(
            select(User, Role)
            .join(Role, User.role_id == Role.id)
            .where(User.is_active.is_(False))
            .order_by(User.updated_at.desc())
        )
        rows = result.all()
    except Exception:
        logger.error("Error al listar usuarios soft-deleted", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

    return [
        SoftDeletedUser(
            id=str(u.id),
            email=u.email,
            full_name=u.full_name,
            role=r.name.value,
            deactivated_at=u.updated_at.isoformat() if u.updated_at else None,
        )
        for u, r in rows
    ]


class HardDeleteBody(BaseModel):
    confirm: bool


@router.delete("/users/{user_id}/hard", status_code=status.HTTP_204_NO_CONTENT)
async def hard_delete_user(
    user_id: uuid.UUID,
    body: HardDeleteBody,
    _: CurrentUser = Depends(_super_admin),
    db: AsyncSession = Depends(get_db),
) -> None:
    """
    Borrado definitivo de usuario inactivo.
    Requiere body {"confirm": true}.
    Solo funciona sobre usuarios con is_active=False.
    """
    if not body.confirm:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Se requiere confirm=true para borrado definitivo",
        )
    try:
        result = await db.execute(select(User).where(User.id == user_id))
        user: User | None = result.scalar_one_or_none()
    except Exception:
        logger.error("Error al buscar usuario id=%s para hard delete", user_id, exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")

    if user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Solo se pueden borrar definitivamente usuarios desactivados",
        )

    try:
        await db.delete(user)
    except Exception:
        logger.error("Error al hacer hard delete usuario id=%s", user_id, exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")
```

- [ ] **Verificar sintaxis**

```bash
cd backend
python -c "from app.routers.superadmin import router; print('OK', router.prefix)"
# Esperado: OK /superadmin
```

---

## Task 4: Backend — Restringir endpoints existentes + registrar router

**Files:**
- Modify: `backend/app/routers/users.py`
- Modify: `backend/app/routers/audit_log.py`
- Modify: `backend/app/routers/system.py`
- Modify: `backend/app/main.py`

- [ ] **users.py — añadir guard super_admin y restringir creación/cambio a rol admin**

En `backend/app/routers/users.py`, línea 24, después de `_admin = require_role(RoleName.admin)` añadir:

```python
_super_admin = require_role(RoleName.super_admin)
_admin_or_super = require_role(RoleName.admin, RoleName.super_admin)
```

Cambiar la dependencia de `list_roles` para que ambos roles puedan llamarla:
```python
# línea 28-29
@router.get("/roles", response_model=list[dict], tags=["roles"])
async def list_roles(
    _: CurrentUser = Depends(_admin_or_super),
    db: AsyncSession = Depends(get_db),
```

Cambiar `list_users` y `get_user` y `deactivate_user` para usar `_admin_or_super`:
```python
# GET / — ambos pueden listar usuarios
_: CurrentUser = Depends(_admin_or_super),

# GET /{user_id}
current_user: CurrentUser = Depends(_admin_or_super),

# DELETE /{user_id}
current_user: CurrentUser = Depends(_admin_or_super),
```

Cambiar `create_user` para restringir la creación de admins solo a super_admin:
```python
@router.post("/", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    body: UserCreate,
    current_user: CurrentUser = Depends(_admin_or_super),
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    """Crea un nuevo usuario. Admin puede crear buscador/ayudante/familiar. Super admin puede crear cualquier rol."""
    # Verificar que el role_id existe
    try:
        role_result = await db.execute(select(Role).where(Role.id == body.role_id))
        role: Role | None = role_result.scalar_one_or_none()
    except Exception:
        logger.error("Error al verificar role_id=%s", body.role_id, exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

    if role is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rol no encontrado")

    # Solo super_admin puede crear admins o super_admins
    restricted_roles = {RoleName.admin, RoleName.super_admin}
    if role.name in restricted_roles and current_user.role != RoleName.super_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo el super admin puede crear cuentas con rol admin o super_admin",
        )

    # (resto del código sin cambios desde línea "Verificar email único")
```

Cambiar `update_user` para restringir cambio de rol a admin/super_admin:
```python
@router.patch("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: uuid.UUID,
    body: UserUpdate,
    current_user: CurrentUser = Depends(_admin_or_super),
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    # ... (código existente de búsqueda de usuario sin cambios) ...

    if body.role_id is not None:
        try:
            new_role_result = await db.execute(select(Role).where(Role.id == body.role_id))
            new_role: Role | None = new_role_result.scalar_one_or_none()
        except Exception:
            logger.error("Error al verificar nuevo role_id=%s", body.role_id, exc_info=True)
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

        if new_role is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rol no encontrado")

        # Solo super_admin puede asignar roles admin/super_admin
        restricted_roles = {RoleName.admin, RoleName.super_admin}
        if new_role.name in restricted_roles and current_user.role != RoleName.super_admin:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Solo el super admin puede asignar roles de admin",
            )

        user.role_id = body.role_id
        current_role = new_role

    return _build_user_response(user, current_role.name)
```

- [ ] **audit_log.py — cambiar guard a super_admin**

En `backend/app/routers/audit_log.py`, línea 22, cambiar:
```python
_admin = require_role(RoleName.admin)
```
Por:
```python
_super_admin = require_role(RoleName.super_admin)
```

En el endpoint `list_audit_log`, línea 29, cambiar:
```python
    _: object = Depends(_admin),
```
Por:
```python
    _: object = Depends(_super_admin),
```

- [ ] **system.py — network-info y PATCH config → super_admin**

En `backend/app/routers/system.py`, línea 24, después de `_admin = require_role(RoleName.admin)` añadir:
```python
_super_admin = require_role(RoleName.super_admin)
_admin_or_super = require_role(RoleName.admin, RoleName.super_admin)
```

Cambiar `get_network_info`:
```python
@router.get("/network-info")
async def get_network_info(
    _: CurrentUser = Depends(_super_admin),
) -> dict:
```

Cambiar `update_config`:
```python
@router.patch("/{config_key}", response_model=ConfigResponse)
async def update_config(
    config_key: str,
    body: ConfigUpdate,
    current_user: CurrentUser = Depends(_super_admin),
    db: AsyncSession = Depends(get_db),
) -> ConfigResponse:
```

- [ ] **main.py — importar y registrar superadmin router**

En `backend/app/main.py`, añadir a los imports (línea 29, después de `ws as ws_router`):
```python
    superadmin as superadmin_router,
```

En la sección de routers (línea 97, antes de `ws_router`):
```python
app.include_router(superadmin_router.router)
```

- [ ] **Verificar que el backend arranca**

```bash
cd backend
python -m uvicorn app.main:app --reload --port 8000 &
sleep 3
curl -s http://localhost:8000/docs | grep -c "superadmin"
# Esperado: número > 0
kill %1
```

---

## Task 5: Frontend — types.ts + api.ts

**Files:**
- Modify: `frontend/src/lib/types.ts`
- Modify: `frontend/src/lib/api.ts`

- [ ] **types.ts — añadir super_admin a RoleName y nuevos tipos**

Línea 8, cambiar:
```typescript
export type RoleName = "admin" | "buscador" | "ayudante" | "familiar";
```
Por:
```typescript
export type RoleName = "super_admin" | "admin" | "buscador" | "ayudante" | "familiar";
```

Añadir al final del archivo (antes del último comentario si existe):
```typescript
// ── Super Admin ───────────────────────────────────────────────────────────────

export interface ServiceHealth {
  status: "ok" | "error" | "stale" | "unknown";
  latency_ms?: number | null;
  detail?: string | null;
}

export interface InfraHealth {
  redis:     ServiceHealth;
  minio:     ServiceHealth;
  mediamtx:  ServiceHealth;
  ai_worker: ServiceHealth;
}

export interface AdminSession {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  user_role: string;
  ip_address: string;
  user_agent: string | null;
  issued_at: string;
  expires_at: string;
}

export interface SoftDeletedUser {
  id: string;
  email: string;
  full_name: string;
  role: string;
  deactivated_at: string | null;
}
```

- [ ] **api.ts — añadir superadminApi namespace**

Al final de `frontend/src/lib/api.ts`, antes del `export default api`, añadir:

```typescript
// ── API de super admin ────────────────────────────────────────────────────────

export const superadminApi = {
  async health(): Promise<InfraHealth> {
    const { data } = await api.get<InfraHealth>("/superadmin/health");
    return data;
  },

  async listAdmins(): Promise<User[]> {
    const { data } = await api.get<User[]>("/superadmin/admins");
    return data;
  },

  async listSessions(): Promise<AdminSession[]> {
    const { data } = await api.get<AdminSession[]>("/superadmin/sessions");
    return data;
  },

  async revokeSession(sessionId: string): Promise<void> {
    await api.delete(`/superadmin/sessions/${sessionId}`);
  },

  async listSoftDeleted(): Promise<SoftDeletedUser[]> {
    const { data } = await api.get<SoftDeletedUser[]>("/superadmin/soft-deleted");
    return data;
  },

  async hardDeleteUser(userId: string): Promise<void> {
    await api.delete(`/superadmin/users/${userId}/hard`, {
      data: { confirm: true },
    });
  },
};
```

Añadir los imports de los nuevos tipos al inicio donde están los demás imports de types:
```typescript
  InfraHealth,
  AdminSession,
  SoftDeletedUser,
```

---

## Task 6: Frontend — CollapsibleNavGroup component

**Files:**
- Create: `frontend/src/components/layout/CollapsibleNavGroup.tsx`

- [ ] **Crear el componente**

```typescript
// =============================================================================
// AEROFINDER — CollapsibleNavGroup
// Grupo colapsable de nav para el sidebar. Estado persiste en localStorage.
// =============================================================================

"use client";

import { useState, useEffect } from "react";

interface CollapsibleNavGroupProps {
  label: string;
  storageKey: string;  // clave única para persistir estado en localStorage
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export function CollapsibleNavGroup({
  label,
  storageKey,
  defaultOpen = true,
  children,
}: CollapsibleNavGroupProps) {
  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return defaultOpen;
    const stored = localStorage.getItem(`aerofinder_nav_${storageKey}`);
    return stored !== null ? stored === "1" : defaultOpen;
  });

  const toggle = () => {
    setOpen((prev) => {
      const next = !prev;
      localStorage.setItem(`aerofinder_nav_${storageKey}`, next ? "1" : "0");
      return next;
    });
  };

  return (
    <div className="mb-0.5">
      <button
        onClick={toggle}
        className="flex w-full items-center gap-1 px-2 py-1.5 hover:opacity-80 transition-opacity"
      >
        <span className="flex-1 text-left text-[9px] font-semibold uppercase tracking-widest text-slate-400">
          {label}
        </span>
        <svg
          viewBox="0 0 24 24"
          className={`h-3 w-3 text-slate-300 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <polyline points="9 6 15 12 9 18" />
        </svg>
      </button>
      {open && (
        <div className="flex flex-col gap-0.5 pb-1">
          {children}
        </div>
      )}
    </div>
  );
}
```

---

## Task 7: Frontend — Sidebar actualizado con CollapsibleNavGroup

**Files:**
- Modify: `frontend/src/components/layout/Sidebar.tsx`

- [ ] **Actualizar Sidebar.tsx completo**

Reemplazar el contenido de `frontend/src/components/layout/Sidebar.tsx` con:

```typescript
// =============================================================================
// AEROFINDER — Sidebar colapsable con grupos de navegación por rol
// Grupos: según rol (super_admin / admin / operacional / familiar)
// =============================================================================

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import { CollapsibleNavGroup } from "@/components/layout/CollapsibleNavGroup";
import type { RoleName } from "@/lib/types";

export interface SidebarBadges {
  missions:   number;
  alerts:     number;
  detections: number;
  review:     number;
}

interface SidebarProps {
  isOpen:  boolean;
  badges:  SidebarBadges;
}

// ── Íconos SVG (idénticos a versión anterior) ─────────────────────────────────
const Icons = {
  home: <svg viewBox="0 0 24 24" className="h-[17px] w-[17px] stroke-current fill-none flex-shrink-0" strokeWidth={1.8}><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  missions: <svg viewBox="0 0 24 24" className="h-[17px] w-[17px] stroke-current fill-none flex-shrink-0" strokeWidth={1.8}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>,
  persons: <svg viewBox="0 0 24 24" className="h-[17px] w-[17px] stroke-current fill-none flex-shrink-0" strokeWidth={1.8}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  detections: <svg viewBox="0 0 24 24" className="h-[17px] w-[17px] stroke-current fill-none flex-shrink-0" strokeWidth={1.8}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
  drones: <svg viewBox="0 0 24 24" className="h-[17px] w-[17px] stroke-current fill-none flex-shrink-0" strokeWidth={1.8}><circle cx="12" cy="12" r="3"/><path d="M5 5l3 3M19 5l-3 3M5 19l3-3M19 19l-3-3"/><circle cx="5" cy="5" r="2"/><circle cx="19" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="19" r="2"/></svg>,
  alerts: <svg viewBox="0 0 24 24" className="h-[17px] w-[17px] stroke-current fill-none flex-shrink-0" strokeWidth={1.8}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  review: <svg viewBox="0 0 24 24" className="h-[17px] w-[17px] stroke-current fill-none flex-shrink-0" strokeWidth={1.8}><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>,
  users: <svg viewBox="0 0 24 24" className="h-[17px] w-[17px] stroke-current fill-none flex-shrink-0" strokeWidth={1.8}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  config: <svg viewBox="0 0 24 24" className="h-[17px] w-[17px] stroke-current fill-none flex-shrink-0" strokeWidth={1.8}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  logs: <svg viewBox="0 0 24 24" className="h-[17px] w-[17px] stroke-current fill-none flex-shrink-0" strokeWidth={1.8}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  report: <svg viewBox="0 0 24 24" className="h-[17px] w-[17px] stroke-current fill-none flex-shrink-0" strokeWidth={1.8}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  bell: <svg viewBox="0 0 24 24" className="h-[17px] w-[17px] stroke-current fill-none flex-shrink-0" strokeWidth={1.8}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
  logout: <svg viewBox="0 0 24 24" className="h-[17px] w-[17px] stroke-current fill-none flex-shrink-0" strokeWidth={1.8}><path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>,
  connect: <svg viewBox="0 0 24 24" className="h-[17px] w-[17px] stroke-current fill-none flex-shrink-0" strokeWidth={1.8}><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h.01M14 17h.01M17 14h.01M17 17h.01M20 14h.01M20 17h.01M20 20h.01M17 20h.01M14 20h.01"/></svg>,
  // iconos extras para super_admin
  shield: <svg viewBox="0 0 24 24" className="h-[17px] w-[17px] stroke-current fill-none flex-shrink-0" strokeWidth={1.8}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  health: <svg viewBox="0 0 24 24" className="h-[17px] w-[17px] stroke-current fill-none flex-shrink-0" strokeWidth={1.8}><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>,
  lock: <svg viewBox="0 0 24 24" className="h-[17px] w-[17px] stroke-current fill-none flex-shrink-0" strokeWidth={1.8}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>,
  trash: <svg viewBox="0 0 24 24" className="h-[17px] w-[17px] stroke-current fill-none flex-shrink-0" strokeWidth={1.8}><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>,
  network: <svg viewBox="0 0 24 24" className="h-[17px] w-[17px] stroke-current fill-none flex-shrink-0" strokeWidth={1.8}><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>,
  cpu: <svg viewBox="0 0 24 24" className="h-[17px] w-[17px] stroke-current fill-none flex-shrink-0" strokeWidth={1.8}><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="15" x2="23" y2="15"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="15" x2="4" y2="15"/></svg>,
};

function NavPill({ count, color }: { count: number; color: "red" | "blue" | "amber" }) {
  if (!count) return null;
  const cls = {
    red:   "bg-red-100 text-red-700",
    blue:  "bg-blue-100 text-blue-700",
    amber: "bg-amber-100 text-amber-700",
  }[color];
  return (
    <span className={`ml-auto rounded-full px-1.5 py-px text-[9px] font-bold ${cls}`}>
      {count > 99 ? "99+" : count}
    </span>
  );
}

function NavLink({
  href, label, icon, isOpen, isActive, badge, badgeColor,
}: {
  href: string; label: string; icon: React.ReactNode;
  isOpen: boolean; isActive: boolean;
  badge?: number | null; badgeColor?: "red" | "blue" | "amber";
}) {
  return (
    <Link
      href={href}
      title={isOpen ? undefined : label}
      className={`flex h-9 items-center gap-2.5 rounded-lg px-2.5 transition-colors ${
        isActive ? "bg-blue-50 text-blue-600" : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
      } ${isOpen ? "w-full" : "w-9 justify-center"}`}
    >
      {icon}
      {isOpen && (
        <>
          <span className="text-[13px] font-medium truncate">{label}</span>
          {badge != null && badge > 0 && <NavPill count={badge} color={badgeColor ?? "amber"} />}
        </>
      )}
    </Link>
  );
}

export function Sidebar({ isOpen, badges }: SidebarProps) {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();

  if (!user) return null;
  const role = user.role as RoleName;
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <aside className={`
      flex h-screen flex-col border-r border-slate-200 bg-white transition-all duration-200
      overflow-hidden flex-shrink-0 fixed top-0 left-0 z-50 md:relative md:translate-x-0
      ${isOpen ? "translate-x-0 w-[216px]" : "-translate-x-full md:translate-x-0 w-[216px] md:w-[52px]"}
    `}>
      <nav className="flex flex-1 flex-col overflow-y-auto p-2 gap-0">

        {/* ── SUPER ADMIN ─────────────────────────────────────── */}
        {role === "super_admin" && (
          <>
            {isOpen && (
              <CollapsibleNavGroup label="Sistema" storageKey="sa_sistema" defaultOpen={true}>
                <NavLink href="/dashboard/superadmin" label="Resumen" icon={Icons.home} isOpen={isOpen} isActive={isActive("/dashboard/superadmin") && pathname === "/dashboard/superadmin"} />
                <NavLink href="/dashboard/superadmin/infrastructure" label="Infraestructura" icon={Icons.health} isOpen={isOpen} isActive={isActive("/dashboard/superadmin/infrastructure")} />
              </CollapsibleNavGroup>
            )}
            {!isOpen && (
              <>
                <NavLink href="/dashboard/superadmin" label="Resumen" icon={Icons.home} isOpen={false} isActive={pathname === "/dashboard/superadmin"} />
                <NavLink href="/dashboard/superadmin/infrastructure" label="Infraestructura" icon={Icons.health} isOpen={false} isActive={isActive("/dashboard/superadmin/infrastructure")} />
              </>
            )}

            {isOpen && (
              <CollapsibleNavGroup label="Accesos críticos" storageKey="sa_accesos" defaultOpen={true}>
                <NavLink href="/dashboard/superadmin/admins" label="Gestión de admins" icon={Icons.users} isOpen={isOpen} isActive={isActive("/dashboard/superadmin/admins")} />
                <NavLink href="/dashboard/superadmin/sessions" label="Sesiones activas" icon={Icons.lock} isOpen={isOpen} isActive={isActive("/dashboard/superadmin/sessions")} />
              </CollapsibleNavGroup>
            )}
            {!isOpen && (
              <>
                <NavLink href="/dashboard/superadmin/admins" label="Gestión de admins" icon={Icons.users} isOpen={false} isActive={isActive("/dashboard/superadmin/admins")} />
                <NavLink href="/dashboard/superadmin/sessions" label="Sesiones activas" icon={Icons.lock} isOpen={false} isActive={isActive("/dashboard/superadmin/sessions")} />
              </>
            )}

            {isOpen && (
              <CollapsibleNavGroup label="Seguridad" storageKey="sa_seguridad" defaultOpen={true}>
                <NavLink href="/dashboard/superadmin/audit" label="Auditoría profunda" icon={Icons.logs} isOpen={isOpen} isActive={isActive("/dashboard/superadmin/audit")} />
                <NavLink href="/dashboard/superadmin/hard-delete" label="Borrados definitivos" icon={Icons.trash} isOpen={isOpen} isActive={isActive("/dashboard/superadmin/hard-delete")} />
              </CollapsibleNavGroup>
            )}
            {!isOpen && (
              <>
                <NavLink href="/dashboard/superadmin/audit" label="Auditoría" icon={Icons.logs} isOpen={false} isActive={isActive("/dashboard/superadmin/audit")} />
                <NavLink href="/dashboard/superadmin/hard-delete" label="Borrados" icon={Icons.trash} isOpen={false} isActive={isActive("/dashboard/superadmin/hard-delete")} />
              </>
            )}

            {isOpen && (
              <CollapsibleNavGroup label="Configuración" storageKey="sa_config" defaultOpen={false}>
                <NavLink href="/dashboard/superadmin/config" label="Parámetros del sistema" icon={Icons.config} isOpen={isOpen} isActive={isActive("/dashboard/superadmin/config")} />
                <NavLink href="/dashboard/superadmin/network" label="Red y URLs de drones" icon={Icons.network} isOpen={isOpen} isActive={isActive("/dashboard/superadmin/network")} />
              </CollapsibleNavGroup>
            )}
            {!isOpen && (
              <>
                <NavLink href="/dashboard/superadmin/config" label="Parámetros" icon={Icons.config} isOpen={false} isActive={isActive("/dashboard/superadmin/config")} />
                <NavLink href="/dashboard/superadmin/network" label="Red" icon={Icons.network} isOpen={false} isActive={isActive("/dashboard/superadmin/network")} />
              </>
            )}
          </>
        )}

        {/* ── ADMIN ────────────────────────────────────────────── */}
        {role === "admin" && (
          <>
            {isOpen && (
              <CollapsibleNavGroup label="Operaciones" storageKey="adm_ops" defaultOpen={true}>
                <NavLink href="/dashboard/admin" label="Panel" icon={Icons.home} isOpen={isOpen} isActive={pathname === "/dashboard/admin"} />
                <NavLink href="/dashboard/missions" label="Misiones" icon={Icons.missions} isOpen={isOpen} isActive={isActive("/dashboard/missions")} badge={badges.missions} badgeColor="blue" />
                <NavLink href="/dashboard/detections" label="Detecciones" icon={Icons.detections} isOpen={isOpen} isActive={isActive("/dashboard/detections")} badge={badges.detections} badgeColor="amber" />
                <NavLink href="/dashboard/alerts" label="Alertas" icon={Icons.alerts} isOpen={isOpen} isActive={isActive("/dashboard/alerts")} badge={badges.alerts} badgeColor="red" />
                <NavLink href="/dashboard/admin/pending-review" label="Revisión pendiente" icon={Icons.review} isOpen={isOpen} isActive={isActive("/dashboard/admin/pending-review")} badge={badges.review} badgeColor="amber" />
              </CollapsibleNavGroup>
            )}
            {!isOpen && (
              <>
                <NavLink href="/dashboard/admin" label="Panel" icon={Icons.home} isOpen={false} isActive={pathname === "/dashboard/admin"} />
                <NavLink href="/dashboard/missions" label="Misiones" icon={Icons.missions} isOpen={false} isActive={isActive("/dashboard/missions")} badge={badges.missions} badgeColor="blue" />
                <NavLink href="/dashboard/detections" label="Detecciones" icon={Icons.detections} isOpen={false} isActive={isActive("/dashboard/detections")} badge={badges.detections} badgeColor="amber" />
                <NavLink href="/dashboard/alerts" label="Alertas" icon={Icons.alerts} isOpen={false} isActive={isActive("/dashboard/alerts")} badge={badges.alerts} badgeColor="red" />
                <NavLink href="/dashboard/admin/pending-review" label="Revisión" icon={Icons.review} isOpen={false} isActive={isActive("/dashboard/admin/pending-review")} badge={badges.review} badgeColor="amber" />
              </>
            )}

            {isOpen && (
              <CollapsibleNavGroup label="Recursos" storageKey="adm_recursos" defaultOpen={true}>
                <NavLink href="/dashboard/drones" label="Drones" icon={Icons.drones} isOpen={isOpen} isActive={isActive("/dashboard/drones")} />
                <NavLink href="/dashboard/users" label="Personal de campo" icon={Icons.users} isOpen={isOpen} isActive={isActive("/dashboard/users")} />
                <NavLink href="/dashboard/persons" label="Personas buscadas" icon={Icons.persons} isOpen={isOpen} isActive={isActive("/dashboard/persons")} />
              </CollapsibleNavGroup>
            )}
            {!isOpen && (
              <>
                <NavLink href="/dashboard/drones" label="Drones" icon={Icons.drones} isOpen={false} isActive={isActive("/dashboard/drones")} />
                <NavLink href="/dashboard/users" label="Personal" icon={Icons.users} isOpen={false} isActive={isActive("/dashboard/users")} />
                <NavLink href="/dashboard/persons" label="Personas" icon={Icons.persons} isOpen={false} isActive={isActive("/dashboard/persons")} />
              </>
            )}
          </>
        )}

        {/* ── BUSCADOR / AYUDANTE ───────────────────────────────── */}
        {(role === "buscador" || role === "ayudante") && (
          <>
            {isOpen ? (
              <CollapsibleNavGroup label="Operaciones" storageKey="ops" defaultOpen={true}>
                <NavLink href="/dashboard" label="Dashboard" icon={Icons.home} isOpen={isOpen} isActive={pathname === "/dashboard"} />
                <NavLink href="/dashboard/missions" label="Misiones" icon={Icons.missions} isOpen={isOpen} isActive={isActive("/dashboard/missions")} badge={badges.missions} badgeColor="blue" />
                <NavLink href="/dashboard/detections" label="Detecciones" icon={Icons.detections} isOpen={isOpen} isActive={isActive("/dashboard/detections")} badge={badges.detections} badgeColor="amber" />
                <NavLink href="/dashboard/alerts" label="Alertas" icon={Icons.alerts} isOpen={isOpen} isActive={isActive("/dashboard/alerts")} badge={badges.alerts} badgeColor="red" />
                {role === "ayudante" && <NavLink href="/dashboard/admin/pending-review" label="Revisión" icon={Icons.review} isOpen={isOpen} isActive={isActive("/dashboard/admin/pending-review")} badge={badges.review} badgeColor="amber" />}
                {role === "buscador" && <NavLink href="/dashboard/persons" label="Personas" icon={Icons.persons} isOpen={isOpen} isActive={isActive("/dashboard/persons")} />}
                {role === "buscador" && <NavLink href="/dashboard/drones" label="Drones" icon={Icons.drones} isOpen={isOpen} isActive={isActive("/dashboard/drones")} />}
              </CollapsibleNavGroup>
            ) : (
              <>
                <NavLink href="/dashboard" label="Dashboard" icon={Icons.home} isOpen={false} isActive={pathname === "/dashboard"} />
                <NavLink href="/dashboard/missions" label="Misiones" icon={Icons.missions} isOpen={false} isActive={isActive("/dashboard/missions")} badge={badges.missions} badgeColor="blue" />
                <NavLink href="/dashboard/detections" label="Detecciones" icon={Icons.detections} isOpen={false} isActive={isActive("/dashboard/detections")} badge={badges.detections} badgeColor="amber" />
                <NavLink href="/dashboard/alerts" label="Alertas" icon={Icons.alerts} isOpen={false} isActive={isActive("/dashboard/alerts")} badge={badges.alerts} badgeColor="red" />
              </>
            )}
          </>
        )}

        {/* ── FAMILIAR ─────────────────────────────────────────── */}
        {role === "familiar" && (
          <>
            <NavLink href="/dashboard" label="Dashboard" icon={Icons.home} isOpen={isOpen} isActive={pathname === "/dashboard"} />
            <NavLink href="/dashboard/familiar" label="Mis casos" icon={Icons.persons} isOpen={isOpen} isActive={isActive("/dashboard/familiar") && !pathname.includes("report")} />
            <NavLink href="/dashboard/familiar/report" label="Reportar" icon={Icons.report} isOpen={isOpen} isActive={isActive("/dashboard/familiar/report")} />
            <NavLink href="/dashboard/notifications" label="Notificaciones" icon={Icons.bell} isOpen={isOpen} isActive={isActive("/dashboard/notifications")} />
          </>
        )}

        <div className="flex-1" />

        {/* Conectar — buscador/admin */}
        {(role === "buscador" || role === "admin") && (
          <NavLink href="/connect" label="Conectar" icon={Icons.connect} isOpen={isOpen} isActive={pathname === "/connect"} />
        )}

        <button
          onClick={() => logout()}
          title={isOpen ? undefined : "Cerrar sesión"}
          className={`flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-red-500 hover:bg-red-50 transition-colors ${isOpen ? "w-full" : "w-9 justify-center"}`}
        >
          {Icons.logout}
          {isOpen && <span className="text-[13px] font-medium">Cerrar sesión</span>}
        </button>
      </nav>
    </aside>
  );
}
```

---

## Task 8: Frontend — Dashboard layout breadcrumbs + super admin dashboard page

**Files:**
- Modify: `frontend/src/app/dashboard/layout.tsx`
- Create: `frontend/src/app/dashboard/superadmin/page.tsx`

- [ ] **layout.tsx — añadir rutas superadmin al mapa de breadcrumbs**

En `frontend/src/app/dashboard/layout.tsx`, añadir al objeto `BREADCRUMB_EXACT` (después de `/dashboard/logs`):

```typescript
  "/dashboard/superadmin":                "Sistema",
  "/dashboard/superadmin/infrastructure": "Infraestructura",
  "/dashboard/superadmin/admins":         "Gestión de admins",
  "/dashboard/superadmin/sessions":       "Sesiones activas",
  "/dashboard/superadmin/audit":          "Auditoría profunda",
  "/dashboard/superadmin/hard-delete":    "Borrados definitivos",
  "/dashboard/superadmin/config":         "Parámetros del sistema",
  "/dashboard/superadmin/network":        "Red y URLs de drones",
```

- [ ] **Crear /dashboard/superadmin/page.tsx**

```typescript
// =============================================================================
// AEROFINDER — Super Admin Dashboard
// Resumen del sistema: infra, sesiones, admins, auditoría, config, hard-delete
// Datos reales del backend vía superadminApi, systemApi, usersApi
// =============================================================================

"use client";

import { useCallback, useEffect, useState } from "react";
import { RoleGuard } from "@/components/ui/RoleGuard";
import { superadminApi, systemApi } from "@/lib/api";
import api from "@/lib/api";
import type {
  InfraHealth,
  AdminSession,
  SoftDeletedUser,
  SystemConfig,
  User,
  AuditLog,
} from "@/lib/types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    ok:      "bg-green-400",
    stale:   "bg-amber-400",
    error:   "bg-red-400",
    unknown: "bg-slate-300",
  };
  return (
    <span className={`inline-block h-2 w-2 rounded-full flex-shrink-0 ${colors[status] ?? "bg-slate-300"}`} />
  );
}

function RelativeTime({ iso }: { iso: string }) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  const hrs  = Math.floor(mins / 60);
  if (mins < 1) return <span>ahora</span>;
  if (mins < 60) return <span>hace {mins} min</span>;
  if (hrs < 24)  return <span>hace {hrs} h</span>;
  return <span>hace {Math.floor(hrs / 24)} d</span>;
}

// ── Sección: Infra health ─────────────────────────────────────────────────────

function InfraSection({ health }: { health: InfraHealth }) {
  const services = [
    { key: "redis",     label: "Redis",     data: health.redis },
    { key: "minio",     label: "MinIO",     data: health.minio },
    { key: "mediamtx",  label: "MediaMTX",  data: health.mediamtx },
    { key: "ai_worker", label: "AI Worker", data: health.ai_worker },
  ];

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-700">Salud de infraestructura</h2>
        <span className="text-xs text-gray-400">
          {services.filter(s => s.data.status === "ok").length} / {services.length} servicios OK
        </span>
      </div>
      <div className="grid grid-cols-2 divide-x divide-y divide-gray-100">
        {services.map(({ key, label, data }) => (
          <div key={key} className="flex items-center gap-3 px-4 py-3">
            <StatusDot status={data.status} />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-gray-800">{label}</p>
              <p className="text-[11px] text-gray-400 truncate">{data.detail ?? "—"}</p>
            </div>
            {data.latency_ms != null && (
              <span className="text-[11px] font-medium text-gray-500 tabular-nums whitespace-nowrap">
                {data.latency_ms} ms
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Sección: Sesiones activas ─────────────────────────────────────────────────

function SessionsSection({
  sessions,
  onRevoke,
  revoking,
}: {
  sessions: AdminSession[];
  onRevoke: (id: string) => void;
  revoking: string | null;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-700">Sesiones activas</h2>
        <span className="text-xs text-gray-400">{sessions.length} sesiones</span>
      </div>
      {sessions.length === 0 ? (
        <p className="px-4 py-3 text-xs text-gray-400">Sin sesiones activas.</p>
      ) : (
        <div className="divide-y divide-gray-50">
          {sessions.map((s) => (
            <div key={s.id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-gray-800 truncate">
                  {s.user_name}
                  <span className={`ml-1.5 rounded px-1.5 py-px text-[9px] font-semibold ${
                    s.user_role === "admin" ? "bg-blue-50 text-blue-600" :
                    s.user_role === "super_admin" ? "bg-violet-50 text-violet-600" :
                    "bg-gray-100 text-gray-500"
                  }`}>{s.user_role}</span>
                </p>
                <p className="text-[10px] text-gray-400 truncate">
                  {s.ip_address} · {s.user_agent?.split("/")[0] ?? "desconocido"} · emitida <RelativeTime iso={s.issued_at} />
                </p>
              </div>
              <button
                disabled={revoking === s.id}
                onClick={() => onRevoke(s.id)}
                className="shrink-0 rounded border border-red-200 bg-white px-2.5 py-1 text-[10px] font-medium text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40"
              >
                {revoking === s.id ? "Revocando…" : "Revocar"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Sección: Gestión de admins ────────────────────────────────────────────────

function AdminsSection({ admins, onToggle, toggling }: {
  admins: User[];
  onToggle: (id: string, active: boolean) => void;
  toggling: string | null;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-700">Administradores</h2>
        <span className="text-xs text-gray-400">{admins.filter(a => a.is_active).length} activos</span>
      </div>
      {admins.length === 0 ? (
        <p className="px-4 py-3 text-xs text-gray-400">Sin administradores registrados.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="bg-gray-50 text-[10px] uppercase tracking-wide text-gray-400">
                <th className="px-4 py-2 text-left font-semibold">Nombre</th>
                <th className="px-4 py-2 text-left font-semibold">Email</th>
                <th className="px-4 py-2 text-left font-semibold">Último acceso</th>
                <th className="px-4 py-2 text-left font-semibold">Estado</th>
                <th className="px-4 py-2 text-left font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {admins.map((a) => (
                <tr key={a.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ${
                        a.is_active ? "bg-blue-100 text-blue-600" : "bg-gray-100 text-gray-400"
                      }`}>
                        {a.full_name.charAt(0).toUpperCase()}
                      </div>
                      <span className={`font-medium ${a.is_active ? "text-gray-900" : "text-gray-400"}`}>
                        {a.full_name}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-gray-500">{a.email}</td>
                  <td className="px-4 py-2.5 text-gray-400">
                    {a.last_login_at ? <RelativeTime iso={a.last_login_at} /> : "nunca"}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      a.is_active
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-500"
                    }`}>
                      {a.is_active ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex gap-1">
                      <button
                        disabled={toggling === a.id}
                        onClick={() => onToggle(a.id, !a.is_active)}
                        className={`rounded border px-2 py-0.5 text-[10px] font-medium transition-colors disabled:opacity-40 ${
                          a.is_active
                            ? "border-red-200 text-red-600 hover:bg-red-50"
                            : "border-green-200 text-green-700 hover:bg-green-50"
                        }`}
                      >
                        {toggling === a.id
                          ? "…"
                          : a.is_active ? "Desactivar" : "Reactivar"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Sección: Auditoría reciente ───────────────────────────────────────────────

function AuditSection({ logs }: { logs: AuditLog[] }) {
  const opColor: Record<string, string> = {
    INSERT: "bg-green-400",
    UPDATE: "bg-blue-400",
    DELETE: "bg-red-400",
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-700">Auditoría reciente</h2>
        <span className="text-xs text-gray-400">{logs.length} eventos</span>
      </div>
      {logs.length === 0 ? (
        <p className="px-4 py-3 text-xs text-gray-400">Sin eventos de auditoría.</p>
      ) : (
        <div className="divide-y divide-gray-50">
          {logs.slice(0, 8).map((log) => (
            <div key={log.id} className="flex items-start gap-3 px-4 py-2.5">
              <div className={`mt-1.5 h-1.5 w-1.5 rounded-full flex-shrink-0 ${opColor[log.operation] ?? "bg-gray-300"}`} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-800">
                  <span className={`mr-1 rounded px-1 py-px text-[9px] font-semibold ${
                    log.operation === "DELETE" ? "bg-red-50 text-red-600" :
                    log.operation === "INSERT" ? "bg-green-50 text-green-700" :
                    "bg-blue-50 text-blue-600"
                  }`}>{log.operation}</span>
                  {log.table_name}
                </p>
                <p className="text-[10px] text-gray-400">
                  ID: {log.record_id.slice(0, 8)}… · <RelativeTime iso={log.changed_at} />
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Sección: Parámetros del sistema ──────────────────────────────────────────

function ConfigSection({ configs }: { configs: SystemConfig[] }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-700">Parámetros del sistema</h2>
      </div>
      <div className="divide-y divide-gray-50">
        {configs.slice(0, 6).map((c) => (
          <div key={c.config_key} className="flex items-center gap-3 px-4 py-2.5">
            <div className="flex-1 min-w-0">
              <p className="font-mono text-[11px] text-violet-700">{c.config_key}</p>
              {c.description && <p className="text-[10px] text-gray-400">{c.description}</p>}
            </div>
            <span className="font-mono text-[11px] text-gray-700 tabular-nums">{c.value_text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Sección: Borrado definitivo ───────────────────────────────────────────────

function HardDeleteSection({ items, onDelete, deleting }: {
  items: SoftDeletedUser[];
  onDelete: (id: string, name: string) => void;
  deleting: string | null;
}) {
  return (
    <div className="rounded-xl border border-red-200 bg-white overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-4 py-3 border-b border-red-100 bg-red-50">
        <h2 className="text-sm font-semibold text-red-700">Zona de borrado definitivo</h2>
        <span className="text-[10px] text-red-400">Solo super_admin · irreversible</span>
      </div>
      {items.length === 0 ? (
        <p className="px-4 py-3 text-xs text-gray-400">Sin usuarios desactivados para purgar.</p>
      ) : (
        <div className="divide-y divide-red-50">
          {items.map((u) => (
            <div key={u.id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-gray-800">{u.full_name}</p>
                <p className="text-[10px] text-gray-400">
                  {u.email} · {u.role}
                  {u.deactivated_at && <> · desactivado <RelativeTime iso={u.deactivated_at} /></>}
                </p>
              </div>
              <button
                disabled={deleting === u.id}
                onClick={() => onDelete(u.id, u.full_name)}
                className="shrink-0 rounded border border-red-300 bg-white px-2.5 py-1 text-[10px] font-semibold text-red-700 hover:bg-red-50 transition-colors disabled:opacity-40"
              >
                {deleting === u.id ? "Borrando…" : "Borrar definitivamente"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function SuperAdminPage() {
  const [health,     setHealth]     = useState<InfraHealth | null>(null);
  const [sessions,   setSessions]   = useState<AdminSession[]>([]);
  const [admins,     setAdmins]     = useState<User[]>([]);
  const [auditLogs,  setAuditLogs]  = useState<AuditLog[]>([]);
  const [configs,    setConfigs]    = useState<SystemConfig[]>([]);
  const [softDeleted,setSoftDeleted]= useState<SoftDeletedUser[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [loadError,  setLoadError]  = useState(false);
  const [revoking,   setRevoking]   = useState<string | null>(null);
  const [toggling,   setToggling]   = useState<string | null>(null);
  const [deleting,   setDeleting]   = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const loadAll = useCallback(async () => {
    setLoadError(false);
    try {
      const [h, sess, adms, audit, cfg, soft] = await Promise.all([
        superadminApi.health(),
        superadminApi.listSessions(),
        superadminApi.listAdmins(),
        api.get<AuditLog[]>("/audit-log/", { params: { limit: 20 } }).then(r => r.data),
        api.get<SystemConfig[]>("/config/").then(r => r.data),
        superadminApi.listSoftDeleted(),
      ]);
      setHealth(h);
      setSessions(sess);
      setAdmins(adms);
      setAuditLogs(audit);
      setConfigs(cfg);
      setSoftDeleted(soft);
      setLastUpdate(new Date());
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleRevokeSession = async (sessionId: string) => {
    setRevoking(sessionId);
    try {
      await superadminApi.revokeSession(sessionId);
      setSessions(prev => prev.filter(s => s.id !== sessionId));
    } catch {
      // silencioso — el estado de error se puede agregar si se necesita
    } finally {
      setRevoking(null);
    }
  };

  const handleToggleAdmin = async (userId: string, newActive: boolean) => {
    setToggling(userId);
    try {
      await api.patch(`/users/${userId}`, { is_active: newActive });
      setAdmins(prev => prev.map(a => a.id === userId ? { ...a, is_active: newActive } : a));
    } catch {
      // silencioso
    } finally {
      setToggling(null);
    }
  };

  const handleHardDelete = async (userId: string, name: string) => {
    if (!confirm(`¿Borrar DEFINITIVAMENTE a "${name}"? Esta acción es irreversible.`)) return;
    setDeleting(userId);
    try {
      await superadminApi.hardDeleteUser(userId);
      setSoftDeleted(prev => prev.filter(u => u.id !== userId));
    } catch {
      // silencioso
    } finally {
      setDeleting(null);
    }
  };

  const healthOk      = health ? Object.values(health).filter(s => s.status === "ok").length : 0;
  const healthTotal   = 4;
  const activeSessions = sessions.length;
  const activeAdmins  = admins.filter(a => a.is_active).length;
  const criticalLogs  = auditLogs.filter(l => l.operation === "DELETE").length;

  return (
    <RoleGuard allowedRoles={["super_admin"]}>
      <div className="p-6 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Resumen del sistema</h1>
            {lastUpdate && (
              <p className="text-xs text-gray-400 mt-0.5">
                Actualizado a las {lastUpdate.toLocaleTimeString("es-BO")}
              </p>
            )}
          </div>
          <button
            onClick={loadAll}
            disabled={loading}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            {loading ? "Cargando…" : "Actualizar"}
          </button>
        </div>

        {loadError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            Error al cargar datos. Verifica la conexión e intenta actualizar.
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: "Admins activos",    value: activeAdmins,   color: "text-blue-600"  },
            { label: "Servicios OK",      value: `${healthOk}/${healthTotal}`, color: healthOk === healthTotal ? "text-green-600" : "text-amber-600" },
            { label: "Sesiones activas",  value: activeSessions, color: "text-slate-700" },
            { label: "Eliminaciones hoy", value: criticalLogs,   color: criticalLogs > 0 ? "text-red-600" : "text-slate-700" },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm text-center">
              <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
              <p className="mt-1 text-xs text-gray-500">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Infra + Sessions */}
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          {health && <InfraSection health={health} />}
          <SessionsSection sessions={sessions} onRevoke={handleRevokeSession} revoking={revoking} />
        </div>

        {/* Admins (full width) */}
        <AdminsSection admins={admins} onToggle={handleToggleAdmin} toggling={toggling} />

        {/* Audit + Config */}
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <AuditSection logs={auditLogs} />
          <ConfigSection configs={configs} />
        </div>

        {/* Hard delete zone */}
        <HardDeleteSection items={softDeleted} onDelete={handleHardDelete} deleting={deleting} />

      </div>
    </RoleGuard>
  );
}
```

---

## Task 9: Frontend — Admin page simplificada

**Files:**
- Modify: `frontend/src/app/dashboard/admin/page.tsx`

- [ ] **Eliminar secciones que pertenecen al super admin**

En `frontend/src/app/dashboard/admin/page.tsx`:

1. Eliminar el import de `systemApi`:
```typescript
// Cambiar línea 10:
import { missionsApi, dronesApi } from "@/lib/api";
// (era: import { missionsApi, dronesApi, systemApi } from "@/lib/api";)
```

2. Eliminar el import de `NetworkInfo` del tipo:
```typescript
import type { Mission, Drone } from "@/lib/types";
// (era: import type { Mission, Drone, NetworkInfo } from "@/lib/types";)
```

3. En `AdminPage`, eliminar el estado y la carga de `networkInfo`:
```typescript
// Eliminar:
// const [networkInfo, setNetworkInfo] = useState<NetworkInfo | null>(null);

// En loadData, cambiar:
const [m, d] = await Promise.all([
  missionsApi.list(),
  dronesApi.list(),
]);
setMissions(m);
setDrones(d);
// (era Promise.all con systemApi.getNetworkInfo())
```

4. Eliminar el componente `NetworkInfoSection` completo (líneas 43-101) y su uso en el JSX:
```typescript
// Eliminar la línea:
// {networkInfo && <NetworkInfoSection info={networkInfo} />}
```

5. Eliminar del JSX los links a herramientas que van a super_admin (`/dashboard/config`):
```typescript
// En la sección "Herramientas", dejar solo:
<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
  <Link
    href="/dashboard/admin/pending-review"
    className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 hover:bg-slate-50 transition-colors shadow-sm"
  >
    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100">
      <svg viewBox="0 0 24 24" className="h-5 w-5 stroke-amber-600 fill-none" strokeWidth={1.8}>
        <path d="M9 11l3 3L22 4"/>
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
      </svg>
    </div>
    <div>
      <p className="text-[13px] font-semibold text-slate-800">Revisión pendiente</p>
      <p className="text-[11px] text-slate-500">Detecciones sin confirmar</p>
    </div>
  </Link>

  <Link
    href="/dashboard/users"
    className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 hover:bg-slate-50 transition-colors shadow-sm"
  >
    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-100">
      <svg viewBox="0 0 24 24" className="h-5 w-5 stroke-green-600 fill-none" strokeWidth={1.8}>
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
        <circle cx="12" cy="7" r="4"/>
      </svg>
    </div>
    <div>
      <p className="text-[13px] font-semibold text-slate-800">Personal de campo</p>
      <p className="text-[11px] text-slate-500">Gestión de buscadores y ayudantes</p>
    </div>
  </Link>
</div>
```

---

## Task 10: README update

**Files:**
- Modify: `README.md`

- [ ] **Actualizar tabla de roles — añadir super_admin**

Cambiar la sección `## Roles de usuario`:
```markdown
## Roles de usuario

| Rol | Acceso |
|-----|--------|
| `super_admin` | Control total del sistema: gestión de admins, infraestructura, auditoría profunda, borrados definitivos |
| `admin` | Operaciones: misiones, personal de campo, drones, detecciones, aprobaciones |
| `buscador` | Operaciones: misiones, detecciones con GPS, video en vivo |
| `ayudante` | Revisión de casos y detecciones (sin GPS) |
| `familiar` | Sus casos, notificaciones y PWA de reporte |
```

- [ ] **Actualizar tabla de stack — quitar referencia a DJI Mini 2**

Cambiar en la tabla `## Stack`:
```markdown
| Dron | Cualquier dron con soporte RTMP (DJI Fly, DJI Go, Autel Explorer, RTMP genérico) |
```

- [ ] **Actualizar descripción del proyecto (primer párrafo)**

Cambiar:
```markdown
Un operador lanza un dron DJI Mini 2. El dron transmite video RTMP en vivo al servidor.
```
Por:
```markdown
Un operador lanza un dron compatible con RTMP (DJI Fly, DJI Go, Autel Explorer u otra app con soporte RTMP). El dron transmite video RTMP en vivo al servidor.
```

- [ ] **Actualizar diagrama de arquitectura**

Cambiar la línea:
```
DJI Mini 2 ──RTMP──▶ MediaMTX ...
```
Por:
```
Dron (RTMP) ──RTMP──▶ MediaMTX ...
```

- [ ] **Commit README y spec**

```bash
cd /home/wiz/aerofinder
git add README.md docs/superpowers/specs/2026-05-24-superadmin-dashboard-design.md docs/superpowers/plans/2026-05-24-superadmin-dashboard.md
git commit -m "docs: super admin dashboard spec + plan + README (soporte RTMP genérico)"
```

---

## Orden de ejecución recomendado

1. Task 1 (migración DB) — prerequisito de todo
2. Task 2 (enum Python) — prerequisito del backend
3. Task 3 (router superadmin) — nuevo código aislado, sin riesgo
4. Task 4 (restringir endpoints + registrar router) — modifica código existente
5. Task 5 (types + api.ts frontend) — sin dependencias de UI
6. Task 6 (CollapsibleNavGroup) — componente aislado
7. Task 7 (Sidebar actualizado) — usa CollapsibleNavGroup
8. Task 8 (layout.tsx + superadmin page) — usa superadminApi
9. Task 9 (admin page simplificada) — eliminar código
10. Task 10 (README) — puramente documental

# Real-Time Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Página `/dashboard/map` que muestra en tiempo real las posiciones GPS de drones (vía celular del piloto), rescatistas, ayudantes y familiares autorizados, usando el WebSocket de misión existente con un nuevo message type `user_location`.

**Architecture:** Clientes envían `{"type":"user_location","lat":X,"lng":Y,"accuracy_m":Z}` por el WS de misión existente (`/ws/missions/{id}`). El backend enriquece con datos del usuario y hace broadcast a la room. Ayudantes y familiares solo pueden acceder al mapa si el admin los agrega a la tabla `mission_map_access`. Página Layout C: chips filtrables arriba + Leaflet full-width.

**Tech Stack:** FastAPI + SQLAlchemy 2.0 async + Alembic, Next.js 14 App Router, TypeScript, Leaflet.js, `useWebSocket` hook existente, `navigator.geolocation.watchPosition`

---

## File Structure

**Backend — new:**
- `backend/app/models/map_access.py` — ORM model `MissionMapAccess`
- `backend/app/schemas/map_access.py` — Pydantic schemas (Grant/Revoke/List)
- `backend/app/routers/map_access.py` — REST endpoints grant/revoke/list
- `backend/migrations/versions/0016_add_mission_map_access.py` — Alembic migration

**Backend — modified:**
- `backend/app/routers/ws.py` — extend `ws_mission` loop to parse JSON `user_location`
- `backend/app/main.py` — include map_access router

**Frontend — new:**
- `frontend/src/hooks/useLocationSharing.ts` — watchPosition + send via WS + receive others' positions
- `frontend/src/app/dashboard/map/page.tsx` — página `/dashboard/map`
- `frontend/src/components/map/UserMarker.tsx` — marcador Leaflet para cada persona

**Frontend — modified:**
- `frontend/src/lib/types.ts` — añadir `MapAccessGrant`, `UserLocationMessage`
- `frontend/src/lib/api.ts` — añadir `mapAccessApi`
- `frontend/src/components/layout/Sidebar.tsx` — añadir link "Mapa en tiempo real"

---

### Task 1: Backend — Modelo ORM + Migración Alembic

**Files:**
- Create: `backend/app/models/map_access.py`
- Create: `backend/migrations/versions/0016_add_mission_map_access.py`

- [ ] **Step 1: Crear modelo ORM**

```python
# backend/app/models/map_access.py
# =============================================================================
# AEROFINDER Backend — Modelo ORM: Acceso de usuarios al mapa de misión
# Tabla: mission_map_access
# admin concede acceso permanente (por misión) a ayudantes y familiares
# =============================================================================

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class MissionMapAccess(Base):
    """
    Concede a un usuario (ayudante o familiar) acceso al mapa de una misión.
    UNIQUE (mission_id, user_id) previene duplicados.
    """
    __tablename__ = "mission_map_access"
    __table_args__ = (
        UniqueConstraint("mission_id", "user_id", name="uq_map_access_mission_user"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
    )
    mission_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("missions.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    granted_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    granted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("NOW()"),
    )
```

- [ ] **Step 2: Crear migración Alembic**

```python
# backend/migrations/versions/0016_add_mission_map_access.py
"""add mission_map_access table

Revision ID: 0016
Revises: 0015
Create Date: 2026-06-15
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0016"
down_revision = "0015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "mission_map_access",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "mission_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("missions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "granted_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "granted_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.UniqueConstraint("mission_id", "user_id", name="uq_map_access_mission_user"),
    )
    op.create_index("ix_map_access_mission_id", "mission_map_access", ["mission_id"])
    op.create_index("ix_map_access_user_id", "mission_map_access", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_map_access_user_id", table_name="mission_map_access")
    op.drop_index("ix_map_access_mission_id", table_name="mission_map_access")
    op.drop_table("mission_map_access")
```

- [ ] **Step 3: Registrar modelo en `backend/app/db/base.py`**

Abrir `backend/app/db/base.py` y añadir el import del nuevo modelo al final de los imports de modelos (donde están los otros `from app.models.X import Y`):

```python
from app.models.map_access import MissionMapAccess  # noqa: F401
```

- [ ] **Step 4: Aplicar migración dentro del contenedor**

```bash
docker compose exec backend alembic upgrade head
```

Salida esperada: `Running upgrade 0015 -> 0016, add mission_map_access table`

- [ ] **Step 5: Verificar tabla creada**

```bash
docker compose exec db psql -U aerofinder_app -d aerofinder -c "\d mission_map_access"
```

Salida esperada: tabla con columnas `id, mission_id, user_id, granted_by, granted_at` y constraint `uq_map_access_mission_user`.

- [ ] **Step 6: Commit**

```bash
git add backend/app/models/map_access.py backend/migrations/versions/0016_add_mission_map_access.py backend/app/db/base.py
git commit -m "feat: add mission_map_access model and migration 0016"
```

---

### Task 2: Backend — Router REST para gestión de acceso al mapa

**Files:**
- Create: `backend/app/schemas/map_access.py`
- Create: `backend/app/routers/map_access.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: Crear schemas Pydantic**

```python
# backend/app/schemas/map_access.py
# =============================================================================
# AEROFINDER Backend — Schemas: Acceso al mapa de misión
# =============================================================================

import uuid
from datetime import datetime

from pydantic import BaseModel


class MapAccessGrant(BaseModel):
    """Respuesta al consultar o conceder acceso."""
    id: uuid.UUID
    mission_id: uuid.UUID
    user_id: uuid.UUID
    granted_by: uuid.UUID | None
    granted_at: datetime
    # Campos expandidos del usuario autorizado
    user_full_name: str
    user_role: str

    model_config = {"from_attributes": True}


class MapAccessGrantRequest(BaseModel):
    """Body para conceder acceso: solo se necesita el user_id."""
    user_id: uuid.UUID
```

- [ ] **Step 2: Crear router**

```python
# backend/app/routers/map_access.py
# =============================================================================
# AEROFINDER Backend — Router: Acceso de usuarios al mapa de misión
#
# Endpoints:
#   GET  /missions/{mission_id}/map-access      — lista quién tiene acceso
#   POST /missions/{mission_id}/map-access      — concede acceso (admin/buscador)
#   DELETE /missions/{mission_id}/map-access/{user_id} — revoca acceso (admin/buscador)
# =============================================================================

import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.auth import User
from app.models.map_access import MissionMapAccess
from app.models.missions import Mission
from app.routers.auth import get_current_user
from app.schemas.map_access import MapAccessGrant, MapAccessGrantRequest
from app.models.enums import RoleName

logger = logging.getLogger(__name__)
router = APIRouter(tags=["map-access"])


def _require_admin_or_buscador(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role.name not in (RoleName.admin, RoleName.super_admin, RoleName.buscador):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permiso insuficiente")
    return current_user


async def _get_mission_or_404(mission_id: uuid.UUID, db: AsyncSession) -> Mission:
    result = await db.execute(select(Mission).where(Mission.id == mission_id))
    mission = result.scalar_one_or_none()
    if mission is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Misión no encontrada")
    return mission


@router.get("/missions/{mission_id}/map-access", response_model=list[MapAccessGrant])
async def list_map_access(
    mission_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(_require_admin_or_buscador),
) -> list[MapAccessGrant]:
    """Lista todos los usuarios con acceso al mapa de una misión."""
    await _get_mission_or_404(mission_id, db)

    result = await db.execute(
        select(MissionMapAccess, User)
        .join(User, MissionMapAccess.user_id == User.id)
        .where(MissionMapAccess.mission_id == mission_id)
        .order_by(MissionMapAccess.granted_at)
    )
    rows = result.all()

    return [
        MapAccessGrant(
            id=access.id,
            mission_id=access.mission_id,
            user_id=access.user_id,
            granted_by=access.granted_by,
            granted_at=access.granted_at,
            user_full_name=user.full_name,
            user_role=user.role.name,
        )
        for access, user in rows
    ]


@router.post(
    "/missions/{mission_id}/map-access",
    response_model=MapAccessGrant,
    status_code=status.HTTP_201_CREATED,
)
async def grant_map_access(
    mission_id: uuid.UUID,
    body: MapAccessGrantRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(_require_admin_or_buscador),
) -> MapAccessGrant:
    """Concede acceso al mapa de la misión a un usuario (ayudante o familiar)."""
    await _get_mission_or_404(mission_id, db)

    # Verificar que el usuario existe
    user_result = await db.execute(select(User).where(User.id == body.user_id))
    target_user = user_result.scalar_one_or_none()
    if target_user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")

    # Verificar que no existe ya (upsert manual para retornar el existente)
    existing = await db.execute(
        select(MissionMapAccess).where(
            MissionMapAccess.mission_id == mission_id,
            MissionMapAccess.user_id == body.user_id,
        )
    )
    access = existing.scalar_one_or_none()

    if access is None:
        access = MissionMapAccess(
            mission_id=mission_id,
            user_id=body.user_id,
            granted_by=current_user.id,
        )
        db.add(access)
        await db.flush()
        await db.refresh(access)
        logger.info(
            "Acceso al mapa concedido: mission=%s user=%s by=%s",
            mission_id, body.user_id, current_user.id,
        )

    return MapAccessGrant(
        id=access.id,
        mission_id=access.mission_id,
        user_id=access.user_id,
        granted_by=access.granted_by,
        granted_at=access.granted_at,
        user_full_name=target_user.full_name,
        user_role=target_user.role.name,
    )


@router.delete(
    "/missions/{mission_id}/map-access/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def revoke_map_access(
    mission_id: uuid.UUID,
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(_require_admin_or_buscador),
) -> None:
    """Revoca el acceso al mapa de la misión a un usuario."""
    await _get_mission_or_404(mission_id, db)

    result = await db.execute(
        select(MissionMapAccess).where(
            MissionMapAccess.mission_id == mission_id,
            MissionMapAccess.user_id == user_id,
        )
    )
    access = result.scalar_one_or_none()
    if access is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Acceso no encontrado")

    await db.delete(access)
    logger.info("Acceso al mapa revocado: mission=%s user=%s by=%s", mission_id, user_id, current_user.id)
```

- [ ] **Step 3: Registrar router en `main.py`**

Abrir `backend/app/main.py`. Buscar la sección donde se incluyen los routers (donde está `from app.routers import ...`). Añadir:

```python
from app.routers import map_access as map_access_router
# ...
app.include_router(map_access_router.router)
```

Seguir el patrón exacto de los otros routers ya registrados en `main.py`.

- [ ] **Step 4: Reiniciar backend**

```bash
docker compose restart backend
```

- [ ] **Step 5: Verificar endpoints**

```bash
# Obtener token (reemplazar credenciales si es necesario)
TOKEN=$(curl -s -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@aerofinder.local","password":"AeroAdmin2024!"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# Listar misiones para obtener un ID
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:8000/missions/ | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['id'] if d else 'sin misiones')"
```

Salida esperada: un UUID de misión o "sin misiones" (cualquiera indica que el endpoint funciona).

- [ ] **Step 6: Commit**

```bash
git add backend/app/schemas/map_access.py backend/app/routers/map_access.py backend/app/main.py
git commit -m "feat: add map access REST endpoints (grant/revoke/list per mission)"
```

---

### Task 3: Backend — Extender WS de misión para recibir `user_location`

**Files:**
- Modify: `backend/app/routers/ws.py`

El loop actual del WS de misión solo maneja el string `"ping"`. Hay que extenderlo para:
1. Verificar que el usuario tiene permiso de ver el mapa (admin/buscador siempre; ayudante/familiar solo si están en `mission_map_access`).
2. Parsear JSON entrante y manejar `{"type": "user_location", "lat": X, "lng": Y, "accuracy_m": Z}`.
3. Enriquecer con datos del usuario y hacer broadcast a la room.

- [ ] **Step 1: Añadir función de verificación de acceso al mapa**

En `backend/app/routers/ws.py`, después de la función `_familiar_owns_mission`, añadir:

```python
async def _has_map_access(user_id: uuid.UUID, role: RoleName, mission_id: uuid.UUID) -> bool:
    """
    Verifica si el usuario tiene permiso para ver el mapa de la misión.
    Admin y buscador siempre tienen acceso.
    Ayudante y familiar necesitan estar en mission_map_access.
    """
    from app.models.map_access import MissionMapAccess

    if role in (RoleName.admin, RoleName.super_admin, RoleName.buscador):
        return True

    async with AsyncSessionLocal() as db:
        try:
            result = await db.execute(
                select(MissionMapAccess.id).where(
                    MissionMapAccess.mission_id == mission_id,
                    MissionMapAccess.user_id == user_id,
                )
            )
            return result.scalar_one_or_none() is not None
        except Exception:
            logger.error("Error al verificar acceso al mapa user=%s mission=%s", user_id, mission_id, exc_info=True)
            return False
```

- [ ] **Step 2: Añadir imports necesarios en `ws.py`**

Al inicio del archivo, añadir al bloque de imports:

```python
import json
```

(Ya existe `import uuid`, `from sqlalchemy import select`, etc. Solo falta `import json`.)

- [ ] **Step 3: Reemplazar el loop de `ws_mission` para manejar `user_location`**

Reemplazar el bloque `try:` dentro de `ws_mission` (desde `# Confirmación de conexión` hasta el `except WebSocketDisconnect`) con:

```python
    try:
        # Verificar acceso al mapa antes de confirmar conexión
        can_see_map = await _has_map_access(auth["user_id"], role, mission_id)

        # Obtener nombre del usuario para los broadcasts de ubicación
        user_display_name = ""
        async with AsyncSessionLocal() as db:
            try:
                from app.models.auth import User as UserModel
                result = await db.execute(
                    select(UserModel.full_name).where(UserModel.id == auth["user_id"])
                )
                user_display_name = result.scalar_one_or_none() or str(auth["user_id"])
            except Exception:
                user_display_name = str(auth["user_id"])

        # Confirmación de conexión
        await ws_manager.send_personal(websocket, {
            "type": "connected",
            "room": room_id,
            "can_see_map": can_see_map,
        })

        # Bucle principal: keepalive + user_location
        while True:
            data = await websocket.receive_text()

            # Keepalive string (enviado por el hook useWebSocket cada 30s)
            if data == "ping":
                await ws_manager.send_personal(websocket, {"type": "pong"})
                continue

            # Intentar parsear como JSON
            try:
                msg = json.loads(data)
            except (json.JSONDecodeError, ValueError):
                continue

            msg_type = msg.get("type")

            if msg_type == "user_location":
                # Solo procesar si el usuario tiene acceso al mapa
                if not can_see_map:
                    continue

                lat = msg.get("lat")
                lng = msg.get("lng")
                if lat is None or lng is None:
                    continue

                # Broadcast a toda la room con datos del usuario
                await ws_manager.broadcast(room_id, {
                    "type": "user_location",
                    "user_id": str(auth["user_id"]),
                    "user_name": user_display_name,
                    "role": role.value,
                    "lat": lat,
                    "lng": lng,
                    "accuracy_m": msg.get("accuracy_m"),
                    "timestamp": __import__("datetime").datetime.utcnow().isoformat() + "Z",
                })

    except WebSocketDisconnect:
        logger.debug("WS desconectado room=%s user=%s", room_id, auth["user_id"])
    finally:
        ws_manager.disconnect(websocket, room_id)
```

- [ ] **Step 4: Reiniciar backend**

```bash
docker compose restart backend
```

- [ ] **Step 5: Verificar con wscat o curl que el endpoint acepta JSON**

```bash
# Instalar wscat si no está disponible
# npm install -g wscat

# Obtener token
TOKEN=$(curl -s -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@aerofinder.local","password":"AeroAdmin2024!"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# Obtener misión activa (o cualquier misión)
MISSION_ID=$(curl -s -H "Authorization: Bearer $TOKEN" http://localhost:8000/missions/ \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['id'] if d else '')")

echo "Mission ID: $MISSION_ID"
echo "WS URL: ws://localhost:8000/ws/missions/$MISSION_ID?token=$TOKEN"
```

Salida esperada: un mission ID válido y la URL del WS.

- [ ] **Step 6: Commit**

```bash
git add backend/app/routers/ws.py
git commit -m "feat: extend mission WS to receive and broadcast user_location messages"
```

---

### Task 4: Frontend — Tipos + `mapAccessApi` + `useLocationSharing` hook

**Files:**
- Modify: `frontend/src/lib/types.ts`
- Modify: `frontend/src/lib/api.ts`
- Create: `frontend/src/hooks/useLocationSharing.ts`

- [ ] **Step 1: Añadir tipos en `types.ts`**

Al final del archivo `frontend/src/lib/types.ts`, añadir:

```typescript
// ── Mapa en tiempo real ───────────────────────────────────────────────────────

export interface MapAccessGrant {
  id: string;
  mission_id: string;
  user_id: string;
  granted_by: string | null;
  granted_at: string;
  user_full_name: string;
  user_role: RoleName;
}

/** Posición de un usuario en el mapa, recibida por WS */
export interface UserLocationState {
  user_id: string;
  user_name: string;
  role: RoleName;
  lat: number;
  lng: number;
  accuracy_m: number | null;
  timestamp: string;
  /** true si no recibimos actualización en más de 60s */
  stale?: boolean;
}
```

- [ ] **Step 2: Añadir `mapAccessApi` en `api.ts`**

Al final de `frontend/src/lib/api.ts`, antes de `export default api;`, añadir:

```typescript
// ── API de acceso al mapa de misión ──────────────────────────────────────────

export const mapAccessApi = {
  async list(missionId: string): Promise<MapAccessGrant[]> {
    const { data } = await api.get<MapAccessGrant[]>(`/missions/${missionId}/map-access`);
    return data;
  },

  async grant(missionId: string, userId: string): Promise<MapAccessGrant> {
    const { data } = await api.post<MapAccessGrant>(`/missions/${missionId}/map-access`, {
      user_id: userId,
    });
    return data;
  },

  async revoke(missionId: string, userId: string): Promise<void> {
    await api.delete(`/missions/${missionId}/map-access/${userId}`);
  },
};
```

También añadir el import del tipo en la sección de imports del archivo:

```typescript
import type {
  // ... tipos existentes ...
  MapAccessGrant,
} from "@/lib/types";
```

- [ ] **Step 3: Crear `useLocationSharing.ts`**

```typescript
// frontend/src/hooks/useLocationSharing.ts
// =============================================================================
// AEROFINDER Frontend — Hook useLocationSharing
// Combina navigator.geolocation.watchPosition con el WS de misión para:
//   1. Enviar la posición del usuario cada 3s al servidor
//   2. Mantener un mapa de posiciones de otros usuarios en la misión
// =============================================================================

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { UserLocationState } from "@/lib/types";

const SEND_INTERVAL_MS = 3_000;
const STALE_THRESHOLD_MS = 60_000;

interface UseLocationSharingOptions {
  /** Función send del hook useWebSocket */
  send: (data: string | object) => void;
  /** Si false, no se envía la posición pero sí se reciben las de otros */
  shareOwnLocation?: boolean;
}

interface UseLocationSharingReturn {
  /** Posiciones de otros usuarios (excluye al usuario actual) */
  otherLocations: UserLocationState[];
  /** Posición propia (null si geolocation no disponible o denegada) */
  ownLocation: { lat: number; lng: number; accuracy_m: number } | null;
  /** Error de geolocation si ocurrió */
  geoError: string | null;
}

export function useLocationSharing(
  ownUserId: string | null,
  options: UseLocationSharingOptions
): UseLocationSharingReturn {
  const { send, shareOwnLocation = true } = options;

  const [otherLocations, setOtherLocations] = useState<UserLocationState[]>([]);
  const [ownLocation, setOwnLocation] = useState<{ lat: number; lng: number; accuracy_m: number } | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);

  const latestPositionRef = useRef<GeolocationPosition | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const sendIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const staleIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Recibir posiciones de otros usuarios (llamado desde el componente padre via onMessage)
  const handleIncomingLocation = useCallback(
    (msg: UserLocationState) => {
      if (msg.user_id === ownUserId) return; // ignorar las propias reflejadas

      setOtherLocations((prev) => {
        const filtered = prev.filter((l) => l.user_id !== msg.user_id);
        return [...filtered, { ...msg, stale: false }];
      });
    },
    [ownUserId]
  );

  // Enviar posición propia cada 3s
  useEffect(() => {
    if (!shareOwnLocation) return;

    // Iniciar watchPosition
    if (typeof navigator !== "undefined" && "geolocation" in navigator) {
      watchIdRef.current = navigator.geolocation.watchPosition(
        (position) => {
          latestPositionRef.current = position;
          setOwnLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy_m: position.coords.accuracy,
          });
          setGeoError(null);
        },
        (err) => {
          setGeoError(err.message);
        },
        { enableHighAccuracy: true, maximumAge: 5_000 }
      );
    } else {
      setGeoError("Geolocalización no disponible en este navegador");
    }

    // Enviar al servidor cada 3s si hay posición
    sendIntervalRef.current = setInterval(() => {
      if (latestPositionRef.current) {
        const { latitude, longitude, accuracy } = latestPositionRef.current.coords;
        send({
          type: "user_location",
          lat: latitude,
          lng: longitude,
          accuracy_m: accuracy,
        });
      }
    }, SEND_INTERVAL_MS);

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      if (sendIntervalRef.current) {
        clearInterval(sendIntervalRef.current);
      }
    };
  }, [send, shareOwnLocation]);

  // Marcar posiciones como stale si no se actualizan en 60s
  useEffect(() => {
    staleIntervalRef.current = setInterval(() => {
      const now = Date.now();
      setOtherLocations((prev) =>
        prev.map((loc) => ({
          ...loc,
          stale: now - new Date(loc.timestamp).getTime() > STALE_THRESHOLD_MS,
        }))
      );
    }, 10_000);

    return () => {
      if (staleIntervalRef.current) clearInterval(staleIntervalRef.current);
    };
  }, []);

  return { otherLocations, ownLocation, geoError, handleIncomingLocation } as UseLocationSharingReturn & {
    handleIncomingLocation: (msg: UserLocationState) => void;
  };
}

// Re-exportar para uso conveniente
export type { UseLocationSharingReturn };
```

**Nota:** el hook retorna `handleIncomingLocation` como propiedad extra (cast a través de `& {...}`). El componente padre lo llama desde el callback `onMessage` del hook `useWebSocket`.

- [ ] **Step 4: Verificar que TypeScript no tiene errores**

```bash
cd /home/wiz/aerofinder/frontend && npx tsc --noEmit 2>&1 | head -30
```

Salida esperada: sin errores (o solo errores preexistentes no relacionados).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/types.ts frontend/src/lib/api.ts frontend/src/hooks/useLocationSharing.ts
git commit -m "feat: add MapAccessGrant types, mapAccessApi, and useLocationSharing hook"
```

---

### Task 5: Frontend — Página `/dashboard/map` + link en sidebar

**Files:**
- Create: `frontend/src/app/dashboard/map/page.tsx`
- Modify: `frontend/src/components/layout/Sidebar.tsx`

La página tiene Layout C: barra superior con chips filtrables (uno por usuario compartiendo ubicación) + Leaflet full-width debajo. Selector de misión arriba a la izquierda. El usuario puede hacer click en un chip para centrar el mapa en esa persona.

- [ ] **Step 1: Crear `frontend/src/app/dashboard/map/page.tsx`**

```tsx
// frontend/src/app/dashboard/map/page.tsx
// =============================================================================
// AEROFINDER Frontend — Página /dashboard/map
// Mapa en tiempo real: GPS de usuarios vía navegador + detecciones de misión.
// Layout C: chips filtrables arriba + Leaflet full-width.
// =============================================================================

"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuthStore } from "@/store/auth";
import { useWebSocket } from "@/lib/websocket";
import { missionsApi } from "@/lib/api";
import { RoleGuard } from "@/components/auth/RoleGuard";
import type { Mission, UserLocationState, WSMessage } from "@/lib/types";

// Leaflet solo en cliente (requiere window)
const MapView = dynamic(() => import("@/components/map/MapView"), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center bg-slate-900">
      <p className="text-slate-400 text-sm">Cargando mapa...</p>
    </div>
  ),
});

// ── Colores por rol ───────────────────────────────────────────────────────────
const ROLE_COLOR: Record<string, string> = {
  admin: "#3b82f6",
  super_admin: "#3b82f6",
  buscador: "#22c55e",
  ayudante: "#f59e0b",
  familiar: "#a855f7",
};

function rolLabel(role: string): string {
  const map: Record<string, string> = {
    admin: "Admin",
    super_admin: "Admin",
    buscador: "Rescatista",
    ayudante: "Ayudante",
    familiar: "Familiar",
  };
  return map[role] ?? role;
}

export default function MapPage() {
  const { user, accessToken } = useAuthStore();

  // ── Misiones ─────────────────────────────────────────────────────────────
  const [missions, setMissions] = useState<Mission[]>([]);
  const [selectedMissionId, setSelectedMissionId] = useState<string>("");

  useEffect(() => {
    missionsApi.list().then((list) => {
      const active = list.filter((m) => m.status === "active");
      setMissions(active.length ? active : list);
      if (list.length > 0) setSelectedMissionId(list[0].id);
    }).catch(() => {});
  }, []);

  // ── WebSocket ─────────────────────────────────────────────────────────────
  const wsUrl =
    selectedMissionId && accessToken
      ? `${process.env.NEXT_PUBLIC_WS_URL}/ws/missions/${selectedMissionId}?token=${accessToken}`
      : null;

  // Mapa de posiciones: user_id → UserLocationState
  const [locations, setLocations] = useState<Record<string, UserLocationState>>({});
  // IDs de chips visibles (null = todos visibles)
  const [visibleUsers, setVisibleUsers] = useState<Set<string> | null>(null);
  // ID del usuario en el que hacer zoom (null = sin zoom)
  const [focusUserId, setFocusUserId] = useState<string | null>(null);

  const latestPositionRef = useRef<{ lat: number; lng: number } | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const sendRef = useRef<((data: string | object) => void) | null>(null);
  const sendIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleMessage = useCallback((msg: WSMessage) => {
    if (msg.type === "user_location") {
      const loc = msg as unknown as UserLocationState;
      setLocations((prev) => ({ ...prev, [loc.user_id]: { ...loc, stale: false } }));
    }
  }, []);

  const { isConnected, send } = useWebSocket(wsUrl, handleMessage);

  // Guardar send en ref para usarlo en el interval
  useEffect(() => {
    sendRef.current = send;
  }, [send]);

  // ── Geolocation propia ────────────────────────────────────────────────────
  useEffect(() => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) return;

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        latestPositionRef.current = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 5_000 }
    );

    // Enviar posición cada 3s
    sendIntervalRef.current = setInterval(() => {
      if (latestPositionRef.current && sendRef.current) {
        sendRef.current({
          type: "user_location",
          lat: latestPositionRef.current.lat,
          lng: latestPositionRef.current.lng,
        });
      }
    }, 3_000);

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      if (sendIntervalRef.current) clearInterval(sendIntervalRef.current);
    };
  }, []);

  // Reiniciar locations al cambiar de misión
  useEffect(() => {
    setLocations({});
    setVisibleUsers(null);
    setFocusUserId(null);
  }, [selectedMissionId]);

  // Marcar stale cada 10s
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setLocations((prev) => {
        const updated = { ...prev };
        for (const id in updated) {
          const stale = now - new Date(updated[id].timestamp).getTime() > 60_000;
          if (updated[id].stale !== stale) {
            updated[id] = { ...updated[id], stale };
          }
        }
        return updated;
      });
    }, 10_000);
    return () => clearInterval(interval);
  }, []);

  // ── Chips ─────────────────────────────────────────────────────────────────
  const locationList = Object.values(locations);

  function toggleChip(userId: string) {
    setFocusUserId(userId);
    setVisibleUsers((prev) => {
      if (prev === null) {
        // Primera vez: mostrar solo este
        return new Set([userId]);
      }
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
        return next.size === 0 ? null : next;
      } else {
        next.add(userId);
        return next;
      }
    });
  }

  const visibleLocations = visibleUsers === null
    ? locationList
    : locationList.filter((l) => visibleUsers.has(l.user_id));

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <RoleGuard allowedRoles={["admin", "super_admin", "buscador", "ayudante", "familiar"]}>
      <div className="flex flex-col h-full bg-slate-950">

        {/* Barra superior: selector misión + chips + estado WS */}
        <div className="flex items-center gap-3 px-4 py-2 bg-slate-900 border-b border-slate-800 flex-wrap">
          {/* Selector de misión */}
          <select
            className="bg-slate-800 text-slate-200 text-xs rounded px-2 py-1 border border-slate-700 focus:outline-none"
            value={selectedMissionId}
            onChange={(e) => setSelectedMissionId(e.target.value)}
          >
            {missions.length === 0 && (
              <option value="">Sin misiones</option>
            )}
            {missions.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>

          {/* Separador */}
          <div className="h-4 w-px bg-slate-700" />

          {/* Chips por usuario */}
          {locationList.length === 0 ? (
            <span className="text-xs text-slate-500">Sin ubicaciones activas</span>
          ) : (
            locationList.map((loc) => {
              const isVisible = visibleUsers === null || visibleUsers.has(loc.user_id);
              const color = ROLE_COLOR[loc.role] ?? "#64748b";
              const isOwn = loc.user_id === user?.id;
              return (
                <button
                  key={loc.user_id}
                  onClick={() => toggleChip(loc.user_id)}
                  className="flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium transition-opacity"
                  style={{
                    backgroundColor: isVisible ? color + "33" : "transparent",
                    border: `1px solid ${color}`,
                    color: isVisible ? "#f1f5f9" : "#64748b",
                    opacity: loc.stale ? 0.5 : 1,
                  }}
                  title={loc.stale ? "Sin señal hace más de 60s" : ""}
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  {isOwn ? "Tú" : loc.user_name}
                  <span className="opacity-60">· {rolLabel(loc.role)}</span>
                  {loc.stale && <span className="ml-1 opacity-50">⚠</span>}
                </button>
              );
            })
          )}

          {/* Estado WS */}
          <div className="ml-auto flex items-center gap-1.5 text-xs">
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: isConnected ? "#22c55e" : "#ef4444" }}
            />
            <span className="text-slate-400">{isConnected ? "En vivo" : "Desconectado"}</span>
          </div>
        </div>

        {/* Mapa */}
        <div className="flex-1 relative">
          {selectedMissionId ? (
            <MapView
              locations={visibleLocations}
              ownUserId={user?.id ?? null}
              focusUserId={focusUserId}
              roleColors={ROLE_COLOR}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-slate-500 text-sm">Seleccioná una misión para ver el mapa</p>
            </div>
          )}
        </div>
      </div>
    </RoleGuard>
  );
}
```

- [ ] **Step 2: Crear `frontend/src/components/map/MapView.tsx`**

Este componente renderiza el mapa Leaflet con los marcadores. Solo se importa dinámicamente (ssr: false).

```tsx
// frontend/src/components/map/MapView.tsx
// =============================================================================
// AEROFINDER Frontend — Componente MapView (solo cliente)
// Leaflet con marcadores de usuarios y detecciones de misión.
// =============================================================================

"use client";

import { useEffect, useRef } from "react";
import type { UserLocationState } from "@/lib/types";

// Leaflet imports — solo disponibles en cliente
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface MapViewProps {
  locations: UserLocationState[];
  ownUserId: string | null;
  focusUserId: string | null;
  roleColors: Record<string, string>;
}

function makeIcon(color: string, isOwn: boolean): L.DivIcon {
  const size = isOwn ? 14 : 12;
  const border = isOwn ? "3px solid white" : "2px solid white";
  return L.divIcon({
    className: "",
    html: `<div style="
      width:${size}px;height:${size}px;
      background:${color};
      border:${border};
      border-radius:50%;
      box-shadow:0 0 6px ${color};
    "></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

export default function MapView({ locations, ownUserId, focusUserId, roleColors }: MapViewProps) {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const markersRef = useRef<Record<string, L.Marker>>({});

  // Inicializar mapa una sola vez
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [-34.6037, -58.3816], // Buenos Aires por defecto
      zoom: 13,
      zoomControl: true,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Actualizar marcadores cuando cambia la lista de ubicaciones
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const activeIds = new Set(locations.map((l) => l.user_id));

    // Eliminar marcadores de usuarios que ya no están
    for (const userId in markersRef.current) {
      if (!activeIds.has(userId)) {
        markersRef.current[userId].remove();
        delete markersRef.current[userId];
      }
    }

    // Actualizar o crear marcadores
    for (const loc of locations) {
      const color = roleColors[loc.role] ?? "#64748b";
      const isOwn = loc.user_id === ownUserId;
      const icon = makeIcon(color, isOwn);
      const label = isOwn ? "Tú" : loc.user_name;

      if (markersRef.current[loc.user_id]) {
        const marker = markersRef.current[loc.user_id];
        marker.setLatLng([loc.lat, loc.lng]);
        marker.setIcon(icon);
        marker.setTooltipContent(label);
      } else {
        const marker = L.marker([loc.lat, loc.lng], { icon })
          .addTo(map)
          .bindTooltip(label, { permanent: false, direction: "top", offset: [0, -8] });
        markersRef.current[loc.user_id] = marker;
      }
    }
  }, [locations, ownUserId, roleColors]);

  // Centrar mapa en usuario cuando se hace click en chip
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusUserId) return;

    const loc = locations.find((l) => l.user_id === focusUserId);
    if (loc) {
      map.flyTo([loc.lat, loc.lng], 16, { duration: 1 });
    }
  }, [focusUserId, locations]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}
```

- [ ] **Step 3: Añadir link en Sidebar**

Abrir `frontend/src/components/layout/Sidebar.tsx`. Buscar el bloque del rol `admin` o `buscador` donde están los links de Operaciones. En el grupo "Operaciones" añadir el link al mapa después del link a Misiones:

Para el bloque `admin`/`super_admin`, buscar el link a Misiones y añadir después:

```tsx
{
  href: "/dashboard/map",
  icon: <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>,
  label: "Mapa en tiempo real",
},
```

Para el bloque `buscador`, añadir el mismo link de mapa.

Para `ayudante` y `familiar`, NO añadir el link (no tienen acceso por defecto; lo ven solo si el admin les da acceso y acceden por URL directa).

- [ ] **Step 4: Verificar build de TypeScript**

```bash
cd /home/wiz/aerofinder/frontend && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 5: Rebuild frontend y verificar en navegador**

```bash
docker compose up -d --build frontend
```

Luego abrir `http://localhost:3000/dashboard/map` como admin. Debería verse el mapa con el selector de misiones.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/dashboard/map/page.tsx frontend/src/components/map/MapView.tsx frontend/src/components/layout/Sidebar.tsx
git commit -m "feat: add real-time map page with GPS location sharing via mission WS"
```

---

### Task 6: Frontend — UI de acceso en detalle de misión

**Files:**
- Modify: `frontend/src/app/dashboard/missions/[id]/page.tsx`

Añadir una sección "Acceso al mapa" en la página de detalle de misión. Solo visible para admin/buscador. Muestra la lista de usuarios con acceso y permite añadir nuevos via selector de usuarios del sistema.

- [ ] **Step 1: Leer el archivo actual**

Abrir y leer `frontend/src/app/dashboard/missions/[id]/page.tsx` para entender la estructura exacta antes de modificarlo.

- [ ] **Step 2: Añadir estado y lógica para acceso al mapa**

En el componente de detalle de misión, añadir los siguientes imports y estado:

```tsx
import { mapAccessApi, usersApi } from "@/lib/api";
import type { MapAccessGrant, User } from "@/lib/types";

// En el componente:
const [mapAccess, setMapAccess] = useState<MapAccessGrant[]>([]);
const [allUsers, setAllUsers] = useState<User[]>([]);
const [selectedUserId, setSelectedUserId] = useState<string>("");
const [grantingAccess, setGrantingAccess] = useState(false);

// En el useEffect de carga de datos:
if (currentRole === "admin" || currentRole === "super_admin" || currentRole === "buscador") {
  mapAccessApi.list(missionId).then(setMapAccess).catch(() => {});
  usersApi.list().then(setAllUsers).catch(() => {});
}

async function handleGrantAccess() {
  if (!selectedUserId || !missionId) return;
  setGrantingAccess(true);
  try {
    const grant = await mapAccessApi.grant(missionId, selectedUserId);
    setMapAccess((prev) => [...prev, grant]);
    setSelectedUserId("");
  } catch {
    // Silenciar: usuario ya tenía acceso
  } finally {
    setGrantingAccess(false);
  }
}

async function handleRevokeAccess(userId: string) {
  if (!missionId) return;
  try {
    await mapAccessApi.revoke(missionId, userId);
    setMapAccess((prev) => prev.filter((a) => a.user_id !== userId));
  } catch {
    // Ignorar
  }
}
```

- [ ] **Step 3: Añadir sección de UI "Acceso al mapa" en el JSX**

En el JSX de la página, después de la sección de drones asignados (o al final de las secciones de admin), añadir:

```tsx
{/* Sección solo para admin/buscador */}
{(currentRole === "admin" || currentRole === "super_admin" || currentRole === "buscador") && (
  <section className="bg-slate-900 border border-slate-800 rounded-xl p-4">
    <h3 className="text-sm font-semibold text-slate-300 mb-3">Acceso al mapa</h3>
    <p className="text-xs text-slate-500 mb-3">
      Ayudantes y familiares solo ven el mapa si se los autoriza explícitamente.
    </p>

    {/* Lista de accesos */}
    {mapAccess.length === 0 ? (
      <p className="text-xs text-slate-600 mb-3">Sin usuarios autorizados todavía.</p>
    ) : (
      <ul className="space-y-1.5 mb-3">
        {mapAccess.map((grant) => (
          <li
            key={grant.user_id}
            className="flex items-center justify-between bg-slate-800 rounded px-3 py-2"
          >
            <div>
              <span className="text-xs text-slate-200">{grant.user_full_name}</span>
              <span className="text-xs text-slate-500 ml-2">· {grant.user_role}</span>
            </div>
            {(currentRole === "admin" || currentRole === "super_admin") && (
              <button
                onClick={() => handleRevokeAccess(grant.user_id)}
                className="text-xs text-red-400 hover:text-red-300 transition-colors"
              >
                Revocar
              </button>
            )}
          </li>
        ))}
      </ul>
    )}

    {/* Añadir acceso */}
    {(currentRole === "admin" || currentRole === "super_admin") && (
      <div className="flex gap-2">
        <select
          className="flex-1 bg-slate-800 text-slate-200 text-xs rounded px-2 py-1.5 border border-slate-700 focus:outline-none"
          value={selectedUserId}
          onChange={(e) => setSelectedUserId(e.target.value)}
        >
          <option value="">Seleccionar usuario...</option>
          {allUsers
            .filter(
              (u) =>
                (u.role === "ayudante" || u.role === "familiar") &&
                !mapAccess.some((a) => a.user_id === u.id)
            )
            .map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name} ({u.role})
              </option>
            ))}
        </select>
        <button
          onClick={handleGrantAccess}
          disabled={!selectedUserId || grantingAccess}
          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs rounded transition-colors"
        >
          {grantingAccess ? "..." : "Autorizar"}
        </button>
      </div>
    )}
  </section>
)}
```

- [ ] **Step 4: Verificar TypeScript**

```bash
cd /home/wiz/aerofinder/frontend && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 5: Rebuild frontend**

```bash
docker compose up -d --build frontend
```

Ir a `http://localhost:3000/dashboard/missions/<mission_id>` como admin. Debe verse la sección "Acceso al mapa" al final de la página.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/dashboard/missions/[id]/page.tsx
git commit -m "feat: add map access management UI in mission detail page"
```

---

## Self-Review

### Spec coverage

| Requisito | Tarea |
|-----------|-------|
| Tabla `mission_map_access` | Task 1 |
| REST endpoints grant/revoke/list | Task 2 |
| WS recibe `user_location` y rebroadcastea | Task 3 |
| Acceso: admin/buscador siempre, ayudante/familiar con autorización | Task 3 (verificación en WS) |
| Hook para enviar/recibir posiciones | Task 4 (`useLocationSharing`) |
| Tipos TypeScript y `mapAccessApi` | Task 4 |
| Página `/dashboard/map` layout C | Task 5 |
| Chips filtrables + zoom al click | Task 5 |
| Link en sidebar para admin/buscador | Task 5 |
| UI de autorización en detalle de misión | Task 6 |

### Placeholder scan

Sin TBD ni TODO. Todos los pasos tienen código completo.

### Type consistency

- `UserLocationState` definido en Task 4 Step 1, usado en Task 5 (MapView, MapPage) y Task 4 (useLocationSharing).
- `MapAccessGrant` definido en Task 4 Step 1, usado en Task 4 Step 2 (`mapAccessApi`) y Task 6.
- `mapAccessApi` exportado en Task 4 Step 2, importado en Task 6.
- `MapView` component recibe `locations: UserLocationState[]` — consistente con lo que envía `MapPage`.
- Backend: `_has_map_access()` definido en Task 3 Step 1, llamado dentro de `ws_mission` en Task 3 Step 3.
- Migración `0016` tiene `down_revision = "0015"` — verificar que `0015_alerts_detection_id_nullable.py` existe (confirmado en ls de migrations).

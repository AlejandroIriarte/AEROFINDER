# Backend: Multi-Drone RTMP + Field Reports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar reconocimiento facial por misión, auto-discovery de drones via MediaMTX webhook, y el ciclo completo de field reports (rescatista → admin → IA → resultado) con notificaciones WebSocket y Push.

**Architecture:** Migración Alembic 0007 agrega 4 tablas y 2 columnas nuevas. Nuevos routers `field_reports` y `push` se registran en main.py. El AI worker adopta un supervisor loop asyncio con una task por stream activo, más una función separada para analizar fotos de field reports. MediaMTX llama al backend via webhook cuando un stream conecta.

**Tech Stack:** FastAPI, SQLAlchemy 2.0 async, Alembic, asyncio, MinIO presigned URLs, pgvector cosine similarity, pywebpush (Web Push), ws_manager.broadcast

---

## Mapa de archivos

| Acción | Archivo |
|--------|---------|
| Crear | `backend/migrations/versions/0007_face_recognition_field_reports.py` |
| Modificar | `backend/app/models/missions.py` |
| Modificar | `backend/app/models/drones.py` |
| Crear | `backend/app/models/field_reports.py` |
| Modificar | `backend/app/schemas/missions.py` |
| Modificar | `backend/app/schemas/drones.py` |
| Crear | `backend/app/schemas/field_reports.py` |
| Modificar | `backend/app/routers/missions.py` |
| Modificar | `backend/app/routers/drones.py` |
| Crear | `backend/app/routers/field_reports.py` |
| Crear | `backend/app/routers/push.py` |
| Modificar | `backend/app/main.py` |
| Modificar | `backend/requirements.txt` |
| Modificar | `docker-compose.yml` |
| Modificar | `ai_worker/main.py` |
| Crear | `ai_worker/field_report_analyzer.py` |

---

## Task 1: Migración Alembic 0007

**Files:**
- Create: `backend/migrations/versions/0007_face_recognition_field_reports.py`

- [ ] **Crear el archivo de migración:**

```python
# backend/migrations/versions/0007_face_recognition_field_reports.py
"""Add face_recognition_active, auto_created, field_reports, push_subscriptions

Revision ID: 0007
Revises: 0006
Create Date: 2026-05-07
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0007"
down_revision: Union[str, Sequence[str], None] = "0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # missions: reconocimiento facial a nivel misión
    op.add_column("missions", sa.Column(
        "face_recognition_active", sa.Boolean(),
        nullable=False, server_default=sa.text("FALSE")
    ))

    # drones: flag de auto-creación por MediaMTX webhook
    op.add_column("drones", sa.Column(
        "auto_created", sa.Boolean(),
        nullable=False, server_default=sa.text("FALSE")
    ))

    # field_reports: solicitudes de análisis de rescatistas
    op.create_table("field_reports",
        sa.Column("id", sa.UUID(), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("mission_id", sa.UUID(), nullable=False),
        sa.Column("rescuer_id", sa.UUID(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default=sa.text("'pending'")),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("location_lat", sa.Numeric(10, 8), nullable=True),
        sa.Column("location_lon", sa.Numeric(11, 8), nullable=True),
        sa.Column("approved_by", sa.UUID(), nullable=True),
        sa.Column("approved_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("completed_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["mission_id"], ["missions.id"]),
        sa.ForeignKeyConstraint(["rescuer_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["approved_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_field_reports_mission_id", "field_reports", ["mission_id"])
    op.create_index("ix_field_reports_rescuer_id", "field_reports", ["rescuer_id"])

    # field_report_photos: fotos subidas a MinIO
    op.create_table("field_report_photos",
        sa.Column("id", sa.UUID(), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("field_report_id", sa.UUID(), nullable=False),
        sa.Column("minio_object", sa.String(500), nullable=False),
        sa.Column("uploaded_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["field_report_id"], ["field_reports.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    # field_report_matches: top-3 resultados del análisis FaceNet
    op.create_table("field_report_matches",
        sa.Column("id", sa.UUID(), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("field_report_id", sa.UUID(), nullable=False),
        sa.Column("person_id", sa.UUID(), nullable=False),
        sa.Column("similarity_score", sa.Numeric(5, 4), nullable=False),
        sa.Column("rank", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["field_report_id"], ["field_reports.id"]),
        sa.ForeignKeyConstraint(["person_id"], ["persons.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    # push_subscriptions: suscripciones Web Push PWA
    op.create_table("push_subscriptions",
        sa.Column("id", sa.UUID(), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("endpoint", sa.Text(), nullable=False),
        sa.Column("p256dh", sa.Text(), nullable=False),
        sa.Column("auth_key", sa.Text(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "endpoint", name="uq_push_user_endpoint"),
    )


def downgrade() -> None:
    op.drop_table("push_subscriptions")
    op.drop_table("field_report_matches")
    op.drop_table("field_report_photos")
    op.drop_table("field_reports")
    op.drop_column("drones", "auto_created")
    op.drop_column("missions", "face_recognition_active")
```

- [ ] **Aplicar migración:**

```bash
cd backend
docker compose exec backend alembic upgrade head
# Esperado: INFO  [alembic.runtime.migration] Running upgrade 0006 -> 0007
```

- [ ] **Verificar tablas creadas:**

```bash
docker compose exec postgres psql -U postgres -d aerofinder -c "\dt field_report*"
# Esperado: field_report_matches, field_report_photos, field_reports
docker compose exec postgres psql -U postgres -d aerofinder -c "\d missions" | grep face_recognition
# Esperado: face_recognition_active | boolean
```

- [ ] **Commit:**

```bash
git add backend/migrations/versions/0007_face_recognition_field_reports.py
git commit -m "db: migración 0007 — face_recognition, auto_created, field_reports, push_subscriptions"
```

---

## Task 2: Modelos ORM — Mission y Drone

**Files:**
- Modify: `backend/app/models/missions.py`
- Modify: `backend/app/models/drones.py`

- [ ] **Agregar `face_recognition_active` a la clase Mission:**

En `backend/app/models/missions.py`, dentro de `class Mission(Base, ...)`, agregar después de `recognition_active`:

```python
face_recognition_active: Mapped[bool] = mapped_column(
    Boolean, nullable=False, server_default=text("FALSE")
)
```

- [ ] **Agregar `auto_created` a la clase Drone:**

En `backend/app/models/drones.py`, dentro de `class Drone(Base, ...)`, agregar al final de los campos:

```python
auto_created: Mapped[bool] = mapped_column(
    Boolean, nullable=False, server_default=text("FALSE")
)
```

- [ ] **Crear `backend/app/models/field_reports.py`:**

```python
# =============================================================================
# AEROFINDER Backend — Modelo: Field Reports
# Solicitudes de análisis desde rescatistas en campo.
# Ciclo: pending → approved/rejected → analyzing → completed
# =============================================================================

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import TIMESTAMP, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class FieldReport(Base):
    __tablename__ = "field_reports"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    mission_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("missions.id"), nullable=False
    )
    rescuer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    location_lat: Mapped[Decimal | None] = mapped_column(Numeric(10, 8), nullable=True)
    location_lon: Mapped[Decimal | None] = mapped_column(Numeric(11, 8), nullable=True)
    approved_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    approved_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )

    photos: Mapped[list["FieldReportPhoto"]] = relationship(
        back_populates="report", cascade="all, delete-orphan"
    )
    matches: Mapped[list["FieldReportMatch"]] = relationship(
        back_populates="report", order_by="FieldReportMatch.rank", cascade="all, delete-orphan"
    )


class FieldReportPhoto(Base):
    __tablename__ = "field_report_photos"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    field_report_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("field_reports.id"), nullable=False
    )
    minio_object: Mapped[str] = mapped_column(String(500), nullable=False)
    uploaded_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )

    report: Mapped["FieldReport"] = relationship(back_populates="photos")


class FieldReportMatch(Base):
    __tablename__ = "field_report_matches"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    field_report_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("field_reports.id"), nullable=False
    )
    person_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("persons.id"), nullable=False
    )
    similarity_score: Mapped[Decimal] = mapped_column(Numeric(5, 4), nullable=False)
    rank: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )

    report: Mapped["FieldReport"] = relationship(back_populates="matches")


class PushSubscription(Base):
    __tablename__ = "push_subscriptions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    endpoint: Mapped[str] = mapped_column(Text, nullable=False)
    p256dh: Mapped[str] = mapped_column(Text, nullable=False)
    auth_key: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )
```

- [ ] **Registrar los modelos en `backend/app/db/base.py` (o donde se importen todos los modelos):**

Buscar el archivo que importa todos los modelos para que Alembic los detecte. Agregar:

```python
from app.models.field_reports import FieldReport, FieldReportPhoto, FieldReportMatch, PushSubscription  # noqa: F401
```

- [ ] **Commit:**

```bash
git add backend/app/models/missions.py backend/app/models/drones.py backend/app/models/field_reports.py
git commit -m "feat: modelos ORM field_reports, push_subscriptions, face_recognition_active, auto_created"
```

---

## Task 3: Schemas Pydantic

**Files:**
- Modify: `backend/app/schemas/missions.py`
- Modify: `backend/app/schemas/drones.py`
- Create: `backend/app/schemas/field_reports.py`

- [ ] **Actualizar `MissionResponse` en `backend/app/schemas/missions.py`:**

Agregar el campo a la clase `MissionResponse`:

```python
face_recognition_active: bool = False
```

Reemplazar `RecognitionToggleRequest`:

```python
class RecognitionToggleRequest(BaseModel):
    person_detection: bool
    face_recognition: bool
```

- [ ] **Actualizar `DroneResponse` en `backend/app/schemas/drones.py`:**

Agregar campos al final de `DroneResponse`:

```python
auto_created: bool = False
rtmp_url: str | None = None
hls_url: str | None = None
```

- [ ] **Crear `backend/app/schemas/field_reports.py`:**

```python
# =============================================================================
# AEROFINDER Backend — Schemas: Field Reports
# =============================================================================

import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel


class FieldReportCreate(BaseModel):
    notes: str | None = None
    location_lat: float | None = None
    location_lon: float | None = None


class FieldReportReject(BaseModel):
    reason: str


class FieldReportPhotoResponse(BaseModel):
    id: uuid.UUID
    minio_object: str
    uploaded_at: datetime

    model_config = {"from_attributes": True}


class FieldReportMatchResponse(BaseModel):
    person_id: uuid.UUID
    person_name: str
    similarity_score: float
    rank: int
    photo_url: str | None = None  # URL pública MinIO de la foto del desaparecido

    model_config = {"from_attributes": True}


class FieldReportResponse(BaseModel):
    id: uuid.UUID
    mission_id: uuid.UUID
    rescuer_id: uuid.UUID
    rescuer_name: str
    status: str
    notes: str | None
    location_lat: float | None
    location_lon: float | None
    approved_by: uuid.UUID | None
    approved_at: datetime | None
    completed_at: datetime | None
    created_at: datetime
    photos: list[FieldReportPhotoResponse] = []
    matches: list[FieldReportMatchResponse] = []

    model_config = {"from_attributes": True}


class UploadUrlResponse(BaseModel):
    presigned_url: str
    object_name: str
    photo_index: int


class ConfirmPhotoRequest(BaseModel):
    object_name: str
```

- [ ] **Commit:**

```bash
git add backend/app/schemas/missions.py backend/app/schemas/drones.py backend/app/schemas/field_reports.py
git commit -m "feat: schemas face_recognition, auto_created, field_reports"
```

---

## Task 4: Router missions — actualizar endpoint recognition

**Files:**
- Modify: `backend/app/routers/missions.py`

- [ ] **Localizar y reemplazar el endpoint `toggle_recognition`:**

Buscar `@router.post("/{mission_id}/recognition"` y reemplazar el cuerpo completo:

```python
@router.post("/{mission_id}/recognition", response_model=MissionResponse)
async def toggle_recognition(
    mission_id: uuid.UUID,
    body: RecognitionToggleRequest,
    current_user: CurrentUser = Depends(_staff),
    db: AsyncSession = Depends(get_db),
) -> MissionResponse:
    """Activa/desactiva detección de personas y reconocimiento facial. Admin y buscador."""
    try:
        result = await db.execute(select(Mission).where(Mission.id == mission_id))
        mission: Mission | None = result.scalar_one_or_none()
    except Exception:
        logger.error("Error al buscar misión id=%s", mission_id, exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

    if mission is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Misión no encontrada")

    mission.recognition_active = body.person_detection
    mission.face_recognition_active = body.face_recognition

    # Broadcast a todos los conectados a esta misión
    from app.core.ws_manager import ws_manager
    await ws_manager.broadcast(f"mission:{mission_id}", {
        "type": "mission_recognition",
        "person_detection": body.person_detection,
        "face_recognition": body.face_recognition,
    })

    return _mission_to_response(mission)
```

- [ ] **Actualizar `_mission_to_response` para incluir `face_recognition_active`:**

En la función `_mission_to_response`, agregar al `MissionResponse(...)`:

```python
face_recognition_active=m.face_recognition_active,
```

- [ ] **Verificar que `RecognitionToggleRequest` viene del schema actualizado** (ya importado).

- [ ] **Commit:**

```bash
git add backend/app/routers/missions.py
git commit -m "feat: recognition endpoint acepta person_detection + face_recognition"
```

---

## Task 5: Router drones — stream-event webhook + URLs en respuesta

**Files:**
- Modify: `backend/app/routers/drones.py`

- [ ] **Agregar endpoint `stream_event` al router de drones:**

Agregar después del endpoint `list_active_streams`:

```python
@router.post("/stream-event")
async def stream_event(
    serial: str,
    event: str,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Webhook llamado por MediaMTX cuando un stream conecta o desconecta.
    Sin autenticación JWT — solo accesible desde la red interna Docker.
    event: 'connect' | 'disconnect'
    """
    if event not in ("connect", "disconnect"):
        return {"ok": False, "reason": "event desconocido"}

    if not serial or len(serial) > 100:
        return {"ok": False, "reason": "serial inválido"}

    if event == "connect":
        try:
            result = await db.execute(
                select(Drone).where(Drone.serial_number == serial)
            )
            existing = result.scalar_one_or_none()

            if existing is None:
                # Auto-crear dron con datos mínimos
                drone = Drone(
                    serial_number=serial,
                    model=f"Dron {serial[:8]}",
                    manufacturer="Sin configurar",
                    auto_created=True,
                )
                db.add(drone)
                await db.flush()
                logger.info("Dron auto-creado por stream: serial=%s", serial)

                # Broadcast a admins
                from app.core.ws_manager import ws_manager
                # Broadcast global a sala de administración si existe
                await ws_manager.broadcast("admin", {
                    "type": "drone_discovered",
                    "serial": serial,
                    "model": drone.model,
                })
        except Exception:
            logger.error("Error en stream-event serial=%s", serial, exc_info=True)

    return {"ok": True}
```

- [ ] **Actualizar `list_drones` para incluir `rtmp_url` y `hls_url` en cada dron:**

En el endpoint `list_drones`, reemplazar el return:

```python
host = settings.server_host
return [
    DroneResponse(
        **DroneResponse.model_validate(d).model_dump(),
        rtmp_url=f"rtmp://{host}:1935/{d.serial_number}",
        hls_url=f"http://{host}:8888/{d.serial_number}/index.m3u8",
    )
    for d in drones
]
```

- [ ] **Agregar `auto_created` a `DroneResponse.model_validate` en el endpoint `create_drone`** si aplica (el campo ya viene del ORM).

- [ ] **Commit:**

```bash
git add backend/app/routers/drones.py
git commit -m "feat: drones — stream-event webhook auto-discovery, rtmp_url y hls_url en respuesta"
```

---

## Task 6: Router field_reports — CRUD completo

**Files:**
- Create: `backend/app/routers/field_reports.py`

- [ ] **Crear el archivo completo:**

```python
# =============================================================================
# AEROFINDER Backend — Router: Field Reports
# Flujo: rescatista crea solicitud → admin aprueba → rescatista sube fotos →
#        trigger AI análisis → resultado por WS + Push
# =============================================================================

import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.core.deps import CurrentUser, get_current_user, require_role
from app.core.ws_manager import ws_manager
from app.db.session import get_db
from app.models.enums import RoleName
from app.models.field_reports import FieldReport, FieldReportPhoto, FieldReportMatch
from app.models.persons import Person
from app.models.auth import User
from app.schemas.field_reports import (
    ConfirmPhotoRequest,
    FieldReportCreate,
    FieldReportReject,
    FieldReportResponse,
    FieldReportMatchResponse,
    FieldReportPhotoResponse,
    UploadUrlResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/field-reports", tags=["field-reports"])

_admin   = require_role(RoleName.admin)
_staff   = require_role(RoleName.admin, RoleName.buscador)
_readers = require_role(RoleName.admin, RoleName.buscador, RoleName.ayudante)

MIN_PHOTOS = 3
MAX_PHOTOS = 5


def _report_to_response(report: FieldReport, rescuer_name: str) -> FieldReportResponse:
    matches = []
    for m in report.matches:
        matches.append(FieldReportMatchResponse(
            person_id=m.person_id,
            person_name="",        # se llena en el endpoint con join
            similarity_score=float(m.similarity_score),
            rank=m.rank,
        ))
    return FieldReportResponse(
        id=report.id,
        mission_id=report.mission_id,
        rescuer_id=report.rescuer_id,
        rescuer_name=rescuer_name,
        status=report.status,
        notes=report.notes,
        location_lat=float(report.location_lat) if report.location_lat else None,
        location_lon=float(report.location_lon) if report.location_lon else None,
        approved_by=report.approved_by,
        approved_at=report.approved_at,
        completed_at=report.completed_at,
        created_at=report.created_at,
        photos=[FieldReportPhotoResponse.model_validate(p) for p in report.photos],
        matches=matches,
    )


# ── POST /missions/{mission_id}/field-reports ─────────────────────────────────
# Este endpoint se registra desde missions router como sub-recurso
# pero el router principal es /field-reports para el detalle y acciones

@router.get("/{report_id}", response_model=FieldReportResponse)
async def get_report(
    report_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> FieldReportResponse:
    """Detalle de un reporte. Admin, buscador, o el rescatista propietario."""
    try:
        result = await db.execute(
            select(FieldReport)
            .options(selectinload(FieldReport.photos), selectinload(FieldReport.matches))
            .where(FieldReport.id == report_id)
        )
        report: FieldReport | None = result.scalar_one_or_none()
    except Exception:
        logger.error("Error al obtener report id=%s", report_id, exc_info=True)
        raise HTTPException(status_code=500, detail="Error interno")

    if report is None:
        raise HTTPException(status_code=404, detail="Reporte no encontrado")

    # Solo admin/buscador o el rescatista propietario
    allowed_roles = {RoleName.admin, RoleName.buscador}
    if current_user.role.name not in allowed_roles and current_user.id != report.rescuer_id:
        raise HTTPException(status_code=403, detail="Sin acceso")

    # Cargar nombre del rescatista
    user_result = await db.execute(select(User).where(User.id == report.rescuer_id))
    rescuer = user_result.scalar_one_or_none()
    rescuer_name = rescuer.full_name if rescuer else str(report.rescuer_id)

    # Enriquecer matches con nombres de personas
    resp = _report_to_response(report, rescuer_name)
    for i, match in enumerate(report.matches):
        person_result = await db.execute(select(Person).where(Person.id == match.person_id))
        person = person_result.scalar_one_or_none()
        if person:
            resp.matches[i].person_name = person.full_name

    return resp


@router.patch("/{report_id}/approve", response_model=FieldReportResponse)
async def approve_report(
    report_id: uuid.UUID,
    current_user: CurrentUser = Depends(_admin),
    db: AsyncSession = Depends(get_db),
) -> FieldReportResponse:
    """Admin aprueba el reporte. El rescatista recibe notificación WS."""
    try:
        result = await db.execute(
            select(FieldReport)
            .options(selectinload(FieldReport.photos), selectinload(FieldReport.matches))
            .where(FieldReport.id == report_id)
        )
        report: FieldReport | None = result.scalar_one_or_none()
    except Exception:
        logger.error("Error al buscar report id=%s", report_id, exc_info=True)
        raise HTTPException(status_code=500, detail="Error interno")

    if report is None:
        raise HTTPException(status_code=404, detail="Reporte no encontrado")

    if report.status != "pending":
        raise HTTPException(status_code=400, detail=f"Reporte en estado '{report.status}', no se puede aprobar")

    report.status = "approved"
    report.approved_by = current_user.id
    report.approved_at = datetime.now(timezone.utc)

    # Notificar al rescatista
    await ws_manager.broadcast(f"mission:{report.mission_id}", {
        "type": "field_report_approved",
        "report_id": str(report_id),
    })

    user_result = await db.execute(select(User).where(User.id == report.rescuer_id))
    rescuer = user_result.scalar_one_or_none()
    return _report_to_response(report, rescuer.full_name if rescuer else "")


@router.patch("/{report_id}/reject", response_model=FieldReportResponse)
async def reject_report(
    report_id: uuid.UUID,
    body: FieldReportReject,
    current_user: CurrentUser = Depends(_admin),
    db: AsyncSession = Depends(get_db),
) -> FieldReportResponse:
    """Admin rechaza el reporte con un motivo."""
    try:
        result = await db.execute(
            select(FieldReport)
            .options(selectinload(FieldReport.photos), selectinload(FieldReport.matches))
            .where(FieldReport.id == report_id)
        )
        report: FieldReport | None = result.scalar_one_or_none()
    except Exception:
        logger.error("Error al buscar report id=%s", report_id, exc_info=True)
        raise HTTPException(status_code=500, detail="Error interno")

    if report is None:
        raise HTTPException(status_code=404, detail="Reporte no encontrado")

    if report.status != "pending":
        raise HTTPException(status_code=400, detail=f"Reporte en estado '{report.status}'")

    report.status = "rejected"

    await ws_manager.broadcast(f"mission:{report.mission_id}", {
        "type": "field_report_rejected",
        "report_id": str(report_id),
        "reason": body.reason,
    })

    user_result = await db.execute(select(User).where(User.id == report.rescuer_id))
    rescuer = user_result.scalar_one_or_none()
    return _report_to_response(report, rescuer.full_name if rescuer else "")


@router.post("/{report_id}/photos/upload-url", response_model=UploadUrlResponse)
async def get_upload_url(
    report_id: uuid.UUID,
    photo_index: int = Query(ge=1, le=MAX_PHOTOS),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UploadUrlResponse:
    """Genera presigned URL para subir una foto a MinIO. Solo el rescatista propietario."""
    try:
        result = await db.execute(select(FieldReport).where(FieldReport.id == report_id))
        report: FieldReport | None = result.scalar_one_or_none()
    except Exception:
        logger.error("Error al buscar report id=%s", report_id, exc_info=True)
        raise HTTPException(status_code=500, detail="Error interno")

    if report is None:
        raise HTTPException(status_code=404, detail="Reporte no encontrado")

    if current_user.id != report.rescuer_id:
        raise HTTPException(status_code=403, detail="Solo el rescatista puede subir fotos")

    if report.status != "approved":
        raise HTTPException(status_code=400, detail="El reporte debe estar aprobado antes de subir fotos")

    from app.core.minio import minio_client
    object_name = f"field-reports/{report_id}/foto_{photo_index}_{uuid.uuid4().hex[:8]}.jpg"
    bucket = settings.minio_bucket_photos

    try:
        presigned_url = minio_client.presigned_put_object(bucket, object_name, expires=300)
    except Exception:
        logger.error("Error generando presigned URL report=%s", report_id, exc_info=True)
        raise HTTPException(status_code=500, detail="Error generando URL de subida")

    return UploadUrlResponse(
        presigned_url=presigned_url,
        object_name=object_name,
        photo_index=photo_index,
    )


@router.post("/{report_id}/photos/confirm")
async def confirm_photo(
    report_id: uuid.UUID,
    body: ConfirmPhotoRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Confirma que la foto fue subida a MinIO y la registra en DB."""
    try:
        result = await db.execute(
            select(FieldReport)
            .options(selectinload(FieldReport.photos))
            .where(FieldReport.id == report_id)
        )
        report: FieldReport | None = result.scalar_one_or_none()
    except Exception:
        logger.error("Error al buscar report id=%s", report_id, exc_info=True)
        raise HTTPException(status_code=500, detail="Error interno")

    if report is None:
        raise HTTPException(status_code=404, detail="Reporte no encontrado")

    if current_user.id != report.rescuer_id:
        raise HTTPException(status_code=403, detail="Sin acceso")

    if report.status != "approved":
        raise HTTPException(status_code=400, detail="Reporte no está en estado aprobado")

    if len(report.photos) >= MAX_PHOTOS:
        raise HTTPException(status_code=400, detail=f"Máximo {MAX_PHOTOS} fotos por reporte")

    # Verificar que el objeto existe en MinIO
    from app.core.minio import minio_client
    try:
        minio_client.stat_object(settings.minio_bucket_photos, body.object_name)
    except Exception:
        raise HTTPException(status_code=400, detail="La foto no fue encontrada en MinIO")

    photo = FieldReportPhoto(field_report_id=report_id, minio_object=body.object_name)
    db.add(photo)
    await db.flush()

    return {"ok": True, "total_photos": len(report.photos) + 1}


@router.post("/{report_id}/analyze")
async def trigger_analysis(
    report_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Dispara el análisis IA. Solo el rescatista propietario.
    Requiere status=approved y al menos 3 fotos confirmadas.
    """
    try:
        result = await db.execute(
            select(FieldReport)
            .options(selectinload(FieldReport.photos))
            .where(FieldReport.id == report_id)
        )
        report: FieldReport | None = result.scalar_one_or_none()
    except Exception:
        logger.error("Error al buscar report id=%s", report_id, exc_info=True)
        raise HTTPException(status_code=500, detail="Error interno")

    if report is None:
        raise HTTPException(status_code=404, detail="Reporte no encontrado")

    if current_user.id != report.rescuer_id:
        raise HTTPException(status_code=403, detail="Sin acceso")

    if report.status != "approved":
        raise HTTPException(status_code=400, detail="El reporte debe estar aprobado")

    if len(report.photos) < MIN_PHOTOS:
        raise HTTPException(
            status_code=400,
            detail=f"Se necesitan al menos {MIN_PHOTOS} fotos (hay {len(report.photos)})"
        )

    report.status = "analyzing"

    # Encolar análisis en Redis para que el AI worker lo procese
    import json
    from app.db.redis import get_redis
    redis = await get_redis()
    await redis.rpush("aerofinder:field_report_analysis", json.dumps({
        "report_id": str(report_id),
        "mission_id": str(report.mission_id),
    }))

    logger.info("Análisis encolado report_id=%s", report_id)
    return {"ok": True, "status": "analyzing"}
```

- [ ] **Commit:**

```bash
git add backend/app/routers/field_reports.py
git commit -m "feat: router field_reports — CRUD, presigned URLs, trigger análisis"
```

---

## Task 7: Endpoint POST /missions/{id}/field-reports y router push

**Files:**
- Modify: `backend/app/routers/missions.py`
- Create: `backend/app/routers/push.py`

- [ ] **Agregar endpoint de creación de field report en missions router:**

En `backend/app/routers/missions.py`, agregar al final (antes del cierre):

```python
@router.post("/{mission_id}/field-reports", status_code=status.HTTP_201_CREATED)
async def create_field_report(
    mission_id: uuid.UUID,
    body: "FieldReportCreate",
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Rescatista crea una solicitud de análisis. Notifica a admins por WS."""
    from app.models.field_reports import FieldReport as FR
    from app.schemas.field_reports import FieldReportCreate as FRC
    from decimal import Decimal

    # Verificar que la misión existe y está activa
    try:
        result = await db.execute(select(Mission).where(Mission.id == mission_id))
        mission: Mission | None = result.scalar_one_or_none()
    except Exception:
        logger.error("Error al buscar misión id=%s", mission_id, exc_info=True)
        raise HTTPException(status_code=500, detail="Error interno")

    if mission is None:
        raise HTTPException(status_code=404, detail="Misión no encontrada")

    if mission.status != "active":
        raise HTTPException(status_code=400, detail="La misión no está activa")

    report = FR(
        mission_id=mission_id,
        rescuer_id=current_user.id,
        notes=body.notes,
        location_lat=Decimal(str(body.location_lat)) if body.location_lat else None,
        location_lon=Decimal(str(body.location_lon)) if body.location_lon else None,
    )
    db.add(report)
    await db.flush()

    # Notificar a admins en la misión
    from app.core.ws_manager import ws_manager
    await ws_manager.broadcast(f"mission:{mission_id}", {
        "type": "field_report_request",
        "report_id": str(report.id),
        "rescuer_name": current_user.full_name,
        "location_lat": body.location_lat,
        "location_lon": body.location_lon,
    })

    return {"id": str(report.id), "status": "pending"}
```

Agregar al bloque de imports en missions.py:
```python
from app.schemas.field_reports import FieldReportCreate
```

- [ ] **Crear `backend/app/routers/push.py`:**

```python
# =============================================================================
# AEROFINDER Backend — Router: Web Push Subscriptions
# Gestiona suscripciones PWA para notificaciones push.
# =============================================================================

import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import CurrentUser, get_current_user
from app.db.session import get_db
from app.models.field_reports import PushSubscription

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/push", tags=["push"])


class PushSubscribeRequest(BaseModel):
    endpoint: str
    p256dh: str
    auth: str


class PushUnsubscribeRequest(BaseModel):
    endpoint: str


@router.post("/subscribe", status_code=status.HTTP_201_CREATED)
async def subscribe(
    body: PushSubscribeRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Registra o actualiza una suscripción Web Push para este usuario."""
    try:
        # Upsert: si ya existe el endpoint para este usuario, actualizar
        result = await db.execute(
            select(PushSubscription).where(
                PushSubscription.user_id == current_user.id,
                PushSubscription.endpoint == body.endpoint,
            )
        )
        existing = result.scalar_one_or_none()

        if existing:
            existing.p256dh = body.p256dh
            existing.auth_key = body.auth
        else:
            sub = PushSubscription(
                user_id=current_user.id,
                endpoint=body.endpoint,
                p256dh=body.p256dh,
                auth_key=body.auth,
            )
            db.add(sub)

        await db.flush()
    except Exception:
        logger.error("Error al guardar push subscription user=%s", current_user.id, exc_info=True)
        raise HTTPException(status_code=500, detail="Error interno")

    return {"ok": True}


@router.delete("/subscribe")
async def unsubscribe(
    body: PushUnsubscribeRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Elimina una suscripción Web Push."""
    try:
        await db.execute(
            delete(PushSubscription).where(
                PushSubscription.user_id == current_user.id,
                PushSubscription.endpoint == body.endpoint,
            )
        )
    except Exception:
        logger.error("Error al eliminar push subscription user=%s", current_user.id, exc_info=True)
        raise HTTPException(status_code=500, detail="Error interno")

    return {"ok": True}
```

- [ ] **Commit:**

```bash
git add backend/app/routers/missions.py backend/app/routers/push.py
git commit -m "feat: POST /missions/{id}/field-reports + router push subscriptions"
```

---

## Task 8: Registrar routers en main.py + dependencia pywebpush

**Files:**
- Modify: `backend/app/main.py`
- Modify: `backend/requirements.txt`

- [ ] **Agregar imports y registros en `backend/app/main.py`:**

En el bloque de imports de routers, agregar:

```python
from app.routers import field_reports as field_reports_router
from app.routers import push as push_router
```

En el bloque de `app.include_router(...)`, agregar antes del ws_router:

```python
app.include_router(field_reports_router.router)
app.include_router(push_router.router)
```

- [ ] **Agregar `pywebpush` a `backend/requirements.txt`:**

```
pywebpush==2.0.0
```

- [ ] **Rebuild y verificar que los endpoints aparecen en `/docs`:**

```bash
docker compose up -d --build backend
curl -s http://localhost:8000/openapi.json | python3 -c "
import sys, json
spec = json.load(sys.stdin)
paths = [p for p in spec['paths'] if 'field-report' in p or 'push' in p]
print('\n'.join(paths))
"
# Esperado: /field-reports/{report_id}, /push/subscribe, etc.
```

- [ ] **Commit:**

```bash
git add backend/app/main.py backend/requirements.txt
git commit -m "feat: registrar routers field_reports y push en main.py"
```

---

## Task 9: MediaMTX — configurar webhook auto-discovery

**Files:**
- Modify: `docker-compose.yml`

- [ ] **Agregar variables de entorno al servicio `mediamtx` en docker-compose.yml:**

Buscar el servicio `mediamtx` y agregar en su sección `environment`:

```yaml
environment:
  RTSP_RUNONPUBLISH: >-
    curl -sf -X POST
    "http://backend:8000/drones/stream-event?serial=$$MTX_PATH&event=connect"
    || true
  RTSP_RUNONUNPUBLISH: >-
    curl -sf -X POST
    "http://backend:8000/drones/stream-event?serial=$$MTX_PATH&event=disconnect"
    || true
```

> **Nota:** `$$MTX_PATH` es la variable de MediaMTX que contiene el nombre del stream (= serial del dron). El `|| true` evita que MediaMTX falle si el backend no responde.

- [ ] **Reiniciar mediamtx:**

```bash
docker compose up -d mediamtx
```

- [ ] **Verificar el webhook simulando una conexión:**

```bash
# Simular que un dron con serial "TEST001" se conecta
curl -X POST "http://localhost:8000/drones/stream-event?serial=TEST001&event=connect"
# Esperado: {"ok": true}

# Verificar que el dron fue auto-creado en DB
docker compose exec postgres psql -U postgres -d aerofinder \
  -c "SELECT serial_number, model, auto_created FROM drones WHERE serial_number='TEST001';"
# Esperado: TEST001 | Dron TEST001 | t
```

- [ ] **Commit:**

```bash
git add docker-compose.yml
git commit -m "feat: mediamtx webhook auto-discovery de drones al conectar RTMP"
```

---

## Task 10: AI Worker — supervisor multi-dron

**Files:**
- Modify: `ai_worker/main.py`

- [ ] **Refactorizar `ai_worker/main.py` para usar supervisor loop:**

Identificar la función principal del worker loop actual (probablemente `run_worker` o similar). Reemplazar con el patrón supervisor:

```python
import asyncio
import logging
from typing import Any

logger = logging.getLogger(__name__)

# Mantener referencia a las tasks activas: serial → asyncio.Task
_active_tasks: dict[str, asyncio.Task] = {}


async def get_active_mission_streams(db_pool, mediamtx_url: str) -> set[str]:
    """
    Retorna los serials de drones que:
    1. Tienen un stream activo en MediaMTX
    2. Están asignados a una misión con status='active'
    """
    import httpx
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{mediamtx_url}/v3/paths/list")
            resp.raise_for_status()
            active_serials = {
                p["name"] for p in resp.json().get("items", [])
                if p.get("ready") and p.get("name")
            }
    except Exception:
        logger.warning("No se pudo contactar MediaMTX", exc_info=True)
        return set()

    if not active_serials:
        return set()

    # Filtrar: solo los que están en misiones activas
    async with db_pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT d.serial_number
            FROM drones d
            JOIN mission_drones md ON md.drone_id = d.id AND md.left_at IS NULL
            JOIN missions m ON m.id = md.mission_id
            WHERE m.status = 'active'
              AND d.serial_number = ANY($1::text[])
        """, list(active_serials))

    return {row["serial_number"] for row in rows}


async def supervisor_loop(db_pool, redis_pool, mediamtx_url: str, settings: Any) -> None:
    """Loop principal: arranca/cancela una task por stream activo."""
    global _active_tasks

    while True:
        try:
            active_streams = await get_active_mission_streams(db_pool, mediamtx_url)

            # Arrancar tasks para streams nuevos
            for serial in active_streams:
                if serial not in _active_tasks or _active_tasks[serial].done():
                    logger.info("Iniciando procesamiento stream: %s", serial)
                    _active_tasks[serial] = asyncio.create_task(
                        process_stream(serial, db_pool, redis_pool, settings),
                        name=f"stream-{serial}"
                    )

            # Cancelar tasks de streams que ya no están activos
            for serial in list(_active_tasks.keys()):
                if serial not in active_streams:
                    task = _active_tasks.pop(serial)
                    if not task.done():
                        logger.info("Cancelando stream inactivo: %s", serial)
                        task.cancel()

        except Exception:
            logger.error("Error en supervisor_loop", exc_info=True)

        await asyncio.sleep(10)
```

La función `process_stream(serial, ...)` es la lógica existente del worker actual, refactorizada para recibir el serial como parámetro en lugar de buscarlo sola.

Dentro de `process_stream`, al cargar los flags de reconocimiento, usar:

```python
row = await conn.fetchrow("""
    SELECT m.recognition_active, m.face_recognition_active
    FROM missions m
    JOIN mission_drones md ON md.mission_id = m.id AND md.left_at IS NULL
    JOIN drones d ON d.id = md.drone_id
    WHERE d.serial_number = $1 AND m.status = 'active'
    LIMIT 1
""", serial)
person_detection = row["recognition_active"] if row else False
face_recognition = row["face_recognition_active"] if row else False
```

- [ ] **Commit:**

```bash
git add ai_worker/main.py
git commit -m "feat: ai worker — supervisor loop multi-dron con asyncio.Task por stream"
```

---

## Task 11: AI Worker — analizador de field reports

**Files:**
- Create: `ai_worker/field_report_analyzer.py`

- [ ] **Crear `ai_worker/field_report_analyzer.py`:**

```python
# =============================================================================
# AEROFINDER AI Worker — Field Report Analyzer
# Consume la cola Redis 'aerofinder:field_report_analysis'.
# Para cada reporte: descarga fotos de MinIO, extrae embeddings FaceNet,
# promedia, busca top-3 en pgvector, guarda matches, notifica por WS.
# =============================================================================

import asyncio
import json
import logging
import uuid
from io import BytesIO

import numpy as np

logger = logging.getLogger(__name__)

QUEUE_KEY = "aerofinder:field_report_analysis"
TOP_K = 3


async def run_field_report_analyzer(db_pool, redis_pool, minio_client, face_model) -> None:
    """Loop que consume la cola de análisis de field reports."""
    logger.info("Field report analyzer iniciado, escuchando cola %s", QUEUE_KEY)

    while True:
        try:
            # BLPOP: bloquea hasta que haya un item (timeout 5s para no bloquear shutdown)
            item = await redis_pool.blpop(QUEUE_KEY, timeout=5)
            if item is None:
                continue

            _, raw = item
            payload = json.loads(raw)
            report_id = uuid.UUID(payload["report_id"])
            mission_id = uuid.UUID(payload["mission_id"])

            await analyze_report(report_id, mission_id, db_pool, redis_pool, minio_client, face_model)

        except asyncio.CancelledError:
            break
        except Exception:
            logger.error("Error en field_report_analyzer loop", exc_info=True)
            await asyncio.sleep(2)


async def analyze_report(
    report_id: uuid.UUID,
    mission_id: uuid.UUID,
    db_pool,
    redis_pool,
    minio_client,
    face_model,
) -> None:
    """
    Analiza las fotos de un field report:
    1. Descarga fotos de MinIO
    2. Extrae embeddings FaceNet de cada foto
    3. Promedia los embeddings
    4. Busca top-3 similares en pgvector (personas de la misión)
    5. Guarda matches en DB
    6. Notifica resultado por Redis → WebSocket + Push
    """
    logger.info("Analizando field report %s", report_id)

    async with db_pool.acquire() as conn:
        # Cargar fotos del reporte
        photos = await conn.fetch(
            "SELECT minio_object FROM field_report_photos WHERE field_report_id = $1",
            report_id,
        )

        if not photos:
            logger.warning("Report %s sin fotos, abortando análisis", report_id)
            await conn.execute(
                "UPDATE field_reports SET status='completed' WHERE id=$1", report_id
            )
            return

        bucket = "aerofinder-photos"  # desde settings
        embeddings = []

        for photo in photos:
            obj_name = photo["minio_object"]
            try:
                # Descargar foto desde MinIO
                response = minio_client.get_object(bucket, obj_name)
                img_bytes = BytesIO(response.read())
                response.close()
                response.release_conn()

                # Extraer embedding FaceNet
                import cv2
                import numpy as np_local
                img_array = np_local.frombuffer(img_bytes.getvalue(), np_local.uint8)
                img = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
                if img is None:
                    continue

                faces = face_model.get(img)
                if not faces:
                    logger.debug("Sin rostro detectado en %s", obj_name)
                    continue

                # Tomar el rostro más grande/central
                face = max(faces, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))
                embeddings.append(face.normed_embedding)

            except Exception:
                logger.error("Error procesando foto %s", obj_name, exc_info=True)

        if not embeddings:
            logger.warning("Report %s: ninguna foto tiene rostro detectable", report_id)
            await conn.execute(
                "UPDATE field_reports SET status='completed', completed_at=now() WHERE id=$1",
                report_id,
            )
            await _broadcast_result(redis_pool, mission_id, report_id, [])
            return

        # Promedio de embeddings → más robusto que una sola foto
        avg_embedding = np.mean(embeddings, axis=0)
        avg_embedding = avg_embedding / np.linalg.norm(avg_embedding)  # re-normalizar

        # Buscar top-3 en pgvector entre personas de la misión
        rows = await conn.fetch("""
            SELECT pp.person_id, p.full_name,
                   1 - (pp.face_embedding <=> $1::vector) AS similarity
            FROM person_photos pp
            JOIN persons p ON p.id = pp.person_id
            JOIN mission_drones md ON md.mission_id = $2 AND md.left_at IS NULL
            WHERE pp.face_embedding IS NOT NULL
              AND p.status != 'found'
            ORDER BY pp.face_embedding <=> $1::vector
            LIMIT $3
        """, avg_embedding.tolist(), mission_id, TOP_K)

        matches = []
        for rank, row in enumerate(rows, start=1):
            score = float(row["similarity"])
            person_id = row["person_id"]
            full_name = row["full_name"]

            await conn.execute("""
                INSERT INTO field_report_matches
                  (field_report_id, person_id, similarity_score, rank)
                VALUES ($1, $2, $3, $4)
            """, report_id, person_id, score, rank)

            matches.append({
                "rank": rank,
                "person_id": str(person_id),
                "person_name": full_name,
                "similarity_score": round(score, 4),
            })

        # Marcar reporte como completado
        await conn.execute(
            "UPDATE field_reports SET status='completed', completed_at=now() WHERE id=$1",
            report_id,
        )

    await _broadcast_result(redis_pool, mission_id, report_id, matches)
    logger.info("Report %s completado. Top match: %s", report_id,
                matches[0] if matches else "ninguno")


async def _broadcast_result(redis_pool, mission_id, report_id, matches):
    """Publica resultado en Redis Stream para que el backend lo transmita por WS."""
    payload = json.dumps({
        "type": "field_report_result",
        "report_id": str(report_id),
        "matches": matches,
    })
    await redis_pool.publish(f"ws:mission:{mission_id}", payload)
    # También encolar para push notifications
    await redis_pool.rpush("aerofinder:push_notifications", json.dumps({
        "mission_id": str(mission_id),
        "report_id": str(report_id),
        "matches": matches,
    }))
```

- [ ] **Integrar el analyzer en el main del AI worker:**

En `ai_worker/main.py`, en la función principal `async def main()`:

```python
# Arrancar el field report analyzer en paralelo con el supervisor
asyncio.create_task(
    run_field_report_analyzer(db_pool, redis_pool, minio_client, face_model),
    name="field-report-analyzer"
)
```

- [ ] **Commit:**

```bash
git add ai_worker/field_report_analyzer.py ai_worker/main.py
git commit -m "feat: field_report_analyzer — FaceNet multi-foto promediado + pgvector top-3"
```

---

## Task 12: Verificación end-to-end del backend

- [ ] **Levantar todo:**

```bash
./aerofinder.sh start
```

- [ ] **Verificar endpoints con curl:**

```bash
# Login
TOKEN=$(curl -s -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@aerofinder.local","password":"AeroAdmin2024!"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# Listar drones (deben incluir rtmp_url y hls_url)
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:8000/drones/ \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['rtmp_url'] if d else 'sin drones')"

# Verificar campo face_recognition_active en misiones
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:8000/missions/ \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0].get('face_recognition_active','CAMPO FALTA') if d else 'sin misiones')"

# Test auto-discovery
curl -X POST "http://localhost:8000/drones/stream-event?serial=DRON_TEST_99&event=connect"
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:8000/drones/?limit=5" \
  | python3 -c "import sys,json; [print(d['serial_number'], d['auto_created']) for d in json.load(sys.stdin)]"
# Esperado: DRON_TEST_99 True
```

- [ ] **Commit final:**

```bash
git add .
git commit -m "feat: backend completo — multi-dron, field reports, auto-discovery, AI analyzer"
```

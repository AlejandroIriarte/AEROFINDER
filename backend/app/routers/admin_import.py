# =============================================================================
# AEROFINDER Backend — Router: Importación batch desde sistemas gubernamentales
#
# POST /admin/import/missing-persons  — importa CSV con personas desaparecidas
# GET  /admin/import/missing-persons/template — descarga plantilla CSV
#
# Solo accesible por admin.
# Formato CSV: UTF-8, separador coma.
# =============================================================================

import csv
import hashlib
import io
import logging
import uuid
from datetime import date, datetime
from typing import Any, Optional

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import CurrentUser, require_role
from app.db.session import get_db
from app.models.enums import (
    FileRetentionPolicy,
    FileUploadStatus,
    MissingPersonStatus,
    PhotoFaceAngle,
    RoleName,
)
from app.models.files import File as FileModel
from app.models.persons import MissingPerson, PersonPhoto
from app.config import settings
from app.services.minio_service import minio_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/admin/import", tags=["importación"])

_admin = require_role(RoleName.admin)

# Campos obligatorios del CSV
_REQUIRED_FIELDS = {"full_name", "disappeared_at", "reporter_name", "reporter_contact"}

# Plantilla CSV con una fila de ejemplo
_CSV_TEMPLATE_HEADERS = [
    "full_name", "disappeared_at", "date_of_birth", "age_at_disappearance",
    "gender", "physical_description", "height_cm", "last_known_clothing",
    "last_known_location", "last_seen_at", "reporter_name", "reporter_contact",
    "photo_url_1", "photo_url_2", "photo_url_3",
]
_CSV_TEMPLATE_EXAMPLE = [
    "Juan Pérez", "2024-03-15", "1990-05-20", "34",
    "male", "1.75m cabello negro", "175", "jean azul chompa roja",
    "La Paz Bolivia", "2024-03-15T14:30:00", "María Pérez", "+591-70000000",
    "", "", "",
]


def _parse_date(value: str, field: str) -> Optional[date]:
    """Parsea fecha YYYY-MM-DD. Retorna None si vacío, lanza ValueError si inválido."""
    if not value.strip():
        return None
    try:
        return date.fromisoformat(value.strip())
    except ValueError:
        raise ValueError(f"'{field}' debe ser YYYY-MM-DD, recibido: '{value}'")


def _parse_datetime(value: str, field: str) -> Optional[datetime]:
    """Parsea datetime ISO 8601. Retorna None si vacío."""
    if not value.strip():
        return None
    try:
        return datetime.fromisoformat(value.strip())
    except ValueError:
        raise ValueError(f"'{field}' debe ser ISO 8601, recibido: '{value}'")


def _parse_int(value: str, field: str) -> Optional[int]:
    """Parsea entero. Retorna None si vacío."""
    if not value.strip():
        return None
    try:
        return int(value.strip())
    except ValueError:
        raise ValueError(f"'{field}' debe ser un número entero, recibido: '{value}'")


async def _download_and_store_photo(
    url: str,
    person_id: uuid.UUID,
    db: AsyncSession,
) -> Optional[PersonPhoto]:
    """
    Descarga una imagen desde URL externa y la sube a MinIO.
    Crea registros File + PersonPhoto. Retorna None si falla.
    Los errores no abortan la fila, se registran como warning.
    """
    if not url.strip():
        return None
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url, follow_redirects=True)
        if response.status_code != 200:
            logger.warning("Error HTTP %d al descargar foto URL=%s", response.status_code, url)
            return None

        content_type = response.headers.get("content-type", "").lower()
        if not any(ct in content_type for ct in ("jpeg", "jpg", "png", "webp")):
            logger.warning("Content-Type inválido '%s' para URL=%s", content_type, url)
            return None

        image_bytes = response.content
        if len(image_bytes) > 5 * 1024 * 1024:
            logger.warning("Foto demasiado grande (>5MB) URL=%s", url)
            return None

        photo_id   = uuid.uuid4()
        object_key = f"persons/{person_id}/photos/{photo_id}.jpg"
        mime_type  = "image/jpeg"
        sha256_hash = hashlib.sha256(image_bytes).hexdigest()

        import asyncio
        await asyncio.get_running_loop().run_in_executor(
            None,
            lambda: minio_service.upload_file(
                bucket=settings.minio_bucket_photos,
                object_key=object_key,
                data=image_bytes,
                mime_type=mime_type,
                sha256_hash=sha256_hash,
                size_bytes=len(image_bytes),
            ),
        )

        file_record = FileModel(
            id=photo_id,
            bucket=settings.minio_bucket_photos,
            object_key=object_key,
            sha256_hash=sha256_hash,
            size_bytes=len(image_bytes),
            mime_type=mime_type,
            upload_status=FileUploadStatus.uploaded,
            retention_policy=FileRetentionPolicy.permanent,
        )
        photo_record = PersonPhoto(
            id=photo_id,
            missing_person_id=person_id,
            file_id=photo_id,
            face_angle=PhotoFaceAngle.unknown,
            is_active=True,
        )
        db.add(file_record)
        db.add(photo_record)
        await db.flush()
        return photo_record

    except Exception:
        logger.error("Error al descargar/almacenar foto URL=%s", url, exc_info=True)
        return None


@router.get("/missing-persons/template")
async def download_csv_template(
    _: CurrentUser = Depends(_admin),
) -> StreamingResponse:
    """Descarga la plantilla CSV vacía con headers y fila de ejemplo."""
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(_CSV_TEMPLATE_HEADERS)
    writer.writerow(_CSV_TEMPLATE_EXAMPLE)

    output.seek(0)
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode("utf-8")),
        media_type="text/csv",
        headers={
            "Content-Disposition": "attachment; filename=aerofinder_plantilla_importacion.csv"
        },
    )


@router.post("/missing-persons")
async def import_missing_persons_csv(
    file: UploadFile = File(..., description="Archivo CSV con personas desaparecidas"),
    dry_run: bool = Query(default=False, description="Si es True, valida sin persistir"),
    current_user: CurrentUser = Depends(_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Importa personas desaparecidas desde un archivo CSV gubernamental.
    Las personas se crean con status=active y source=gov_import.
    Las fotos se descargan desde las URLs provistas y se suben a MinIO.
    """
    if not file.filename or not file.filename.endswith(".csv"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="El archivo debe ser un CSV (.csv)",
        )

    try:
        raw_bytes = await file.read()
        content   = raw_bytes.decode("utf-8", errors="replace")
    except Exception:
        logger.error("Error al leer archivo CSV de importación", exc_info=True)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No se pudo leer el archivo")

    reader = csv.DictReader(io.StringIO(content))

    # Verificar que tiene los campos obligatorios
    if reader.fieldnames is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="CSV vacío o sin encabezados")

    headers = set(reader.fieldnames)
    missing_headers = _REQUIRED_FIELDS - headers
    if missing_headers:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Faltan columnas obligatorias: {', '.join(sorted(missing_headers))}",
        )

    created       = 0
    skipped       = 0
    errors        = 0
    error_details: list[dict[str, Any]] = []

    for row_num, row in enumerate(reader, start=2):  # row 1 = headers
        try:
            # Parsear y validar campos
            full_name        = row.get("full_name", "").strip()
            reporter_name    = row.get("reporter_name", "").strip()
            reporter_contact = row.get("reporter_contact", "").strip()

            if not full_name or not reporter_name or not reporter_contact:
                raise ValueError("full_name, reporter_name y reporter_contact son obligatorios")

            disappeared_at = _parse_date(row.get("disappeared_at", ""), "disappeared_at")
            if disappeared_at is None:
                raise ValueError("'disappeared_at' es obligatorio")

            date_of_birth        = _parse_date(row.get("date_of_birth", ""), "date_of_birth")
            last_seen_at         = _parse_datetime(row.get("last_seen_at", ""), "last_seen_at")
            age_at_disappearance = _parse_int(row.get("age_at_disappearance", ""), "age_at_disappearance")
            height_cm            = _parse_int(row.get("height_cm", ""), "height_cm")

            person_data = dict(
                full_name=full_name,
                disappeared_at=disappeared_at,
                date_of_birth=date_of_birth,
                age_at_disappearance=age_at_disappearance,
                gender=row.get("gender", "").strip() or None,
                physical_description=row.get("physical_description", "").strip() or None,
                height_cm=height_cm,
                last_known_clothing=row.get("last_known_clothing", "").strip() or None,
                last_known_location=row.get("last_known_location", "").strip() or None,
                last_seen_at=last_seen_at,
                status=MissingPersonStatus.active,
                source="gov_import",
                reporter_name=reporter_name,
                reporter_contact=reporter_contact,
                reported_by_user_id=current_user.id,
            )

            if dry_run:
                created += 1
                continue

            # Persistir persona
            person = MissingPerson(**person_data)
            db.add(person)
            await db.flush()  # obtener person.id para las fotos

            # Descargar y guardar fotos (errores no abortan la fila)
            for photo_field in ("photo_url_1", "photo_url_2", "photo_url_3"):
                url = row.get(photo_field, "").strip()
                if url:
                    await _download_and_store_photo(url, person.id, db)

            created += 1

        except Exception as exc:
            errors += 1
            error_details.append({"row": row_num, "error": str(exc)})
            logger.warning("Error en fila %d del CSV de importación: %s", row_num, exc)
            # Continuar con la siguiente fila

    return {
        "dry_run":       dry_run,
        "created":       created,
        "skipped":       skipped,
        "errors":        errors,
        "error_details": error_details,
    }

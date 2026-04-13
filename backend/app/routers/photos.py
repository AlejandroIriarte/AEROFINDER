# =============================================================================
# AEROFINDER Backend — Router: Fotos de personas desaparecidas
#
# Flujo presigned URL:
#   1. POST /persons/{id}/photos/upload-url  → genera URL firmada de MinIO
#   2. Cliente hace PUT directo a MinIO
#   3. POST /persons/{id}/photos/confirm     → verifica en MinIO, registra en DB
#
# Aprobación por rol:
#   admin/buscador → foto activa al confirmar
#   familiar/ayudante → foto inactiva hasta que admin/ayudante la apruebe
# =============================================================================

import asyncio
import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import CurrentUser, get_current_user, require_role
from app.db.session import get_db
from app.models.enums import FileRetentionPolicy, FileUploadStatus, RoleName
from app.models.files import File
from app.models.persons import MissingPerson, PersonPhoto, PersonRelative
from app.schemas.photos import (
    PhotoConfirmRequest,
    PhotoPatchRequest,
    PhotoResponse,
    PhotoUploadUrlRequest,
    PhotoUploadUrlResponse,
)
from app.services.minio_service import minio_service
from app.config import settings

logger = logging.getLogger(__name__)
router = APIRouter(tags=["fotos"])

_PHOTO_MAX_PER_PERSON = 10
_PHOTO_PRESIGN_EXPIRES = 300        # segundos — 5 minutos
_PHOTO_VIEW_EXPIRES    = 3600       # segundos — 1 hora

_staff     = require_role(RoleName.admin, RoleName.buscador)
_approvers = require_role(RoleName.admin, RoleName.ayudante)


async def _check_person_access(
    person_id: uuid.UUID,
    current_user: CurrentUser,
    db: AsyncSession,
) -> MissingPerson:
    """
    Verifica que la persona existe y que el usuario tiene acceso a ella.
    Familiar solo puede acceder a sus personas vinculadas.
    Lanza 404 si no existe o 403 si no tiene acceso.
    """
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

    if current_user.role == RoleName.familiar:
        try:
            rel = await db.execute(
                select(PersonRelative).where(
                    PersonRelative.missing_person_id == person_id,
                    PersonRelative.user_id == current_user.id,
                )
            )
            if rel.scalar_one_or_none() is None:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acceso denegado")
        except HTTPException:
            raise
        except Exception:
            logger.error("Error al verificar vínculo familiar", exc_info=True)
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

    return person


async def _photo_to_response(photo: PersonPhoto, db: AsyncSession) -> PhotoResponse:
    """Construye PhotoResponse con presigned GET URL para la imagen."""
    view_url: str | None = None
    try:
        result = await db.execute(
            select(File.bucket, File.object_key).where(File.id == photo.file_id)
        )
        row = result.first()
        if row:
            bucket, object_key = row
            view_url = await asyncio.get_running_loop().run_in_executor(
                None,
                lambda: minio_service.get_presigned_url(bucket, object_key, _PHOTO_VIEW_EXPIRES),
            )
    except Exception:
        logger.error("Error al generar URL de vista para foto id=%s", photo.id, exc_info=True)

    return PhotoResponse(
        id=photo.id,
        missing_person_id=photo.missing_person_id,
        file_id=photo.file_id,
        face_angle=photo.face_angle,
        quality_score=photo.quality_score,
        has_embedding=photo.has_embedding,
        is_active=photo.is_active,
        uploaded_by=photo.uploaded_by,
        created_at=photo.created_at,
        view_url=view_url,
    )


@router.post(
    "/persons/{person_id}/photos/upload-url",
    response_model=PhotoUploadUrlResponse,
    status_code=status.HTTP_200_OK,
)
async def request_photo_upload_url(
    person_id: uuid.UUID,
    body: PhotoUploadUrlRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PhotoUploadUrlResponse:
    """
    Genera una URL firmada de MinIO para subir una foto directamente.
    El cliente debe hacer PUT a esa URL con el binario de la imagen.
    """
    await _check_person_access(person_id, current_user, db)

    # Verificar límite de fotos activas
    try:
        count_result = await db.execute(
            select(func.count(PersonPhoto.id)).where(
                PersonPhoto.missing_person_id == person_id,
                PersonPhoto.is_active.is_(True),
            )
        )
        active_count = count_result.scalar_one()
        if active_count >= _PHOTO_MAX_PER_PERSON:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Límite de {_PHOTO_MAX_PER_PERSON} fotos activas alcanzado",
            )
    except HTTPException:
        raise
    except Exception:
        logger.error("Error al contar fotos persona_id=%s", person_id, exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

    photo_id   = uuid.uuid4()
    object_key = f"persons/{person_id}/photos/{photo_id}.jpg"

    try:
        upload_url = await asyncio.get_running_loop().run_in_executor(
            None,
            lambda: minio_service.get_presigned_put_url(
                bucket=settings.minio_bucket_photos,
                object_key=object_key,
                expires_seconds=_PHOTO_PRESIGN_EXPIRES,
            ),
        )
    except Exception:
        logger.error("Error al generar presigned PUT URL para persona_id=%s", person_id, exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error al generar URL de subida")

    # Pre-registrar el photo_id como pendiente de confirmar
    try:
        file_record = File(
            id=photo_id,
            bucket=settings.minio_bucket_photos,
            object_key=object_key,
            sha256_hash="pending",          # se actualiza en /confirm
            size_bytes=0,                   # se actualiza en /confirm
            mime_type="image/jpeg",
            upload_status=FileUploadStatus.pending,
            retention_policy=FileRetentionPolicy.permanent,
        )
        photo_record = PersonPhoto(
            id=photo_id,
            missing_person_id=person_id,
            file_id=photo_id,
            face_angle=body.face_angle,
            is_active=False,                # inactiva hasta confirmar
            uploaded_by=current_user.id,
        )
        db.add(file_record)
        db.add(photo_record)
        await db.flush()
    except Exception:
        logger.error("Error al pre-registrar foto persona_id=%s", person_id, exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

    return PhotoUploadUrlResponse(
        upload_url=upload_url,
        photo_id=photo_id,
        object_key=object_key,
        expires_in=_PHOTO_PRESIGN_EXPIRES,
    )


@router.post(
    "/persons/{person_id}/photos/confirm",
    response_model=PhotoResponse,
    status_code=status.HTTP_201_CREATED,
)
async def confirm_photo_upload(
    person_id: uuid.UUID,
    body: PhotoConfirmRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PhotoResponse:
    """
    Confirma que la foto fue subida a MinIO y la activa según el rol.
    admin/buscador → is_active=True inmediatamente.
    familiar/ayudante → is_active=False, requiere aprobación.
    """
    await _check_person_access(person_id, current_user, db)

    # Buscar el pre-registro creado en upload-url
    try:
        photo_result = await db.execute(
            select(PersonPhoto).where(
                PersonPhoto.id == body.photo_id,
                PersonPhoto.missing_person_id == person_id,
                PersonPhoto.uploaded_by == current_user.id,
            )
        )
        photo: PersonPhoto | None = photo_result.scalar_one_or_none()
    except Exception:
        logger.error("Error al buscar foto pendiente id=%s", body.photo_id, exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

    if photo is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Foto no encontrada o no pertenece a este usuario")

    # Verificar que el archivo existe en MinIO
    file_result = await db.execute(select(File).where(File.id == photo.file_id))
    file_record: File | None = file_result.scalar_one_or_none()
    if file_record is None:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

    exists = await asyncio.get_running_loop().run_in_executor(
        None,
        lambda: minio_service.verify_object_exists(file_record.bucket, file_record.object_key),
    )
    if not exists:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="La imagen no fue encontrada en el servidor de archivos. Asegúrate de haber subido el archivo antes de confirmar.",
        )

    # Activar según rol
    activar = current_user.role in (RoleName.admin, RoleName.buscador)
    photo.is_active = activar
    file_record.upload_status = FileUploadStatus.uploaded
    await db.flush()

    return await _photo_to_response(photo, db)


@router.get(
    "/persons/{person_id}/photos",
    response_model=list[PhotoResponse],
)
async def list_person_photos(
    person_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[PhotoResponse]:
    """Lista fotos de la persona con presigned GET URL. Todos los roles autenticados."""
    await _check_person_access(person_id, current_user, db)

    try:
        # admin/buscador ven todas; familiar/ayudante solo las activas
        query = select(PersonPhoto).where(PersonPhoto.missing_person_id == person_id)
        if current_user.role not in (RoleName.admin, RoleName.buscador):
            query = query.where(PersonPhoto.is_active.is_(True))

        result = await db.execute(query)
        photos = result.scalars().all()
    except Exception:
        logger.error("Error al listar fotos persona_id=%s", person_id, exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

    return [await _photo_to_response(p, db) for p in photos]


@router.patch(
    "/persons/{person_id}/photos/{photo_id}",
    response_model=PhotoResponse,
)
async def patch_photo(
    person_id: uuid.UUID,
    photo_id: uuid.UUID,
    body: PhotoPatchRequest,
    current_user: CurrentUser = Depends(_approvers),
    db: AsyncSession = Depends(get_db),
) -> PhotoResponse:
    """Aprueba o desactiva una foto. Solo admin o ayudante."""
    try:
        result = await db.execute(
            select(PersonPhoto).where(
                PersonPhoto.id == photo_id,
                PersonPhoto.missing_person_id == person_id,
            )
        )
        photo: PersonPhoto | None = result.scalar_one_or_none()
    except Exception:
        logger.error("Error al buscar foto id=%s", photo_id, exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

    if photo is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Foto no encontrada")

    photo.is_active = body.is_active
    return await _photo_to_response(photo, db)


@router.delete(
    "/persons/{person_id}/photos/{photo_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_photo(
    person_id: uuid.UUID,
    photo_id: uuid.UUID,
    current_user: CurrentUser = Depends(_staff),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Soft delete de foto (is_active=False). Solo admin o buscador."""
    try:
        result = await db.execute(
            select(PersonPhoto).where(
                PersonPhoto.id == photo_id,
                PersonPhoto.missing_person_id == person_id,
            )
        )
        photo: PersonPhoto | None = result.scalar_one_or_none()
    except Exception:
        logger.error("Error al buscar foto id=%s", photo_id, exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno")

    if photo is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Foto no encontrada")

    photo.is_active = False

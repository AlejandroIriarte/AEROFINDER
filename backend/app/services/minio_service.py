# =============================================================================
# AEROFINDER Backend — Servicio de almacenamiento de archivos en MinIO
# Gestiona subida, descarga y deduplicación de snapshots, fotos y videos.
# =============================================================================

import hashlib
import io
import logging
from datetime import timedelta
from typing import Optional
from urllib.parse import urlparse

from minio import Minio
from minio.error import S3Error
from sqlalchemy import select

from app.config import settings
from app.db.session import AsyncSessionLocal
from app.models.files import File

logger = logging.getLogger(__name__)


class MinioService:
    """
    Cliente MinIO con métodos de alto nivel para AEROFINDER.
    Maneja deduplicación por SHA256 y generación automática de object_keys.
    """

    def __init__(self) -> None:
        # Extraer host:puerto sin protocolo (Minio no acepta http:// en endpoint)
        parsed = urlparse(settings.minio_url)
        endpoint = parsed.netloc or parsed.path

        self._client = Minio(
            endpoint=endpoint,
            access_key=settings.minio_access_key,
            secret_key=settings.minio_secret_key,
            secure=settings.minio_secure,
        )

    def _ensure_bucket(self, bucket: str) -> None:
        """Crea el bucket si no existe todavía."""
        try:
            if not self._client.bucket_exists(bucket):
                self._client.make_bucket(bucket)
                logger.info("Bucket MinIO creado: %s", bucket)
        except S3Error:
            logger.error("Error al verificar/crear bucket MinIO: %s", bucket, exc_info=True)
            raise

    def build_public_url(self, bucket: str, object_key: str) -> str:
        """Construye la URL pública directa al objeto en MinIO."""
        parsed = urlparse(settings.minio_url)
        scheme = "https" if settings.minio_secure else "http"
        return f"{scheme}://{parsed.netloc}/{bucket}/{object_key}"

    def upload_file(
        self,
        bucket: str,
        object_key: str,
        data: bytes,
        mime_type: str,
        sha256_hash: str,
        size_bytes: int,
    ) -> str:
        """
        Sube bytes al bucket indicado bajo el object_key dado.
        Retorna la URL pública del objeto.
        """
        try:
            self._ensure_bucket(bucket)
            stream = io.BytesIO(data)
            self._client.put_object(
                bucket_name=bucket,
                object_name=object_key,
                data=stream,
                length=size_bytes,
                content_type=mime_type,
                metadata={"x-amz-meta-sha256": sha256_hash},
            )
            url = self.build_public_url(bucket, object_key)
            logger.debug("Archivo subido a MinIO: bucket=%s key=%s", bucket, object_key)
            return url
        except S3Error:
            logger.error(
                "Error al subir archivo a MinIO: bucket=%s key=%s",
                bucket, object_key,
                exc_info=True,
            )
            raise

    def upload_snapshot(
        self,
        image_bytes: bytes,
        mission_id: str,
        detection_id: str,
    ) -> str:
        """
        Sube un snapshot de detección al bucket de snapshots.
        object_key generado automáticamente según misión y detección.
        Retorna URL pública.
        """
        object_key = f"missions/{mission_id}/detections/{detection_id}.jpg"
        sha256_hash = hashlib.sha256(image_bytes).hexdigest()
        return self.upload_file(
            bucket=settings.minio_bucket_snapshots,
            object_key=object_key,
            data=image_bytes,
            mime_type="image/jpeg",
            sha256_hash=sha256_hash,
            size_bytes=len(image_bytes),
        )

    def upload_reference_photo(
        self,
        image_bytes: bytes,
        person_id: str,
        photo_id: str,
    ) -> str:
        """
        Sube una foto de referencia de persona desaparecida al bucket de fotos.
        object_key generado automáticamente según persona y foto.
        Retorna URL pública.
        """
        object_key = f"persons/{person_id}/photos/{photo_id}.jpg"
        sha256_hash = hashlib.sha256(image_bytes).hexdigest()
        return self.upload_file(
            bucket=settings.minio_bucket_photos,
            object_key=object_key,
            data=image_bytes,
            mime_type="image/jpeg",
            sha256_hash=sha256_hash,
            size_bytes=len(image_bytes),
        )

    def get_presigned_url(
        self,
        bucket: str,
        object_key: str,
        expires_seconds: int = 3600,
    ) -> str:
        """
        Genera una URL firmada para acceso temporal al objeto.
        Útil para que clientes descarguen archivos sin exponer credenciales.
        """
        try:
            url = self._client.presigned_get_object(
                bucket_name=bucket,
                object_name=object_key,
                expires=timedelta(seconds=expires_seconds),
            )
            return url
        except S3Error:
            logger.error(
                "Error al generar URL firmada: bucket=%s key=%s",
                bucket, object_key,
                exc_info=True,
            )
            raise

    def get_presigned_put_url(
        self,
        bucket: str,
        object_key: str,
        expires_seconds: int = 300,
    ) -> str:
        """
        Genera URL firmada para PUT directo desde el cliente (subida de fotos).
        El cliente usa esta URL para subir el archivo binario directamente a MinIO
        sin pasar por el backend. Expira en 5 minutos por defecto.
        """
        try:
            self._ensure_bucket(bucket)
            url = self._client.presigned_put_object(
                bucket_name=bucket,
                object_name=object_key,
                expires=timedelta(seconds=expires_seconds),
            )
            return url
        except S3Error:
            logger.error(
                "Error al generar presigned PUT URL: bucket=%s key=%s",
                bucket, object_key,
                exc_info=True,
            )
            raise

    def verify_object_exists(self, bucket: str, object_key: str) -> bool:
        """
        Verifica que el objeto fue subido exitosamente a MinIO.
        Usa stat_object (HEAD request) sin descargar el archivo.
        Retorna True si existe, False si no.
        """
        try:
            self._client.stat_object(bucket_name=bucket, object_name=object_key)
            return True
        except S3Error as exc:
            if exc.code == "NoSuchKey":
                return False
            logger.error(
                "Error al verificar objeto en MinIO: bucket=%s key=%s",
                bucket, object_key, exc_info=True,
            )
            return False

    async def file_exists_by_hash(
        self,
        sha256_hash: str,
    ) -> tuple[bool, Optional[str]]:
        """
        Consulta la tabla files para verificar si ya existe un archivo con ese hash.
        Permite deduplicación: si el archivo ya está en MinIO, reutiliza el registro.
        Retorna (existe: bool, object_key_existente: str | None).
        """
        try:
            async with AsyncSessionLocal() as session:
                result = await session.execute(
                    select(File.object_key).where(File.sha256_hash == sha256_hash)
                )
                object_key = result.scalar_one_or_none()
                if object_key is not None:
                    return True, object_key
                return False, None
        except Exception:
            logger.error(
                "Error al consultar deduplicación por hash SHA256: %s",
                sha256_hash,
                exc_info=True,
            )
            return False, None

    def delete_file(self, bucket: str, object_key: str) -> None:
        """
        Elimina el objeto de MinIO.
        Loguea el error sin lanzar excepción para no interrumpir flujos críticos.
        """
        try:
            self._client.remove_object(bucket_name=bucket, object_name=object_key)
            logger.info("Archivo eliminado de MinIO: bucket=%s key=%s", bucket, object_key)
        except S3Error:
            logger.error(
                "Error al eliminar archivo de MinIO: bucket=%s key=%s",
                bucket, object_key,
                exc_info=True,
            )


# Singleton compartido por toda la aplicación
minio_service = MinioService()

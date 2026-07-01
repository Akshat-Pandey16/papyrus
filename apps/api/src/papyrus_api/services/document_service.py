from __future__ import annotations

import hashlib
from dataclasses import dataclass
from uuid import UUID, uuid4

import structlog
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from papyrus_api.core.config import settings
from papyrus_api.core.errors import (
    DocumentNotFoundError,
    FileTooLargeError,
    ImageInvalidError,
    PdfSignatureInvalidError,
    UploadAlreadyConfirmedError,
    UploadNotFoundInStorageError,
    ValidationError,
)
from papyrus_api.core.time import utc_now
from papyrus_api.domain.documents.models import Document, DocumentVersion, StorageObject
from papyrus_api.integrations.redis import input_password_key
from papyrus_api.repositories.audit import AuditEventRepository
from papyrus_api.repositories.documents import (
    DocumentRepository,
    DocumentVersionRepository,
    StorageObjectRepository,
)
from papyrus_api.services.storage_service import PresignedUpload, StorageService

log = structlog.get_logger(__name__)

PDF_MAGIC = b"%PDF-"
_JPEG_MAGIC = b"\xff\xd8\xff"
_PNG_MAGIC = b"\x89PNG\r\n\x1a\n"
_ZIP_MAGIC = b"PK\x03\x04"
_OLE_MAGIC = b"\xd0\xcf\x11\xe0"

_DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
_PPTX = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
_ODT = "application/vnd.oasis.opendocument.text"
_ODS = "application/vnd.oasis.opendocument.spreadsheet"
_ODP = "application/vnd.oasis.opendocument.presentation"

_ZIP_OFFICE_TYPES = frozenset({_DOCX, _XLSX, _PPTX, _ODT, _ODS, _ODP})
_OLE_OFFICE_TYPES = frozenset(
    {"application/msword", "application/vnd.ms-excel", "application/vnd.ms-powerpoint"}
)

_EXT_BY_CONTENT_TYPE = {
    "application/pdf": "pdf",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    _DOCX: "docx",
    _XLSX: "xlsx",
    _PPTX: "pptx",
    _ODT: "odt",
    _ODS: "ods",
    _ODP: "odp",
    "application/msword": "doc",
    "application/vnd.ms-excel": "xls",
    "application/vnd.ms-powerpoint": "ppt",
}


def _hash_filename(name: str) -> str:
    return hashlib.sha256(name.encode("utf-8")).hexdigest()[:16]


def _magic_matches(content_type: str, prefix: bytes) -> bool:
    if content_type == "application/pdf":
        return prefix.startswith(PDF_MAGIC)
    if content_type == "image/jpeg":
        return prefix.startswith(_JPEG_MAGIC)
    if content_type == "image/png":
        return prefix.startswith(_PNG_MAGIC)
    if content_type == "image/webp":
        return prefix[:4] == b"RIFF" and prefix[8:12] == b"WEBP"
    if content_type in _ZIP_OFFICE_TYPES:
        return prefix.startswith(_ZIP_MAGIC)
    if content_type in _OLE_OFFICE_TYPES:
        return prefix.startswith(_OLE_MAGIC)
    return False


@dataclass(slots=True, frozen=True)
class InitiateResult:
    document: Document
    storage_object: StorageObject
    upload: PresignedUpload
    max_bytes: int


@dataclass(slots=True, frozen=True)
class ConfirmedDocument:
    document: Document
    version: DocumentVersion
    storage_object: StorageObject


class DocumentService:
    def __init__(self, session: AsyncSession, storage: StorageService) -> None:
        self.session = session
        self.storage = storage
        self.documents = DocumentRepository(session)
        self.storage_objects = StorageObjectRepository(session)
        self.versions = DocumentVersionRepository(session)
        self.audit = AuditEventRepository(session)

    async def delete(
        self,
        *,
        organization_id: UUID,
        document_id: UUID,
    ) -> None:
        document = await self.documents.get_for_org(
            organization_id=organization_id,
            document_id=document_id,
        )
        if document is None:
            raise DocumentNotFoundError("Document not found.")

        storage_objects = await self.storage_objects.list_for_document(
            document_id=document.id,
        )
        document.deleted_at = utc_now()
        await self.audit.record(
            action="document.deleted",
            organization_id=organization_id,
            target_type="document",
            target_id=document.id,
        )
        await self.session.flush()
        await self.session.commit()

        purged = 0
        for obj in storage_objects:
            try:
                await self.storage.delete(bucket=obj.bucket, key=obj.key)
                purged += 1
            except Exception as exc:
                log.warning(
                    "documents.delete.storage_purge_failed",
                    storage_object_id=str(obj.id),
                    bucket=obj.bucket,
                    error=str(exc),
                )

        log.info(
            "documents.deleted",
            document_id=str(document.id),
            storage_objects_purged=purged,
            storage_objects_total=len(storage_objects),
        )

    async def set_input_password(
        self,
        *,
        organization_id: UUID,
        document_id: UUID,
        password: str,
        redis: Redis,
    ) -> None:
        document = await self.documents.get_for_org(
            organization_id=organization_id,
            document_id=document_id,
        )
        if document is None:
            raise DocumentNotFoundError("Document not found.")
        await redis.set(
            input_password_key(organization_id, str(document_id)),
            password,
            ex=settings.job_secret_ttl_seconds,
        )

    async def initiate_upload(
        self,
        *,
        organization_id: UUID,
        user_id: UUID,
        name: str,
        content_type: str,
        size_bytes: int,
        is_anonymous: bool = False,
    ) -> InitiateResult:
        max_bytes = settings.anon_max_file_bytes if is_anonymous else settings.user_max_file_bytes
        if size_bytes > max_bytes:
            raise FileTooLargeError(
                "File exceeds the maximum allowed size.",
                details={
                    "max_bytes": max_bytes,
                    "size_bytes": size_bytes,
                    "anonymous": is_anonymous,
                },
            )

        document = await self.documents.create(
            organization_id=organization_id,
            name=name,
            mime_type=content_type,
        )

        bucket = settings.s3_bucket_uploads
        ext = _EXT_BY_CONTENT_TYPE.get(content_type, "bin")
        key = f"org/{organization_id}/uploads/{document.id}/{uuid4().hex}.{ext}"

        storage_object = await self.storage_objects.create_placeholder(
            bucket=bucket,
            key=key,
            size_bytes=size_bytes,
            content_type=content_type,
            purpose="upload",
            document_id=document.id,
        )

        upload = await self.storage.presign_upload(
            bucket=bucket,
            key=key,
            content_type=content_type,
            max_bytes=max_bytes,
        )

        await self.session.commit()

        log.info(
            "documents.upload.initiated",
            document_id=str(document.id),
            storage_object_id=str(storage_object.id),
            size_bytes=size_bytes,
            content_type=content_type,
            name_hash=_hash_filename(name),
            user_id=str(user_id),
        )

        return InitiateResult(
            document=document,
            storage_object=storage_object,
            upload=upload,
            max_bytes=max_bytes,
        )

    async def confirm_upload(
        self,
        *,
        organization_id: UUID,
        document_id: UUID,
    ) -> ConfirmedDocument:
        document = await self.documents.get_for_org(
            organization_id=organization_id,
            document_id=document_id,
        )
        if document is None:
            raise DocumentNotFoundError("Document not found.")

        existing = await self.versions.latest_for_document(document_id=document.id)
        if existing is not None:
            storage_object = await self.storage_objects.get(existing.storage_object_id)
            if storage_object is None:
                raise UploadAlreadyConfirmedError(
                    "Upload already confirmed but storage record is missing.",
                )
            return ConfirmedDocument(
                document=document,
                version=existing,
                storage_object=storage_object,
            )

        latest_object_stmt = await self.storage_objects.get_latest_unconfirmed_for_document(
            document_id=document.id,
        )
        if latest_object_stmt is None:
            raise UploadNotFoundInStorageError(
                "No upload slot found for this document.",
            )

        head = await self.storage.head_object(
            bucket=latest_object_stmt.bucket,
            key=latest_object_stmt.key,
        )
        if head is None:
            raise UploadNotFoundInStorageError(
                "The upload was not received by storage.",
            )

        if head.size_bytes > settings.user_max_file_bytes:
            await self.storage.delete(
                bucket=latest_object_stmt.bucket,
                key=latest_object_stmt.key,
            )
            raise FileTooLargeError(
                "Uploaded file exceeds the maximum allowed size.",
                details={
                    "max_bytes": settings.user_max_file_bytes,
                    "size_bytes": head.size_bytes,
                },
            )

        prefix = await self.storage.read_range(
            bucket=latest_object_stmt.bucket,
            key=latest_object_stmt.key,
            start=0,
            end=15,
        )
        content_type = latest_object_stmt.content_type
        if not _magic_matches(content_type, prefix):
            await self.storage.delete(
                bucket=latest_object_stmt.bucket,
                key=latest_object_stmt.key,
            )
            if content_type == "application/pdf":
                raise PdfSignatureInvalidError(
                    "The uploaded file is not a valid PDF document.",
                )
            if content_type in _ZIP_OFFICE_TYPES or content_type in _OLE_OFFICE_TYPES:
                raise ValidationError(
                    "The uploaded file does not match the expected document format.",
                )
            raise ImageInvalidError(
                "The uploaded file is not a valid image.",
            )

        confirmed = await self.storage_objects.mark_confirmed(
            storage_object_id=latest_object_stmt.id,
            sha256=None,
            size_bytes=head.size_bytes,
            confirmed_at=utc_now(),
        )
        if confirmed is None:
            raise UploadNotFoundInStorageError("Storage record disappeared.")

        version = await self.versions.create(
            document_id=document.id,
            version=1,
            storage_object_id=confirmed.id,
        )

        await self.session.commit()

        log.info(
            "documents.upload.confirmed",
            document_id=str(document.id),
            version=version.version,
            storage_object_id=str(confirmed.id),
            size_bytes=confirmed.size_bytes,
            sha256=confirmed.sha256,
        )

        return ConfirmedDocument(
            document=document,
            version=version,
            storage_object=confirmed,
        )

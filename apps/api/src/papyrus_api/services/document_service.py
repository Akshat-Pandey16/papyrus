from __future__ import annotations

import hashlib
from dataclasses import dataclass
from uuid import UUID, uuid4

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from papyrus_api.core.config import settings
from papyrus_api.core.errors import (
    DocumentNotFoundError,
    PdfSignatureInvalidError,
    QuotaExceededError,
    UploadAlreadyConfirmedError,
    UploadNotFoundInStorageError,
)
from papyrus_api.core.time import utc_now
from papyrus_api.domain.documents.models import Document, DocumentVersion, StorageObject
from papyrus_api.repositories.documents import (
    DocumentRepository,
    DocumentVersionRepository,
    StorageObjectRepository,
)
from papyrus_api.services.storage_service import PresignedUpload, StorageService

log = structlog.get_logger(__name__)

PDF_MAGIC = b"%PDF-"


def _hash_filename(name: str) -> str:
    return hashlib.sha256(name.encode("utf-8")).hexdigest()[:16]


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
        document.deleted_at = utc_now()
        await self.session.flush()
        await self.session.commit()
        log.info("documents.deleted", document_id=str(document.id))

    async def initiate_upload(
        self,
        *,
        organization_id: UUID,
        user_id: UUID,
        name: str,
        content_type: str,
        size_bytes: int,
    ) -> InitiateResult:
        max_bytes = settings.user_max_file_bytes
        if size_bytes > max_bytes:
            raise QuotaExceededError(
                "File exceeds the maximum allowed size.",
                details={"max_bytes": max_bytes, "size_bytes": size_bytes},
            )

        document = await self.documents.create(
            organization_id=organization_id,
            name=name,
            mime_type=content_type,
        )

        bucket = settings.s3_bucket_uploads
        key = f"org/{organization_id}/uploads/{document.id}/{uuid4().hex}.pdf"

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
            raise QuotaExceededError(
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
            end=4,
        )
        if not prefix.startswith(PDF_MAGIC):
            await self.storage.delete(
                bucket=latest_object_stmt.bucket,
                key=latest_object_stmt.key,
            )
            raise PdfSignatureInvalidError(
                "The uploaded file is not a valid PDF document.",
            )

        confirmed = await self.storage_objects.mark_confirmed(
            storage_object_id=latest_object_stmt.id,
            sha256=head.etag,
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

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import and_, select

from papyrus_api.domain.documents.models import Document, DocumentVersion, StorageObject
from papyrus_api.repositories.base import AsyncRepository


class DocumentRepository(AsyncRepository[Document]):
    model = Document

    async def create(
        self,
        *,
        organization_id: UUID,
        name: str,
        mime_type: str,
    ) -> Document:
        doc = Document(
            organization_id=organization_id,
            name=name,
            mime_type=mime_type,
        )
        self.session.add(doc)
        await self.session.flush()
        return doc

    async def get_for_org(
        self,
        *,
        organization_id: UUID,
        document_id: UUID,
    ) -> Document | None:
        stmt = select(Document).where(
            Document.id == document_id,
            Document.organization_id == organization_id,
            Document.deleted_at.is_(None),
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def list_orphans_older_than(
        self,
        *,
        cutoff: datetime,
        limit: int,
    ) -> list[Document]:
        stmt = (
            select(Document)
            .outerjoin(DocumentVersion, DocumentVersion.document_id == Document.id)
            .where(
                Document.created_at < cutoff,
                DocumentVersion.id.is_(None),
                Document.deleted_at.is_(None),
            )
            .limit(limit)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())


class StorageObjectRepository(AsyncRepository[StorageObject]):
    model = StorageObject

    async def create_placeholder(
        self,
        *,
        bucket: str,
        key: str,
        size_bytes: int,
        content_type: str,
        purpose: str,
    ) -> StorageObject:
        obj = StorageObject(
            bucket=bucket,
            key=key,
            size_bytes=size_bytes,
            content_type=content_type,
            purpose=purpose,
        )
        self.session.add(obj)
        await self.session.flush()
        return obj

    async def get(self, id_: UUID) -> StorageObject | None:
        return await self.session.get(StorageObject, id_)

    async def mark_confirmed(
        self,
        *,
        storage_object_id: UUID,
        sha256: str | None,
        size_bytes: int,
        confirmed_at: datetime,
    ) -> StorageObject | None:
        obj = await self.session.get(StorageObject, storage_object_id)
        if obj is None:
            return None
        obj.sha256 = sha256
        obj.size_bytes = size_bytes
        obj.confirmed_at = confirmed_at
        await self.session.flush()
        return obj

    async def list_unconfirmed_older_than(
        self,
        *,
        cutoff: datetime,
        limit: int,
    ) -> list[StorageObject]:
        stmt = (
            select(StorageObject)
            .where(
                and_(
                    StorageObject.confirmed_at.is_(None),
                    StorageObject.created_at < cutoff,
                )
            )
            .limit(limit)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())


class DocumentVersionRepository(AsyncRepository[DocumentVersion]):
    model = DocumentVersion

    async def create(
        self,
        *,
        document_id: UUID,
        version: int,
        storage_object_id: UUID,
    ) -> DocumentVersion:
        dv = DocumentVersion(
            document_id=document_id,
            version=version,
            storage_object_id=storage_object_id,
        )
        self.session.add(dv)
        await self.session.flush()
        return dv

    async def latest_for_document(
        self,
        *,
        document_id: UUID,
    ) -> DocumentVersion | None:
        stmt = (
            select(DocumentVersion)
            .where(DocumentVersion.document_id == document_id)
            .order_by(DocumentVersion.version.desc())
            .limit(1)
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_with_storage(
        self,
        *,
        organization_id: UUID,
        document_id: UUID,
    ) -> tuple[Document, DocumentVersion, StorageObject] | None:
        stmt = (
            select(Document, DocumentVersion, StorageObject)
            .join(DocumentVersion, DocumentVersion.document_id == Document.id)
            .join(StorageObject, StorageObject.id == DocumentVersion.storage_object_id)
            .where(
                Document.id == document_id,
                Document.organization_id == organization_id,
                Document.deleted_at.is_(None),
            )
            .order_by(DocumentVersion.version.desc())
            .limit(1)
        )
        result = await self.session.execute(stmt)
        row = result.first()
        if row is None:
            return None
        return (row[0], row[1], row[2])

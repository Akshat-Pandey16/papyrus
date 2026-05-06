from __future__ import annotations

from uuid import UUID

from papyrus_api.db.base import Base
from papyrus_api.db.mixins import IdMixin, SoftDeleteMixin, TenantMixin, TimestampMixin
from sqlalchemy import BigInteger, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column


class Document(Base, IdMixin, TenantMixin, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "documents"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(120), nullable=False)
    page_count: Mapped[int | None] = mapped_column(default=None, nullable=True)


class DocumentVersion(Base, IdMixin, TimestampMixin):
    __tablename__ = "document_versions"

    document_id: Mapped[UUID] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    version: Mapped[int] = mapped_column(nullable=False)
    storage_object_id: Mapped[UUID] = mapped_column(
        ForeignKey("storage_objects.id", ondelete="RESTRICT"),
        nullable=False,
    )


class StorageObject(Base, IdMixin, TimestampMixin):
    __tablename__ = "storage_objects"

    bucket: Mapped[str] = mapped_column(String(120), nullable=False)
    key: Mapped[str] = mapped_column(String(1024), nullable=False)
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    sha256: Mapped[str | None] = mapped_column(String(64), default=None, nullable=True)
    content_type: Mapped[str] = mapped_column(String(120), nullable=False)

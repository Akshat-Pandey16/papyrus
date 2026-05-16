from __future__ import annotations

from datetime import datetime
from uuid import UUID

from papyrus_api.db.base import Base
from papyrus_api.db.mixins import IdMixin, SoftDeleteMixin, TenantMixin, TimestampMixin
from sqlalchemy import BigInteger, ForeignKey, Index, String, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column


class Document(Base, IdMixin, TenantMixin, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "documents"
    __table_args__ = (
        Index(
            "ix_documents_organization_id_created_at",
            "organization_id",
            "created_at",
            postgresql_where=text("deleted_at IS NULL"),
        ),
    )

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(120), nullable=False)
    page_count: Mapped[int | None] = mapped_column(default=None, nullable=True)


class DocumentVersion(Base, IdMixin, TimestampMixin):
    __tablename__ = "document_versions"
    __table_args__ = (UniqueConstraint("document_id", "version"),)

    document_id: Mapped[UUID] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    version: Mapped[int] = mapped_column(nullable=False)
    storage_object_id: Mapped[UUID] = mapped_column(
        ForeignKey("storage_objects.id", ondelete="RESTRICT"),
        index=True,
        nullable=False,
    )


class StorageObject(Base, IdMixin, TimestampMixin):
    __tablename__ = "storage_objects"
    __table_args__ = (
        Index(
            "ix_storage_objects_unconfirmed_created_at",
            "created_at",
            postgresql_where=text("confirmed_at IS NULL"),
        ),
        Index(
            "ix_storage_objects_document_unconfirmed",
            "document_id",
            "created_at",
            postgresql_where=text("confirmed_at IS NULL AND document_id IS NOT NULL"),
        ),
    )

    bucket: Mapped[str] = mapped_column(String(120), nullable=False)
    key: Mapped[str] = mapped_column(String(1024), nullable=False)
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    sha256: Mapped[str | None] = mapped_column(String(64), default=None, nullable=True)
    content_type: Mapped[str] = mapped_column(String(120), nullable=False)
    purpose: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        server_default="upload",
    )
    confirmed_at: Mapped[datetime | None] = mapped_column(default=None, nullable=True)
    document_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("documents.id", ondelete="SET NULL"),
        default=None,
        nullable=True,
    )

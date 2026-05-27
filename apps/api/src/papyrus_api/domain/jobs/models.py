from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import BigInteger, Enum, Float, ForeignKey, Index, String, Uuid, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from papyrus_api.db.base import Base
from papyrus_api.db.mixins import IdMixin, TenantMixin, TimestampMixin
from papyrus_api.domain.jobs.enums import JobKind, JobStatus


class Job(Base, IdMixin, TenantMixin, TimestampMixin):
    __tablename__ = "jobs"
    __table_args__ = (
        Index("ix_jobs_organization_id_created_at", "organization_id", "created_at"),
        Index("ix_jobs_organization_id_status", "organization_id", "status"),
        Index(
            "ix_jobs_pending_runnable",
            "created_at",
            postgresql_where=text("status IN ('PENDING', 'RUNNING')"),
        ),
        Index(
            "uq_jobs_org_idempotency_active",
            "organization_id",
            "idempotency_key",
            unique=True,
            postgresql_where=text("idempotency_key IS NOT NULL"),
        ),
    )

    kind: Mapped[JobKind] = mapped_column(
        Enum(
            JobKind,
            name="job_kind",
            values_callable=lambda e: [m.name for m in e],
        ),
        index=True,
        nullable=False,
    )
    status: Mapped[JobStatus] = mapped_column(
        Enum(
            JobStatus,
            name="job_status",
            values_callable=lambda e: [m.name for m in e],
        ),
        index=True,
        nullable=False,
        default=JobStatus.PENDING,
    )
    params: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    output_object_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("storage_objects.id", ondelete="SET NULL"),
        index=True,
        default=None,
        nullable=True,
    )
    idempotency_key: Mapped[UUID | None] = mapped_column(
        Uuid(),
        default=None,
        nullable=True,
    )
    input_size_bytes: Mapped[int | None] = mapped_column(
        BigInteger,
        default=None,
        nullable=True,
    )
    output_size_bytes: Mapped[int | None] = mapped_column(
        BigInteger,
        default=None,
        nullable=True,
    )
    compression_ratio: Mapped[float | None] = mapped_column(
        Float,
        default=None,
        nullable=True,
    )
    started_at: Mapped[datetime | None] = mapped_column(default=None, nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(default=None, nullable=True)
    error_code: Mapped[str | None] = mapped_column(String(80), default=None, nullable=True)
    error_message: Mapped[str | None] = mapped_column(String(500), default=None, nullable=True)


class JobEvent(Base, IdMixin, TimestampMixin):
    __tablename__ = "job_events"
    __table_args__ = (Index("ix_job_events_job_id_created_at", "job_id", "created_at"),)

    job_id: Mapped[UUID] = mapped_column(
        ForeignKey("jobs.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    status: Mapped[JobStatus] = mapped_column(
        Enum(
            JobStatus,
            name="job_status",
            values_callable=lambda e: [m.name for m in e],
        ),
        nullable=False,
    )
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)

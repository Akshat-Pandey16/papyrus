from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import Enum, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from papyrus_api.db.base import Base
from papyrus_api.db.mixins import IdMixin, TenantMixin, TimestampMixin
from papyrus_api.domain.jobs.enums import JobKind, JobStatus


class Job(Base, IdMixin, TenantMixin, TimestampMixin):
    __tablename__ = "jobs"

    kind: Mapped[JobKind] = mapped_column(
        Enum(JobKind, name="job_kind"),
        index=True,
        nullable=False,
    )
    status: Mapped[JobStatus] = mapped_column(
        Enum(JobStatus, name="job_status"),
        index=True,
        nullable=False,
        default=JobStatus.PENDING,
    )
    params: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    output_object_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("storage_objects.id", ondelete="SET NULL"),
        default=None,
        nullable=True,
    )
    started_at: Mapped[datetime | None] = mapped_column(default=None, nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(default=None, nullable=True)
    error_code: Mapped[str | None] = mapped_column(String(80), default=None, nullable=True)
    error_message: Mapped[str | None] = mapped_column(String(500), default=None, nullable=True)


class JobEvent(Base, IdMixin, TimestampMixin):
    __tablename__ = "job_events"

    job_id: Mapped[UUID] = mapped_column(
        ForeignKey("jobs.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    status: Mapped[JobStatus] = mapped_column(
        Enum(JobStatus, name="job_status"),
        nullable=False,
    )
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)

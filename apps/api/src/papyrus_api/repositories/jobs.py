from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import and_, case, func, or_, select, update

from papyrus_api.core.time import utc_now
from papyrus_api.domain.jobs.enums import JobKind, JobStatus
from papyrus_api.domain.jobs.models import Job, JobEvent
from papyrus_api.repositories.base import AsyncRepository


class JobRepository(AsyncRepository[Job]):
    model = Job

    async def create(
        self,
        *,
        organization_id: UUID,
        kind: JobKind,
        params: dict[str, Any],
        idempotency_key: UUID | None,
        input_size_bytes: int | None,
    ) -> Job:
        job = Job(
            organization_id=organization_id,
            kind=kind,
            status=JobStatus.PENDING,
            params=params,
            idempotency_key=idempotency_key,
            input_size_bytes=input_size_bytes,
        )
        self.session.add(job)
        await self.session.flush()
        return job

    async def get_for_org(
        self,
        *,
        organization_id: UUID,
        job_id: UUID,
    ) -> Job | None:
        stmt = select(Job).where(
            Job.id == job_id,
            Job.organization_id == organization_id,
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_for_worker(self, *, job_id: UUID) -> Job | None:
        return await self.session.get(Job, job_id)

    async def get_by_idempotency_key(
        self,
        *,
        organization_id: UUID,
        idempotency_key: UUID,
    ) -> Job | None:
        stmt = select(Job).where(
            Job.organization_id == organization_id,
            Job.idempotency_key == idempotency_key,
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def list_for_org(
        self,
        *,
        organization_id: UUID,
        kind: JobKind | None,
        status: JobStatus | None,
        limit: int,
        cursor_created_at: datetime | None,
        cursor_id: UUID | None,
    ) -> list[Job]:
        stmt = select(Job).where(Job.organization_id == organization_id)
        if kind is not None:
            stmt = stmt.where(Job.kind == kind)
        if status is not None:
            stmt = stmt.where(Job.status == status)
        if cursor_created_at is not None and cursor_id is not None:
            stmt = stmt.where(
                or_(
                    Job.created_at < cursor_created_at,
                    and_(
                        Job.created_at == cursor_created_at,
                        Job.id < cursor_id,
                    ),
                )
            )
        stmt = stmt.order_by(Job.created_at.desc(), Job.id.desc()).limit(limit + 1)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def count_jobs_today(
        self,
        *,
        organization_id: UUID,
        since: datetime,
    ) -> int:
        stmt = select(func.count(Job.id)).where(
            Job.organization_id == organization_id,
            Job.created_at >= since,
        )
        result = await self.session.execute(stmt)
        return int(result.scalar_one() or 0)

    async def mark_running(self, *, job_id: UUID) -> Job | None:
        now = utc_now()
        stmt = (
            update(Job)
            .where(
                Job.id == job_id,
                Job.status.in_([JobStatus.PENDING, JobStatus.RUNNING]),
            )
            .values(
                status=JobStatus.RUNNING,
                started_at=case((Job.started_at.is_(None), now), else_=Job.started_at),
            )
            .returning(Job)
            .execution_options(synchronize_session="fetch")
        )
        result = await self.session.execute(stmt)
        row = result.scalar_one_or_none()
        if row is not None:
            await self.session.flush()
        return row

    async def mark_succeeded(
        self,
        *,
        job_id: UUID,
        output_object_id: UUID,
        output_size_bytes: int,
        compression_ratio: float | None = None,
    ) -> Job | None:
        stmt = (
            update(Job)
            .where(Job.id == job_id, Job.status == JobStatus.RUNNING)
            .values(
                status=JobStatus.SUCCEEDED,
                finished_at=utc_now(),
                output_object_id=output_object_id,
                output_size_bytes=output_size_bytes,
                compression_ratio=compression_ratio,
                error_code=None,
                error_message=None,
            )
            .returning(Job)
            .execution_options(synchronize_session="fetch")
        )
        result = await self.session.execute(stmt)
        row = result.scalar_one_or_none()
        if row is not None:
            await self.session.flush()
        return row

    async def mark_failed(
        self,
        *,
        job_id: UUID,
        error_code: str,
        error_message: str,
    ) -> Job | None:
        stmt = (
            update(Job)
            .where(
                Job.id == job_id,
                Job.status.in_([JobStatus.PENDING, JobStatus.RUNNING]),
            )
            .values(
                status=JobStatus.FAILED,
                finished_at=utc_now(),
                error_code=error_code,
                error_message=error_message,
            )
            .returning(Job)
            .execution_options(synchronize_session="fetch")
        )
        result = await self.session.execute(stmt)
        row = result.scalar_one_or_none()
        if row is not None:
            await self.session.flush()
        return row

    async def mark_cancelled(self, *, job_id: UUID) -> Job | None:
        now = utc_now()
        stmt = (
            update(Job)
            .where(
                Job.id == job_id,
                Job.status.in_([JobStatus.PENDING, JobStatus.RUNNING]),
            )
            .values(
                status=JobStatus.CANCELLED,
                finished_at=case((Job.finished_at.is_(None), now), else_=Job.finished_at),
            )
            .returning(Job)
            .execution_options(synchronize_session="fetch")
        )
        result = await self.session.execute(stmt)
        row = result.scalar_one_or_none()
        if row is not None:
            await self.session.flush()
        return row


class JobEventRepository(AsyncRepository[JobEvent]):
    model = JobEvent

    async def append(
        self,
        *,
        job_id: UUID,
        status: JobStatus,
        payload: dict[str, Any],
    ) -> JobEvent:
        event = JobEvent(job_id=job_id, status=status, payload=payload)
        self.session.add(event)
        await self.session.flush()
        return event

    async def list_for_job(
        self,
        *,
        job_id: UUID,
        limit: int = 50,
    ) -> list[JobEvent]:
        stmt = (
            select(JobEvent)
            .where(JobEvent.job_id == job_id)
            .order_by(JobEvent.created_at.asc())
            .limit(limit)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

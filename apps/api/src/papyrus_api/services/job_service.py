from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any
from uuid import UUID

import structlog
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from papyrus_api.core.config import settings
from papyrus_api.core.errors import (
    AppError,
    DocumentNotFoundError,
    JobNotFoundError,
    JobNotTerminalError,
    JobOutputExpiredError,
    QuotaExceededError,
)
from papyrus_api.core.pagination import decode_cursor, encode_cursor
from papyrus_api.core.time import utc_now
from papyrus_api.domain.documents.models import Document, DocumentVersion, StorageObject
from papyrus_api.domain.jobs.enums import JobKind, JobStatus
from papyrus_api.domain.jobs.models import Job
from papyrus_api.repositories.documents import (
    DocumentVersionRepository,
    StorageObjectRepository,
)
from papyrus_api.repositories.jobs import JobEventRepository, JobRepository
from papyrus_api.schemas.jobs import JobOut
from papyrus_api.services.storage_service import StorageService

log = structlog.get_logger(__name__)


_TERMINAL_STATUSES: frozenset[JobStatus] = frozenset(
    {JobStatus.SUCCEEDED, JobStatus.FAILED, JobStatus.CANCELLED}
)


@dataclass(slots=True, frozen=True)
class CreateJobResult:
    job: Job
    replay: bool


@dataclass(slots=True, frozen=True)
class DownloadUrlResult:
    url: str
    expires_at: datetime
    filename: str


def _channel(job_id: UUID) -> str:
    return f"job-events:{job_id}"


def _job_to_out(job: Job, *, phase: str | None) -> JobOut:
    document_id_raw = job.params.get("document_id") if job.params else None
    document_id: UUID | None = None
    if isinstance(document_id_raw, str):
        try:
            document_id = UUID(document_id_raw)
        except ValueError:
            document_id = None
    return JobOut(
        id=job.id,
        kind=job.kind.value,  # type: ignore[arg-type]
        status=job.status.value,  # type: ignore[arg-type]
        phase=phase,
        progress=None,
        params=dict(job.params or {}),
        document_id=document_id,
        input_size_bytes=job.input_size_bytes,
        output_size_bytes=job.output_size_bytes,
        compression_ratio=job.compression_ratio,
        output_object_id=job.output_object_id,
        error_code=job.error_code,
        error_message=job.error_message,
        created_at=job.created_at,
        started_at=job.started_at,
        finished_at=job.finished_at,
    )


class JobService:
    def __init__(
        self,
        session: AsyncSession,
        redis: Redis,
        storage: StorageService,
    ) -> None:
        self.session = session
        self.redis = redis
        self.storage = storage
        self.jobs = JobRepository(session)
        self.events = JobEventRepository(session)
        self.versions = DocumentVersionRepository(session)
        self.storage_objects = StorageObjectRepository(session)

    async def create_compression_job(
        self,
        *,
        organization_id: UUID,
        user_id: UUID,
        document_id: UUID,
        compression_level: str,
        idempotency_key: UUID,
    ) -> CreateJobResult:
        existing = await self.jobs.get_by_idempotency_key(
            organization_id=organization_id,
            idempotency_key=idempotency_key,
        )
        if existing is not None:
            return CreateJobResult(job=existing, replay=True)

        triple = await self.versions.get_with_storage(
            organization_id=organization_id,
            document_id=document_id,
        )
        if triple is None:
            raise DocumentNotFoundError("Document not found.")
        document, version, storage_object = triple

        if storage_object.size_bytes > settings.user_max_file_bytes:
            raise QuotaExceededError(
                "File exceeds the maximum allowed size.",
                details={"max_bytes": settings.user_max_file_bytes},
            )

        since = utc_now() - timedelta(days=1)
        count = await self.jobs.count_jobs_today(
            organization_id=organization_id,
            since=since,
        )
        if count >= settings.user_daily_job_quota:
            raise QuotaExceededError(
                "Daily job quota exceeded.",
                details={"quota": settings.user_daily_job_quota},
            )

        params: dict[str, Any] = {
            "document_id": str(document.id),
            "compression_level": compression_level,
            "input_storage_object_id": str(storage_object.id),
            "input_bucket": storage_object.bucket,
            "input_key": storage_object.key,
            "input_size_bytes": storage_object.size_bytes,
            "input_filename": document.name,
            "created_by_user_id": str(user_id),
            "version_id": str(version.id),
        }

        job = await self.jobs.create(
            organization_id=organization_id,
            kind=JobKind.COMPRESS,
            params=params,
            idempotency_key=idempotency_key,
            input_size_bytes=storage_object.size_bytes,
        )

        await self.events.append(
            job_id=job.id,
            status=JobStatus.PENDING,
            payload={"phase": "queued"},
        )
        await self.session.commit()

        await self._publish(
            job_id=job.id,
            status=JobStatus.PENDING,
            payload={"phase": "queued"},
        )

        self._enqueue_compress(job.id)

        log.info(
            "jobs.compress.created",
            job_id=str(job.id),
            document_id=str(document.id),
            level=compression_level,
            replay=False,
        )

        return CreateJobResult(job=job, replay=False)

    def _enqueue_compress(self, job_id: UUID) -> None:
        try:
            from papyrus_api.workers.celery_app import celery_app

            celery_app.send_task(
                "papyrus.pdf.compress",
                args=[str(job_id)],
                task_id=str(job_id),
            )
        except Exception:
            log.warning("jobs.enqueue_failed", job_id=str(job_id))

    async def get(self, *, organization_id: UUID, job_id: UUID) -> JobOut:
        job = await self.jobs.get_for_org(
            organization_id=organization_id,
            job_id=job_id,
        )
        if job is None:
            raise JobNotFoundError("Job not found.")
        phase = await self._latest_phase(job_id=job.id)
        return _job_to_out(job, phase=phase)

    async def get_raw(self, *, organization_id: UUID, job_id: UUID) -> Job:
        job = await self.jobs.get_for_org(
            organization_id=organization_id,
            job_id=job_id,
        )
        if job is None:
            raise JobNotFoundError("Job not found.")
        return job

    async def list(
        self,
        *,
        organization_id: UUID,
        kind: JobKind | None,
        status: JobStatus | None,
        limit: int,
        cursor: str | None,
    ) -> tuple[list[JobOut], str | None]:
        cursor_created_at: datetime | None = None
        cursor_id: UUID | None = None
        if cursor:
            try:
                raw = decode_cursor(cursor)
                created_raw, id_raw = raw.split("|", 1)
                cursor_created_at = datetime.fromisoformat(created_raw)
                cursor_id = UUID(id_raw)
            except (ValueError, TypeError) as exc:
                raise AppError("Invalid cursor.") from exc

        jobs = await self.jobs.list_for_org(
            organization_id=organization_id,
            kind=kind,
            status=status,
            limit=limit,
            cursor_created_at=cursor_created_at,
            cursor_id=cursor_id,
        )
        next_cursor: str | None = None
        if len(jobs) > limit:
            tail = jobs[limit - 1]
            next_cursor = encode_cursor(f"{tail.created_at.isoformat()}|{tail.id}")
            jobs = jobs[:limit]
        items = [_job_to_out(job, phase=None) for job in jobs]
        return items, next_cursor

    async def cancel(
        self,
        *,
        organization_id: UUID,
        job_id: UUID,
    ) -> JobOut:
        job = await self.jobs.get_for_org(
            organization_id=organization_id,
            job_id=job_id,
        )
        if job is None:
            raise JobNotFoundError("Job not found.")
        if job.status in _TERMINAL_STATUSES:
            phase = await self._latest_phase(job_id=job.id)
            return _job_to_out(job, phase=phase)

        cancelled = await self.jobs.mark_cancelled(job_id=job.id)
        assert cancelled is not None
        await self.events.append(
            job_id=cancelled.id,
            status=JobStatus.CANCELLED,
            payload={"phase": "cancelled"},
        )
        await self.session.commit()

        await self.redis.set(f"job:cancel:{cancelled.id}", "1", ex=3600)
        await self._publish(
            job_id=cancelled.id,
            status=JobStatus.CANCELLED,
            payload={"phase": "cancelled"},
        )

        try:
            from papyrus_api.workers.celery_app import celery_app

            celery_app.control.revoke(task_id=str(cancelled.id), terminate=False)
        except Exception:
            log.warning("jobs.revoke_failed", job_id=str(cancelled.id))

        log.info("jobs.compress.cancelled", job_id=str(cancelled.id))
        return _job_to_out(cancelled, phase="cancelled")

    async def mint_download_url(
        self,
        *,
        organization_id: UUID,
        job_id: UUID,
    ) -> DownloadUrlResult:
        job = await self.jobs.get_for_org(
            organization_id=organization_id,
            job_id=job_id,
        )
        if job is None:
            raise JobNotFoundError("Job not found.")
        if job.status != JobStatus.SUCCEEDED:
            raise JobNotTerminalError(
                "Job has not finished successfully.",
                details={"status": job.status.value},
            )
        if job.output_object_id is None:
            raise JobOutputExpiredError("Output is no longer available.")

        storage_object = await self.storage_objects.get(job.output_object_id)
        if storage_object is None:
            raise JobOutputExpiredError("Output is no longer available.")

        original_name = job.params.get("input_filename") if isinstance(job.params, dict) else None
        suggested = _suggest_output_filename(original_name)

        url = await self.storage.presign_download(
            bucket=storage_object.bucket,
            key=storage_object.key,
            filename=suggested,
        )
        expires_at = utc_now() + timedelta(seconds=settings.s3_presign_expires_seconds)
        return DownloadUrlResult(url=url, expires_at=expires_at, filename=suggested)

    async def append_event(
        self,
        *,
        job_id: UUID,
        status: JobStatus,
        payload: dict[str, Any],
    ) -> None:
        await self.events.append(job_id=job_id, status=status, payload=payload)
        await self.session.commit()

    async def publish_event(
        self,
        *,
        job_id: UUID,
        status: JobStatus,
        payload: dict[str, Any],
    ) -> None:
        await self.events.append(job_id=job_id, status=status, payload=payload)
        await self.session.commit()
        await self._publish(job_id=job_id, status=status, payload=payload)

    async def _publish(
        self,
        *,
        job_id: UUID,
        status: JobStatus,
        payload: dict[str, Any],
    ) -> None:
        message = {
            "job_id": str(job_id),
            "status": status.value,
            "payload": payload,
            "ts": utc_now().isoformat(),
        }
        try:
            await self.redis.publish(_channel(job_id), json.dumps(message))
        except Exception:
            log.warning("jobs.publish_failed", job_id=str(job_id))

    async def _latest_phase(self, *, job_id: UUID) -> str | None:
        events = await self.events.list_for_job(job_id=job_id, limit=20)
        for event in reversed(events):
            payload = event.payload or {}
            phase = payload.get("phase") if isinstance(payload, dict) else None
            if isinstance(phase, str):
                return phase
        return None

    @staticmethod
    def event_payload(
        *,
        job_id: UUID,
        status: JobStatus,
        payload: dict[str, Any],
    ) -> str:
        return json.dumps(
            {
                "job_id": str(job_id),
                "status": status.value,
                "payload": payload,
                "ts": utc_now().isoformat(),
            }
        )

    @staticmethod
    def channel(job_id: UUID) -> str:
        return _channel(job_id)


def _suggest_output_filename(original: object) -> str:
    base = "compressed.pdf"
    if isinstance(original, str) and original.strip():
        clean = original.strip().replace("\\", "_").replace("/", "_")
        if clean.lower().endswith(".pdf"):
            stem = clean[:-4]
        else:
            stem = clean
        base = f"{stem}-compressed.pdf"
    return base[:200]


def job_to_out(job: Job, *, phase: str | None) -> JobOut:
    return _job_to_out(job, phase=phase)


__all__ = [
    "_TERMINAL_STATUSES",
    "CreateJobResult",
    "Document",
    "DocumentVersion",
    "DownloadUrlResult",
    "JobService",
    "StorageObject",
    "job_to_out",
]

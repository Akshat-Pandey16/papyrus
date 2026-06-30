from __future__ import annotations

import contextlib
import hashlib
from pathlib import Path
from typing import TYPE_CHECKING, Any
from uuid import UUID

import anyio
import structlog
from botocore.exceptions import BotoCoreError, ClientError
from celery import Task

from papyrus_api.db.session import get_sessionmaker
from papyrus_api.domain.jobs.enums import JobStatus
from papyrus_api.repositories.jobs import JobEventRepository, JobRepository
from papyrus_api.services.job_service import JobService
from papyrus_api.services.pdf.security import decrypt_for_processing

if TYPE_CHECKING:
    from redis.asyncio import Redis
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

    from papyrus_api.services.storage_service import StorageService

log = structlog.get_logger(__name__)


def sha256_of_file(path: Path, *, chunk_size: int = 1024 * 1024) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as fh:
        while True:
            chunk = fh.read(chunk_size)
            if not chunk:
                break
            digest.update(chunk)
    return digest.hexdigest()


class JobCancelledError(Exception):
    pass


class TransientStorageError(Exception):
    pass


def classify_storage_error(exc: BaseException) -> bool:
    if isinstance(exc, ClientError):
        code = exc.response.get("Error", {}).get("Code", "")
        if code in {
            "InternalError",
            "ServiceUnavailable",
            "SlowDown",
            "ThrottlingException",
        }:
            return True
        status = exc.response.get("ResponseMetadata", {}).get("HTTPStatusCode")
        if isinstance(status, int) and 500 <= status < 600:
            return True
    return bool(isinstance(exc, BotoCoreError))


async def purge_input(
    storage: StorageService,
    bucket: str | None,
    key: str | None,
) -> None:
    if not bucket or not key:
        return
    try:
        await storage.delete(bucket=bucket, key=key)
    except Exception as exc:
        log.warning("jobs.zero_retention.input_purge_failed", bucket=bucket, error=str(exc))


async def discard_output(
    storage: StorageService,
    bucket: str | None,
    key: str | None,
) -> None:
    if not bucket or not key:
        return
    try:
        await storage.delete(bucket=bucket, key=key)
    except Exception as exc:
        log.warning("jobs.output.discard_failed", bucket=bucket, error=str(exc))


async def refund_job_quota(organization_id: UUID | None) -> None:
    if organization_id is None:
        return
    from papyrus_api.integrations.redis import get_redis, release_daily_quota

    await release_daily_quota(
        get_redis(), namespace="jobs", principal_id=str(organization_id)
    )


async def decrypt_input_if_needed(
    *,
    redis: Redis,
    organization_id: UUID | None,
    document_id: object,
    input_path: Path,
) -> bool:
    if organization_id is None or not isinstance(document_id, str) or not document_id:
        return False
    from papyrus_api.integrations.redis import input_password_key

    try:
        password = await redis.get(input_password_key(organization_id, document_id))
    except Exception:
        password = None
    if not password:
        return False
    return await anyio.to_thread.run_sync(
        lambda: decrypt_for_processing(input_path=input_path, password=password)
    )


async def check_cancelled(redis: Redis, job_id: UUID) -> None:
    try:
        flag = await redis.get(f"job:cancel:{job_id}")
    except Exception:
        flag = None
    if flag:
        raise JobCancelledError()


async def publish(
    redis: Redis,
    job_id: UUID,
    status: JobStatus,
    payload: dict[str, Any],
) -> None:
    try:
        await redis.publish(
            JobService.channel(job_id),
            JobService.event_payload(job_id=job_id, status=status, payload=payload),
        )
    except Exception:
        log.warning("jobs.publish_failed", job_id=str(job_id))


async def fail_job(
    *,
    sessionmaker: async_sessionmaker[AsyncSession] | None = None,
    session: AsyncSession | None = None,
    job_id: UUID,
    code: str,
    message: str,
) -> bool:
    async def _mark(s: AsyncSession) -> UUID | None:
        repo = JobRepository(s)
        result = await repo.mark_failed(job_id=job_id, error_code=code, error_message=message)
        if result is None:
            return None
        organization_id = result.organization_id
        await JobEventRepository(s).append(
            job_id=job_id,
            status=JobStatus.FAILED,
            payload={"phase": "failed", "error_code": code, "error_message": message},
        )
        await s.commit()
        return organization_id

    if session is not None:
        organization_id = await _mark(session)
    else:
        sm = sessionmaker if sessionmaker is not None else get_sessionmaker()
        async with sm() as s:
            organization_id = await _mark(s)
    if organization_id is None:
        return False
    await refund_job_quota(organization_id)
    return True


async def release_lock(redis: Redis, job_id: UUID, task_id: str) -> None:
    lock_key = f"job:lock:{job_id}"
    try:
        current = await redis.get(lock_key)
    except Exception:
        return
    if current == task_id:
        with contextlib.suppress(Exception):
            await redis.delete(lock_key)


class JobTask(Task):
    def on_failure(
        self,
        exc: BaseException,
        task_id: str,
        args: tuple[Any, ...],
        kwargs: dict[str, Any],
        einfo: Any,
    ) -> None:
        from papyrus_api.integrations.redis import get_redis
        from papyrus_api.workers.runtime import run_async

        if not args:
            return
        try:
            job_id = UUID(str(args[0]))
        except (ValueError, TypeError):
            return

        message = "Processing failed and could not be retried."

        async def _terminate() -> None:
            marked = await fail_job(job_id=job_id, code="internal_error", message=message)
            if not marked:
                return
            await publish(
                get_redis(),
                job_id,
                JobStatus.FAILED,
                {"phase": "failed", "error_code": "internal_error", "error_message": message},
            )

        try:
            run_async(_terminate())
        except Exception:
            log.warning("jobs.on_failure.cleanup_failed", job_id=str(job_id))

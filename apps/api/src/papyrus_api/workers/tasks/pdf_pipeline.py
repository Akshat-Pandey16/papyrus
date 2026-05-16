from __future__ import annotations

import tempfile
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

import anyio
import structlog
from botocore.exceptions import BotoCoreError, ClientError
from celery.exceptions import SoftTimeLimitExceeded
from redis.asyncio import Redis

from papyrus_api.core.config import settings
from papyrus_api.core.errors import AppError, PdfEncryptedError, PdfMalformedError
from papyrus_api.db.session import get_sessionmaker
from papyrus_api.domain.jobs.enums import JobStatus
from papyrus_api.integrations.redis import get_redis
from papyrus_api.repositories.documents import StorageObjectRepository
from papyrus_api.repositories.jobs import JobEventRepository, JobRepository
from papyrus_api.services.job_service import JobService
from papyrus_api.services.pdf.compress import (
    CompressionLevel,
    compress_pdf,
    options_from_payload,
)
from papyrus_api.services.pdf.merge import MergeInput, MergeOptions, merge_pdfs
from papyrus_api.services.storage_service import StorageService
from papyrus_api.workers.celery_app import celery_app
from papyrus_api.workers.runtime import run_async

log = structlog.get_logger(__name__)


class _JobCancelledError(Exception):
    pass


def _classify_storage_error(exc: BaseException) -> bool:
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


async def _check_cancelled(redis: Redis, job_id: UUID) -> None:
    try:
        flag = await redis.get(f"job:cancel:{job_id}")
    except Exception:
        flag = None
    if flag:
        raise _JobCancelledError()


async def _purge_input(storage: StorageService, bucket: str | None, key: str | None) -> None:
    if not bucket or not key:
        return
    try:
        await storage.delete(bucket=bucket, key=key)
    except Exception as exc:
        log.warning("jobs.zero_retention.input_purge_failed", bucket=bucket, error=str(exc))


def _build_merge_options(params: dict[str, Any]) -> MergeOptions:
    raw = params.get("merge_options") or {}
    if not isinstance(raw, dict):
        return MergeOptions()
    blank = raw.get("blank_pages_between")
    if isinstance(blank, bool) or not isinstance(blank, int):
        blank = 0
    pdf_version_raw = raw.get("pdf_version")
    pdf_version = pdf_version_raw if isinstance(pdf_version_raw, str) else None
    compress_raw = raw.get("compress")
    compress_options = None
    if isinstance(compress_raw, dict) and compress_raw:
        compress_options = options_from_payload(
            level=CompressionLevel.CUSTOM,
            overrides=compress_raw,
        )
    return MergeOptions(
        add_filename_bookmarks=bool(raw.get("add_filename_bookmarks", False)),
        blank_pages_between=max(0, min(2, blank)),
        strip_metadata=bool(raw.get("strip_metadata", False)),
        linearize=bool(raw.get("linearize", False)),
        pdf_version=pdf_version,
        compress=compress_options,
    )


async def _run_compress(task_id: str, job_id: UUID) -> None:
    redis = get_redis()

    lock_key = f"job:lock:{job_id}"
    acquired = await redis.set(lock_key, task_id, nx=True, ex=900)
    if not acquired:
        existing_owner = await redis.get(lock_key)
        if existing_owner != task_id:
            log.warning("jobs.compress.duplicate_run", job_id=str(job_id))
            return

    structlog.contextvars.bind_contextvars(
        job_id=str(job_id),
        task_id=task_id,
    )

    sessionmaker = get_sessionmaker()
    storage = StorageService()

    async with sessionmaker() as session:
        job_repo = JobRepository(session)
        job = await job_repo.get_unscoped(job_id=job_id)
        if job is None:
            log.warning("jobs.compress.missing", job_id=str(job_id))
            return

        if job.status in (
            JobStatus.SUCCEEDED,
            JobStatus.FAILED,
            JobStatus.CANCELLED,
        ):
            log.info("jobs.compress.already_terminal", status=job.status.value)
            return

        structlog.contextvars.bind_contextvars(
            organization_id=str(job.organization_id),
        )

        params: dict[str, Any] = dict(job.params or {})
        try:
            input_bucket = params["input_bucket"]
            input_key = params["input_key"]
            level_raw = params["compression_level"]
            level = CompressionLevel(level_raw)
            overrides_raw = params.get("compression_options") or {}
            if not isinstance(overrides_raw, dict):
                raise ValueError("compression_options must be a dict")
            compress_options = options_from_payload(level=level, overrides=overrides_raw)
        except (KeyError, ValueError) as exc:
            await _fail(
                session=session,
                job_id=job_id,
                code="invalid_params",
                message="Job parameters are invalid.",
            )
            await _publish(
                redis,
                job_id,
                JobStatus.FAILED,
                {
                    "phase": "failed",
                    "error_code": "invalid_params",
                    "error_message": "Job parameters are invalid.",
                },
            )
            log.warning("jobs.compress.invalid_params", error=str(exc))
            return

        await job_repo.mark_running(job_id=job.id)
        await JobEventRepository(session).append(
            job_id=job.id,
            status=JobStatus.RUNNING,
            payload={"phase": "downloading"},
        )
        await session.commit()
        await _publish(redis, job.id, JobStatus.RUNNING, {"phase": "downloading"})
        log.info("jobs.compress.started", input_size_bytes=job.input_size_bytes)

    try:
        with tempfile.TemporaryDirectory(prefix="papyrus-compress-") as tmp_root:
            tmp_dir = Path(tmp_root)
            input_path = tmp_dir / "input.pdf"
            output_path = tmp_dir / "output.pdf"

            try:
                await storage.download_to_path(
                    bucket=input_bucket,
                    key=input_key,
                    dest=input_path,
                    max_bytes=settings.user_max_file_bytes,
                )
            except (ClientError, BotoCoreError) as exc:
                if _classify_storage_error(exc):
                    raise _TransientStorageError(str(exc)) from exc
                raise

            await _check_cancelled(redis, job_id)

            async with sessionmaker() as session:
                await JobEventRepository(session).append(
                    job_id=job_id,
                    status=JobStatus.RUNNING,
                    payload={"phase": "compressing"},
                )
                await session.commit()
            await _publish(redis, job_id, JobStatus.RUNNING, {"phase": "compressing"})

            def _on_progress(_label: str) -> None:
                pass

            result = await anyio.to_thread.run_sync(
                lambda: compress_pdf(
                    input_path=input_path,
                    output_path=output_path,
                    level=level,
                    options=compress_options,
                    progress=_on_progress,
                )
            )

            await _check_cancelled(redis, job_id)

            async with sessionmaker() as session:
                await JobEventRepository(session).append(
                    job_id=job_id,
                    status=JobStatus.RUNNING,
                    payload={"phase": "uploading"},
                )
                await session.commit()
            await _publish(redis, job_id, JobStatus.RUNNING, {"phase": "uploading"})

            output_bucket = settings.s3_bucket_outputs
            output_key = f"org/{job.organization_id}/outputs/{job_id}/{uuid4().hex}.pdf"

            try:
                await storage.upload_from_path(
                    bucket=output_bucket,
                    key=output_key,
                    src=output_path,
                    content_type="application/pdf",
                )
            except (ClientError, BotoCoreError) as exc:
                if _classify_storage_error(exc):
                    raise _TransientStorageError(str(exc)) from exc
                raise

            async with sessionmaker() as session:
                so_repo = StorageObjectRepository(session)
                output_obj = await so_repo.create_placeholder(
                    bucket=output_bucket,
                    key=output_key,
                    size_bytes=result.output_size_bytes,
                    content_type="application/pdf",
                    purpose="output",
                )
                from papyrus_api.core.time import utc_now

                await so_repo.mark_confirmed(
                    storage_object_id=output_obj.id,
                    sha256=None,
                    size_bytes=result.output_size_bytes,
                    confirmed_at=utc_now(),
                )

                job_repo = JobRepository(session)
                await job_repo.mark_succeeded(
                    job_id=job_id,
                    output_object_id=output_obj.id,
                    output_size_bytes=result.output_size_bytes,
                    compression_ratio=result.ratio,
                )
                event_payload = {
                    "phase": "done",
                    "output_object_id": str(output_obj.id),
                    "output_size_bytes": result.output_size_bytes,
                    "input_size_bytes": result.input_size_bytes,
                    "compression_ratio": result.ratio,
                    "page_count": result.page_count,
                    "images_processed": result.images_processed,
                    "images_recompressed": result.images_recompressed,
                    "images_downsampled": result.images_downsampled,
                    "metadata_stripped": result.metadata_stripped,
                }
                await JobEventRepository(session).append(
                    job_id=job_id,
                    status=JobStatus.SUCCEEDED,
                    payload=event_payload,
                )
                await session.commit()

            await _publish(redis, job_id, JobStatus.SUCCEEDED, event_payload)

            log.info(
                "jobs.compress.succeeded",
                input_size_bytes=result.input_size_bytes,
                output_size_bytes=result.output_size_bytes,
                ratio=result.ratio,
                page_count=result.page_count,
            )
            if settings.zero_retention_mode:
                await _purge_input(storage, input_bucket, input_key)
    except _JobCancelledError:
        log.info("jobs.compress.cancelled_during_run")
        await _publish(redis, job_id, JobStatus.CANCELLED, {"phase": "cancelled"})
        return
    except SoftTimeLimitExceeded:
        await _fail(
            sessionmaker=sessionmaker,
            job_id=job_id,
            code="job_timeout",
            message="Compression took too long. Try a lower compression level.",
        )
        await _publish(
            redis,
            job_id,
            JobStatus.FAILED,
            {
                "phase": "failed",
                "error_code": "job_timeout",
                "error_message": "Compression took too long. Try a lower compression level.",
            },
        )
        log.warning("jobs.compress.timeout")
        return
    except (PdfEncryptedError, PdfMalformedError) as exc:
        await _fail(
            sessionmaker=sessionmaker,
            job_id=job_id,
            code=exc.code,
            message=exc.message,
        )
        await _publish(
            redis,
            job_id,
            JobStatus.FAILED,
            {
                "phase": "failed",
                "error_code": exc.code,
                "error_message": exc.message,
            },
        )
        log.warning("jobs.compress.failed", error_code=exc.code)
        return
    except _TransientStorageError:
        raise
    except AppError as exc:
        await _fail(
            sessionmaker=sessionmaker,
            job_id=job_id,
            code=exc.code,
            message=exc.message,
        )
        await _publish(
            redis,
            job_id,
            JobStatus.FAILED,
            {
                "phase": "failed",
                "error_code": exc.code,
                "error_message": exc.message,
            },
        )
        log.warning("jobs.compress.failed", error_code=exc.code)
        return
    except Exception as exc:
        await _fail(
            sessionmaker=sessionmaker,
            job_id=job_id,
            code="internal_error",
            message="An unexpected error occurred during compression.",
        )
        await _publish(
            redis,
            job_id,
            JobStatus.FAILED,
            {
                "phase": "failed",
                "error_code": "internal_error",
                "error_message": "An unexpected error occurred during compression.",
            },
        )
        log.exception("jobs.compress.unhandled", exc_class=type(exc).__name__)
        return


class _TransientStorageError(Exception):
    pass


async def _fail(
    *,
    sessionmaker: Any | None = None,
    session: Any | None = None,
    job_id: UUID,
    code: str,
    message: str,
) -> None:
    if session is not None:
        repo = JobRepository(session)
        await repo.mark_failed(job_id=job_id, error_code=code, error_message=message)
        await JobEventRepository(session).append(
            job_id=job_id,
            status=JobStatus.FAILED,
            payload={"phase": "failed", "error_code": code, "error_message": message},
        )
        await session.commit()
        return
    if sessionmaker is None:
        sessionmaker = get_sessionmaker()
    async with sessionmaker() as s:
        repo = JobRepository(s)
        await repo.mark_failed(job_id=job_id, error_code=code, error_message=message)
        await JobEventRepository(s).append(
            job_id=job_id,
            status=JobStatus.FAILED,
            payload={"phase": "failed", "error_code": code, "error_message": message},
        )
        await s.commit()


async def _publish(redis: Redis, job_id: UUID, status: JobStatus, payload: dict[str, Any]) -> None:
    try:
        await redis.publish(
            JobService.channel(job_id),
            JobService.event_payload(
                job_id=job_id,
                status=status,
                payload=payload,
            ),
        )
    except Exception:
        log.warning("jobs.publish_failed", job_id=str(job_id))


@celery_app.task(
    name="papyrus.pdf.compress",
    bind=True,
    autoretry_for=(_TransientStorageError,),
    retry_backoff=True,
    retry_backoff_max=60,
    retry_jitter=True,
    max_retries=3,
    acks_late=True,
    reject_on_worker_lost=True,
)
def compress(self: Any, job_id: str) -> str:
    run_async(_run_compress(self.request.id or str(uuid4()), UUID(job_id)))
    return job_id


async def _run_merge(task_id: str, job_id: UUID) -> None:
    redis = get_redis()

    lock_key = f"job:lock:{job_id}"
    acquired = await redis.set(lock_key, task_id, nx=True, ex=900)
    if not acquired:
        existing_owner = await redis.get(lock_key)
        if existing_owner != task_id:
            log.warning("jobs.merge.duplicate_run", job_id=str(job_id))
            return

    structlog.contextvars.bind_contextvars(
        job_id=str(job_id),
        task_id=task_id,
    )

    sessionmaker = get_sessionmaker()
    storage = StorageService()

    async with sessionmaker() as session:
        job_repo = JobRepository(session)
        job = await job_repo.get_unscoped(job_id=job_id)
        if job is None:
            log.warning("jobs.merge.missing", job_id=str(job_id))
            return

        if job.status in (
            JobStatus.SUCCEEDED,
            JobStatus.FAILED,
            JobStatus.CANCELLED,
        ):
            log.info("jobs.merge.already_terminal", status=job.status.value)
            return

        structlog.contextvars.bind_contextvars(
            organization_id=str(job.organization_id),
        )

        params: dict[str, Any] = dict(job.params or {})
        try:
            inputs_raw = params["inputs"]
            if not isinstance(inputs_raw, list) or len(inputs_raw) < 2:
                raise ValueError("inputs must be a list of length >= 2")
            inputs: list[dict[str, Any]] = []
            for item in inputs_raw:
                if not isinstance(item, dict):
                    raise ValueError("input entry must be an object")
                bucket = item["input_bucket"]
                key = item["input_key"]
                if not isinstance(bucket, str) or not isinstance(key, str):
                    raise ValueError("input_bucket/input_key must be strings")
                inputs.append(item)
        except (KeyError, ValueError) as exc:
            await _fail(
                session=session,
                job_id=job_id,
                code="invalid_params",
                message="Job parameters are invalid.",
            )
            await _publish(
                redis,
                job_id,
                JobStatus.FAILED,
                {
                    "phase": "failed",
                    "error_code": "invalid_params",
                    "error_message": "Job parameters are invalid.",
                },
            )
            log.warning("jobs.merge.invalid_params", error=str(exc))
            return

        await job_repo.mark_running(job_id=job.id)
        await JobEventRepository(session).append(
            job_id=job.id,
            status=JobStatus.RUNNING,
            payload={"phase": "downloading"},
        )
        await session.commit()
        await _publish(redis, job.id, JobStatus.RUNNING, {"phase": "downloading"})
        log.info(
            "jobs.merge.started",
            input_count=len(inputs),
            input_size_bytes=job.input_size_bytes,
        )

    try:
        with tempfile.TemporaryDirectory(prefix="papyrus-merge-") as tmp_root:
            tmp_dir = Path(tmp_root)
            merge_inputs: list[MergeInput] = []
            for index, item in enumerate(inputs):
                dest = tmp_dir / f"input-{index:04d}.pdf"
                try:
                    await storage.download_to_path(
                        bucket=item["input_bucket"],
                        key=item["input_key"],
                        dest=dest,
                        max_bytes=settings.user_max_file_bytes,
                    )
                except (ClientError, BotoCoreError) as exc:
                    if _classify_storage_error(exc):
                        raise _TransientStorageError(str(exc)) from exc
                    raise
                page_ranges_raw = item.get("page_ranges")
                page_ranges = (
                    page_ranges_raw
                    if isinstance(page_ranges_raw, str) and page_ranges_raw.strip()
                    else None
                )
                merge_inputs.append(
                    MergeInput(
                        path=dest,
                        label=str(item.get("input_filename") or f"Document {index + 1}"),
                        page_ranges=page_ranges,
                    )
                )

            await _check_cancelled(redis, job_id)

            output_path = tmp_dir / "output.pdf"

            async with sessionmaker() as session:
                await JobEventRepository(session).append(
                    job_id=job_id,
                    status=JobStatus.RUNNING,
                    payload={"phase": "merging"},
                )
                await session.commit()
            await _publish(redis, job_id, JobStatus.RUNNING, {"phase": "merging"})

            def _on_progress(_label: str) -> None:
                pass

            merge_options = _build_merge_options(params)
            inputs_for_thread = list(merge_inputs)
            result = await anyio.to_thread.run_sync(
                lambda: merge_pdfs(
                    inputs=inputs_for_thread,
                    output_path=output_path,
                    options=merge_options,
                    progress=_on_progress,
                )
            )

            await _check_cancelled(redis, job_id)

            async with sessionmaker() as session:
                await JobEventRepository(session).append(
                    job_id=job_id,
                    status=JobStatus.RUNNING,
                    payload={"phase": "uploading"},
                )
                await session.commit()
            await _publish(redis, job_id, JobStatus.RUNNING, {"phase": "uploading"})

            output_bucket = settings.s3_bucket_outputs
            output_key = f"org/{job.organization_id}/outputs/{job_id}/{uuid4().hex}.pdf"

            try:
                await storage.upload_from_path(
                    bucket=output_bucket,
                    key=output_key,
                    src=output_path,
                    content_type="application/pdf",
                )
            except (ClientError, BotoCoreError) as exc:
                if _classify_storage_error(exc):
                    raise _TransientStorageError(str(exc)) from exc
                raise

            async with sessionmaker() as session:
                so_repo = StorageObjectRepository(session)
                output_obj = await so_repo.create_placeholder(
                    bucket=output_bucket,
                    key=output_key,
                    size_bytes=result.output_size_bytes,
                    content_type="application/pdf",
                    purpose="output",
                )
                from papyrus_api.core.time import utc_now

                await so_repo.mark_confirmed(
                    storage_object_id=output_obj.id,
                    sha256=None,
                    size_bytes=result.output_size_bytes,
                    confirmed_at=utc_now(),
                )

                job_repo = JobRepository(session)
                await job_repo.mark_succeeded(
                    job_id=job_id,
                    output_object_id=output_obj.id,
                    output_size_bytes=result.output_size_bytes,
                )
                event_payload = {
                    "phase": "done",
                    "output_object_id": str(output_obj.id),
                    "output_size_bytes": result.output_size_bytes,
                    "input_size_bytes": result.input_size_bytes,
                    "page_count": result.page_count,
                    "input_count": result.input_count,
                    "bookmarks_added": result.bookmarks_added,
                    "blank_pages_added": result.blank_pages_added,
                    "compressed": result.compressed,
                }
                await JobEventRepository(session).append(
                    job_id=job_id,
                    status=JobStatus.SUCCEEDED,
                    payload=event_payload,
                )
                await session.commit()

            await _publish(redis, job_id, JobStatus.SUCCEEDED, event_payload)

            log.info(
                "jobs.merge.succeeded",
                input_size_bytes=result.input_size_bytes,
                output_size_bytes=result.output_size_bytes,
                page_count=result.page_count,
                input_count=result.input_count,
            )
            if settings.zero_retention_mode:
                for item in inputs:
                    await _purge_input(storage, item.get("input_bucket"), item.get("input_key"))
    except _JobCancelledError:
        log.info("jobs.merge.cancelled_during_run")
        await _publish(redis, job_id, JobStatus.CANCELLED, {"phase": "cancelled"})
        return
    except SoftTimeLimitExceeded:
        await _fail(
            sessionmaker=sessionmaker,
            job_id=job_id,
            code="job_timeout",
            message="Merging took too long. Try fewer or smaller files.",
        )
        await _publish(
            redis,
            job_id,
            JobStatus.FAILED,
            {
                "phase": "failed",
                "error_code": "job_timeout",
                "error_message": "Merging took too long. Try fewer or smaller files.",
            },
        )
        log.warning("jobs.merge.timeout")
        return
    except (PdfEncryptedError, PdfMalformedError) as exc:
        await _fail(
            sessionmaker=sessionmaker,
            job_id=job_id,
            code=exc.code,
            message=exc.message,
        )
        await _publish(
            redis,
            job_id,
            JobStatus.FAILED,
            {
                "phase": "failed",
                "error_code": exc.code,
                "error_message": exc.message,
            },
        )
        log.warning("jobs.merge.failed", error_code=exc.code)
        return
    except _TransientStorageError:
        raise
    except AppError as exc:
        await _fail(
            sessionmaker=sessionmaker,
            job_id=job_id,
            code=exc.code,
            message=exc.message,
        )
        await _publish(
            redis,
            job_id,
            JobStatus.FAILED,
            {
                "phase": "failed",
                "error_code": exc.code,
                "error_message": exc.message,
            },
        )
        log.warning("jobs.merge.failed", error_code=exc.code)
        return
    except Exception as exc:
        await _fail(
            sessionmaker=sessionmaker,
            job_id=job_id,
            code="internal_error",
            message="An unexpected error occurred during merge.",
        )
        await _publish(
            redis,
            job_id,
            JobStatus.FAILED,
            {
                "phase": "failed",
                "error_code": "internal_error",
                "error_message": "An unexpected error occurred during merge.",
            },
        )
        log.exception("jobs.merge.unhandled", exc_class=type(exc).__name__)
        return


@celery_app.task(
    name="papyrus.pdf.merge",
    bind=True,
    autoretry_for=(_TransientStorageError,),
    retry_backoff=True,
    retry_backoff_max=60,
    retry_jitter=True,
    max_retries=3,
    acks_late=True,
    reject_on_worker_lost=True,
)
def merge(self: Any, job_id: str) -> str:
    run_async(_run_merge(self.request.id or str(uuid4()), UUID(job_id)))
    return job_id

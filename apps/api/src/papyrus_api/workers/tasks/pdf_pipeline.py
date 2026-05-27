from __future__ import annotations

import tempfile
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

import anyio
import structlog
from botocore.exceptions import BotoCoreError, ClientError
from celery.exceptions import SoftTimeLimitExceeded

from papyrus_api.core.config import settings
from papyrus_api.core.errors import AppError, PdfEncryptedError, PdfMalformedError
from papyrus_api.core.time import utc_now
from papyrus_api.db.session import get_sessionmaker
from papyrus_api.domain.jobs.enums import JobStatus
from papyrus_api.integrations.redis import get_redis
from papyrus_api.repositories.documents import StorageObjectRepository
from papyrus_api.repositories.jobs import JobEventRepository, JobRepository
from papyrus_api.services.pdf.compress import (
    CompressionLevel,
    compress_pdf,
    options_from_payload,
)
from papyrus_api.services.pdf.merge import MergeInput, MergeOptions, merge_pdfs
from papyrus_api.services.storage_service import StorageService
from papyrus_api.workers.celery_app import celery_app
from papyrus_api.workers.runtime import run_async
from papyrus_api.workers.tasks._common import (
    JobCancelledError,
    JobTask,
    TransientStorageError,
    check_cancelled,
    classify_storage_error,
    fail_job,
    publish,
    purge_input,
    release_lock,
    sha256_of_file,
)

log = structlog.get_logger(__name__)


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

    input_bucket: str | None = None
    input_key: str | None = None
    organization_id: UUID | None = None
    level: CompressionLevel | None = None
    compress_options = None

    try:
        async with sessionmaker() as session:
            job_repo = JobRepository(session)
            job = await job_repo.get_for_worker(job_id=job_id)
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

            organization_id = job.organization_id
            structlog.contextvars.bind_contextvars(
                organization_id=str(organization_id),
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
                await fail_job(
                    session=session,
                    job_id=job_id,
                    code="invalid_params",
                    message="Job parameters are invalid.",
                )
                await publish(
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

            claimed = await job_repo.mark_running(job_id=job.id)
            if claimed is None:
                await session.rollback()
                log.info("jobs.compress.claim_failed", job_id=str(job_id))
                await publish(
                    redis,
                    job_id,
                    JobStatus.CANCELLED,
                    {"phase": "cancelled"},
                )
                return
            await JobEventRepository(session).append(
                job_id=job.id,
                status=JobStatus.RUNNING,
                payload={"phase": "downloading"},
            )
            await session.commit()
            await publish(redis, job.id, JobStatus.RUNNING, {"phase": "downloading"})
            log.info("jobs.compress.started", input_size_bytes=job.input_size_bytes)

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
                if classify_storage_error(exc):
                    raise TransientStorageError(str(exc)) from exc
                raise

            await check_cancelled(redis, job_id)

            async with sessionmaker() as session:
                await JobEventRepository(session).append(
                    job_id=job_id,
                    status=JobStatus.RUNNING,
                    payload={"phase": "compressing"},
                )
                await session.commit()
            await publish(redis, job_id, JobStatus.RUNNING, {"phase": "compressing"})

            def _on_progress(_label: str) -> None:
                pass

            assert level is not None
            assert compress_options is not None
            result = await anyio.to_thread.run_sync(
                lambda: compress_pdf(
                    input_path=input_path,
                    output_path=output_path,
                    level=level,
                    options=compress_options,
                    progress=_on_progress,
                )
            )

            await check_cancelled(redis, job_id)

            async with sessionmaker() as session:
                await JobEventRepository(session).append(
                    job_id=job_id,
                    status=JobStatus.RUNNING,
                    payload={"phase": "uploading"},
                )
                await session.commit()
            await publish(redis, job_id, JobStatus.RUNNING, {"phase": "uploading"})

            output_bucket = settings.s3_bucket_outputs
            output_key = f"org/{organization_id}/outputs/{job_id}/{uuid4().hex}.pdf"

            output_sha256 = await anyio.to_thread.run_sync(sha256_of_file, output_path)

            try:
                await storage.upload_from_path(
                    bucket=output_bucket,
                    key=output_key,
                    src=output_path,
                    content_type="application/pdf",
                )
            except (ClientError, BotoCoreError) as exc:
                if classify_storage_error(exc):
                    raise TransientStorageError(str(exc)) from exc
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
                await so_repo.mark_confirmed(
                    storage_object_id=output_obj.id,
                    sha256=output_sha256,
                    size_bytes=result.output_size_bytes,
                    confirmed_at=utc_now(),
                )

                job_repo = JobRepository(session)
                succeeded = await job_repo.mark_succeeded(
                    job_id=job_id,
                    output_object_id=output_obj.id,
                    output_size_bytes=result.output_size_bytes,
                    compression_ratio=result.ratio,
                )
                if succeeded is None:
                    await session.rollback()
                    log.info("jobs.compress.succeed_blocked", job_id=str(job_id))
                    return
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

            await publish(redis, job_id, JobStatus.SUCCEEDED, event_payload)

            log.info(
                "jobs.compress.succeeded",
                input_size_bytes=result.input_size_bytes,
                output_size_bytes=result.output_size_bytes,
                ratio=result.ratio,
                page_count=result.page_count,
            )
            if settings.zero_retention_mode or params.get("zero_retention"):
                await purge_input(storage, input_bucket, input_key)
    except JobCancelledError:
        log.info("jobs.compress.cancelled_during_run")
        await publish(redis, job_id, JobStatus.CANCELLED, {"phase": "cancelled"})
        return
    except SoftTimeLimitExceeded:
        await fail_job(
            sessionmaker=sessionmaker,
            job_id=job_id,
            code="job_timeout",
            message="Compression took too long. Try a lower compression level.",
        )
        await publish(
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
        await fail_job(
            sessionmaker=sessionmaker,
            job_id=job_id,
            code=exc.code,
            message=exc.message,
        )
        await publish(
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
    except TransientStorageError:
        raise
    except AppError as exc:
        await fail_job(
            sessionmaker=sessionmaker,
            job_id=job_id,
            code=exc.code,
            message=exc.message,
        )
        await publish(
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
        await fail_job(
            sessionmaker=sessionmaker,
            job_id=job_id,
            code="internal_error",
            message="An unexpected error occurred during compression.",
        )
        await publish(
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
    finally:
        structlog.contextvars.unbind_contextvars("job_id", "task_id", "organization_id")
        await release_lock(redis, job_id, task_id)


@celery_app.task(
    name="papyrus.pdf.compress",
    base=JobTask,
    bind=True,
    autoretry_for=(TransientStorageError,),
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

    inputs: list[dict[str, Any]] = []
    organization_id: UUID | None = None
    params: dict[str, Any] = {}

    try:
        async with sessionmaker() as session:
            job_repo = JobRepository(session)
            job = await job_repo.get_for_worker(job_id=job_id)
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

            organization_id = job.organization_id
            structlog.contextvars.bind_contextvars(
                organization_id=str(organization_id),
            )

            params = dict(job.params or {})
            try:
                inputs_raw = params["inputs"]
                if not isinstance(inputs_raw, list) or len(inputs_raw) < 2:
                    raise ValueError("inputs must be a list of length >= 2")
                for item in inputs_raw:
                    if not isinstance(item, dict):
                        raise ValueError("input entry must be an object")
                    bucket = item["input_bucket"]
                    key = item["input_key"]
                    if not isinstance(bucket, str) or not isinstance(key, str):
                        raise ValueError("input_bucket/input_key must be strings")
                    inputs.append(item)
            except (KeyError, ValueError) as exc:
                await fail_job(
                    session=session,
                    job_id=job_id,
                    code="invalid_params",
                    message="Job parameters are invalid.",
                )
                await publish(
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

            claimed = await job_repo.mark_running(job_id=job.id)
            if claimed is None:
                await session.rollback()
                log.info("jobs.merge.claim_failed", job_id=str(job_id))
                await publish(
                    redis,
                    job_id,
                    JobStatus.CANCELLED,
                    {"phase": "cancelled"},
                )
                return
            await JobEventRepository(session).append(
                job_id=job.id,
                status=JobStatus.RUNNING,
                payload={"phase": "downloading"},
            )
            await session.commit()
            await publish(redis, job.id, JobStatus.RUNNING, {"phase": "downloading"})
            log.info(
                "jobs.merge.started",
                input_count=len(inputs),
                input_size_bytes=job.input_size_bytes,
            )

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
                    if classify_storage_error(exc):
                        raise TransientStorageError(str(exc)) from exc
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

            await check_cancelled(redis, job_id)

            output_path = tmp_dir / "output.pdf"

            async with sessionmaker() as session:
                await JobEventRepository(session).append(
                    job_id=job_id,
                    status=JobStatus.RUNNING,
                    payload={"phase": "merging"},
                )
                await session.commit()
            await publish(redis, job_id, JobStatus.RUNNING, {"phase": "merging"})

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

            await check_cancelled(redis, job_id)

            async with sessionmaker() as session:
                await JobEventRepository(session).append(
                    job_id=job_id,
                    status=JobStatus.RUNNING,
                    payload={"phase": "uploading"},
                )
                await session.commit()
            await publish(redis, job_id, JobStatus.RUNNING, {"phase": "uploading"})

            output_bucket = settings.s3_bucket_outputs
            output_key = f"org/{organization_id}/outputs/{job_id}/{uuid4().hex}.pdf"

            output_sha256 = await anyio.to_thread.run_sync(sha256_of_file, output_path)

            try:
                await storage.upload_from_path(
                    bucket=output_bucket,
                    key=output_key,
                    src=output_path,
                    content_type="application/pdf",
                )
            except (ClientError, BotoCoreError) as exc:
                if classify_storage_error(exc):
                    raise TransientStorageError(str(exc)) from exc
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
                await so_repo.mark_confirmed(
                    storage_object_id=output_obj.id,
                    sha256=output_sha256,
                    size_bytes=result.output_size_bytes,
                    confirmed_at=utc_now(),
                )

                job_repo = JobRepository(session)
                succeeded = await job_repo.mark_succeeded(
                    job_id=job_id,
                    output_object_id=output_obj.id,
                    output_size_bytes=result.output_size_bytes,
                )
                if succeeded is None:
                    await session.rollback()
                    log.info("jobs.merge.succeed_blocked", job_id=str(job_id))
                    return
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

            await publish(redis, job_id, JobStatus.SUCCEEDED, event_payload)

            log.info(
                "jobs.merge.succeeded",
                input_size_bytes=result.input_size_bytes,
                output_size_bytes=result.output_size_bytes,
                page_count=result.page_count,
                input_count=result.input_count,
            )
            if settings.zero_retention_mode or params.get("zero_retention"):
                for item in inputs:
                    await purge_input(storage, item.get("input_bucket"), item.get("input_key"))
    except JobCancelledError:
        log.info("jobs.merge.cancelled_during_run")
        await publish(redis, job_id, JobStatus.CANCELLED, {"phase": "cancelled"})
        return
    except SoftTimeLimitExceeded:
        await fail_job(
            sessionmaker=sessionmaker,
            job_id=job_id,
            code="job_timeout",
            message="Merging took too long. Try fewer or smaller files.",
        )
        await publish(
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
        await fail_job(
            sessionmaker=sessionmaker,
            job_id=job_id,
            code=exc.code,
            message=exc.message,
        )
        await publish(
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
    except TransientStorageError:
        raise
    except AppError as exc:
        await fail_job(
            sessionmaker=sessionmaker,
            job_id=job_id,
            code=exc.code,
            message=exc.message,
        )
        await publish(
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
        await fail_job(
            sessionmaker=sessionmaker,
            job_id=job_id,
            code="internal_error",
            message="An unexpected error occurred during merge.",
        )
        await publish(
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
    finally:
        structlog.contextvars.unbind_contextvars("job_id", "task_id", "organization_id")
        await release_lock(redis, job_id, task_id)


@celery_app.task(
    name="papyrus.pdf.merge",
    base=JobTask,
    bind=True,
    autoretry_for=(TransientStorageError,),
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

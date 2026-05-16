from __future__ import annotations

import tempfile
from collections.abc import Awaitable, Callable
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
from papyrus_api.core.time import utc_now
from papyrus_api.db.session import get_sessionmaker
from papyrus_api.domain.jobs.enums import JobStatus
from papyrus_api.integrations.redis import get_redis
from papyrus_api.repositories.documents import StorageObjectRepository
from papyrus_api.repositories.jobs import JobEventRepository, JobRepository
from papyrus_api.services.job_service import JobService
from papyrus_api.services.pdf.compress import (
    CompressionLevel,
    options_from_payload,
)
from papyrus_api.services.pdf.ocr import OcrNotConfiguredError, ocr_pdf
from papyrus_api.services.pdf.reorder import reorder_pdf
from papyrus_api.services.pdf.rotate import rotate_pdf
from papyrus_api.services.pdf.split import SplitMode, SplitOptions, split_pdf
from papyrus_api.services.storage_service import StorageService
from papyrus_api.workers.celery_app import celery_app
from papyrus_api.workers.runtime import run_async

log = structlog.get_logger(__name__)


class _JobCancelledError(Exception):
    pass


class _TransientStorageError(Exception):
    pass


def _classify_storage_error(exc: BaseException) -> bool:
    if isinstance(exc, ClientError):
        code = exc.response.get("Error", {}).get("Code", "")
        if code in {"InternalError", "ServiceUnavailable", "SlowDown", "ThrottlingException"}:
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


async def _publish(redis: Redis, job_id: UUID, status: JobStatus, payload: dict[str, Any]) -> None:
    try:
        await redis.publish(
            JobService.channel(job_id),
            JobService.event_payload(job_id=job_id, status=status, payload=payload),
        )
    except Exception:
        log.warning("jobs.publish_failed", job_id=str(job_id))


async def _fail(*, job_id: UUID, code: str, message: str) -> None:
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


ProcessFn = Callable[[Path, Path, dict[str, Any]], Awaitable[dict[str, Any]]]


async def _run_simple_job(
    *,
    task_id: str,
    job_id: UUID,
    kind_label: str,
    process: ProcessFn,
    output_extension: str = "pdf",
    output_content_type: str = "application/pdf",
) -> None:
    redis = get_redis()
    lock_key = f"job:lock:{job_id}"
    acquired = await redis.set(lock_key, task_id, nx=True, ex=900)
    if not acquired:
        existing_owner = await redis.get(lock_key)
        if existing_owner != task_id:
            log.warning("jobs.tool.duplicate_run", kind=kind_label, job_id=str(job_id))
            return

    structlog.contextvars.bind_contextvars(job_id=str(job_id), task_id=task_id, kind=kind_label)
    sessionmaker = get_sessionmaker()
    storage = StorageService()

    async with sessionmaker() as session:
        job = await JobRepository(session).get_unscoped(job_id=job_id)
        if job is None:
            log.warning("jobs.tool.missing", job_id=str(job_id))
            return
        if job.status in (JobStatus.SUCCEEDED, JobStatus.FAILED, JobStatus.CANCELLED):
            log.info("jobs.tool.already_terminal", status=job.status.value)
            return
        structlog.contextvars.bind_contextvars(organization_id=str(job.organization_id))
        params: dict[str, Any] = dict(job.params or {})
        try:
            input_bucket = params["input_bucket"]
            input_key = params["input_key"]
        except KeyError as exc:
            await _fail(job_id=job_id, code="invalid_params", message="Job parameters are invalid.")
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
            log.warning("jobs.tool.invalid_params", error=str(exc))
            return

        await JobRepository(session).mark_running(job_id=job.id)
        await JobEventRepository(session).append(
            job_id=job.id,
            status=JobStatus.RUNNING,
            payload={"phase": "downloading"},
        )
        await session.commit()
        await _publish(redis, job.id, JobStatus.RUNNING, {"phase": "downloading"})

    try:
        with tempfile.TemporaryDirectory(prefix=f"papyrus-{kind_label}-") as tmp_root:
            tmp_dir = Path(tmp_root)
            input_path = tmp_dir / "input.pdf"
            output_path = tmp_dir / f"output.{output_extension}"

            try:
                await storage.download_to_path(
                    bucket=input_bucket, key=input_key, dest=input_path
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
                    payload={"phase": "processing"},
                )
                await session.commit()
            await _publish(redis, job_id, JobStatus.RUNNING, {"phase": "processing"})

            stats = await process(input_path, output_path, params)
            actual_output = output_path
            actual_extension = output_extension
            actual_content_type = output_content_type
            if isinstance(stats, dict):
                override_path = stats.pop("_output_path", None)
                if isinstance(override_path, str):
                    actual_output = Path(override_path)
                override_ext = stats.pop("_output_extension", None)
                if isinstance(override_ext, str):
                    actual_extension = override_ext
                override_ct = stats.pop("_output_content_type", None)
                if isinstance(override_ct, str):
                    actual_content_type = override_ct
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
            output_key = (
                f"org/{job.organization_id}/outputs/{job_id}/"
                f"{uuid4().hex}.{actual_extension}"
            )

            try:
                await storage.upload_from_path(
                    bucket=output_bucket,
                    key=output_key,
                    src=actual_output,
                    content_type=actual_content_type,
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
                    size_bytes=int(stats.get("output_size_bytes", 0)),
                    content_type=actual_content_type,
                    purpose="output",
                )
                await so_repo.mark_confirmed(
                    storage_object_id=output_obj.id,
                    sha256=None,
                    size_bytes=int(stats.get("output_size_bytes", 0)),
                    confirmed_at=utc_now(),
                )
                await JobRepository(session).mark_succeeded(
                    job_id=job_id,
                    output_object_id=output_obj.id,
                    output_size_bytes=int(stats.get("output_size_bytes", 0)),
                )
                event_payload = {"phase": "done", "output_object_id": str(output_obj.id), **stats}
                await JobEventRepository(session).append(
                    job_id=job_id,
                    status=JobStatus.SUCCEEDED,
                    payload=event_payload,
                )
                await session.commit()
            await _publish(redis, job_id, JobStatus.SUCCEEDED, event_payload)
            log.info("jobs.tool.succeeded", kind=kind_label, **stats)
    except _JobCancelledError:
        await _publish(redis, job_id, JobStatus.CANCELLED, {"phase": "cancelled"})
        return
    except SoftTimeLimitExceeded:
        await _fail(job_id=job_id, code="job_timeout", message=f"{kind_label} took too long.")
        await _publish(
            redis,
            job_id,
            JobStatus.FAILED,
            {"phase": "failed", "error_code": "job_timeout", "error_message": "Took too long."},
        )
        return
    except (PdfEncryptedError, PdfMalformedError, OcrNotConfiguredError) as exc:
        await _fail(job_id=job_id, code=exc.code, message=exc.message)
        await _publish(
            redis,
            job_id,
            JobStatus.FAILED,
            {"phase": "failed", "error_code": exc.code, "error_message": exc.message},
        )
        return
    except _TransientStorageError:
        raise
    except AppError as exc:
        await _fail(job_id=job_id, code=exc.code, message=exc.message)
        await _publish(
            redis,
            job_id,
            JobStatus.FAILED,
            {"phase": "failed", "error_code": exc.code, "error_message": exc.message},
        )
        return
    except Exception as exc:
        await _fail(
            job_id=job_id,
            code="internal_error",
            message=f"An unexpected error occurred during {kind_label}.",
        )
        await _publish(
            redis,
            job_id,
            JobStatus.FAILED,
            {
                "phase": "failed",
                "error_code": "internal_error",
                "error_message": f"An unexpected error occurred during {kind_label}.",
            },
        )
        log.exception("jobs.tool.unhandled", exc_class=type(exc).__name__, kind=kind_label)
        return


def _build_split_options(params: dict[str, Any]) -> SplitOptions:
    raw = params.get("split_options") or {}
    if not isinstance(raw, dict):
        return SplitOptions()
    pdf_version_raw = raw.get("pdf_version")
    pdf_version = pdf_version_raw if isinstance(pdf_version_raw, str) else None
    compress_raw = raw.get("compress")
    compress_options = None
    if isinstance(compress_raw, dict) and compress_raw:
        compress_options = options_from_payload(
            level=CompressionLevel.CUSTOM,
            overrides=compress_raw,
        )
    return SplitOptions(
        combine_into_single=bool(raw.get("combine_into_single", False)),
        strip_metadata=bool(raw.get("strip_metadata", False)),
        linearize=bool(raw.get("linearize", False)),
        pdf_version=pdf_version,
        compress=compress_options,
    )


async def _split_process(
    input_path: Path, output_path: Path, params: dict[str, Any]
) -> dict[str, Any]:
    mode_raw = params.get("mode", "ranges")
    try:
        mode = SplitMode(str(mode_raw))
    except ValueError as exc:
        raise AppError("Unknown split mode.") from exc

    ranges_raw = params.get("ranges")
    ranges: list[dict[str, int]] | None = None
    if isinstance(ranges_raw, list):
        ranges = []
        for entry in ranges_raw:
            if isinstance(entry, dict) and "from" in entry and "to" in entry:
                try:
                    ranges.append({"from": int(entry["from"]), "to": int(entry["to"])})
                except (TypeError, ValueError) as exc:
                    raise AppError("Range values must be integers.") from exc

    every_n_raw = params.get("every_n")
    every_n: int | None = None
    if isinstance(every_n_raw, int) and not isinstance(every_n_raw, bool):
        every_n = every_n_raw

    options = _build_split_options(params)
    combine = options.combine_into_single and mode is SplitMode.RANGES
    target_ext = "pdf" if combine else "zip"
    target_content_type = "application/pdf" if combine else "application/zip"
    actual_output = output_path.parent / f"output.{target_ext}"

    result = await anyio.to_thread.run_sync(
        lambda: split_pdf(
            input_path=input_path,
            output_path=actual_output,
            mode=mode,
            ranges=ranges,
            every_n=every_n,
            options=options,
        )
    )
    return {
        "output_size_bytes": result.output_size_bytes,
        "input_size_bytes": result.input_size_bytes,
        "parts": result.parts,
        "page_count": result.page_count,
        "selected_page_count": result.selected_page_count,
        "combined": result.combined,
        "compressed": result.compressed,
        "_output_extension": target_ext,
        "_output_content_type": target_content_type,
        "_output_path": str(actual_output),
    }


async def _rotate_process(
    input_path: Path, output_path: Path, params: dict[str, Any]
) -> dict[str, Any]:
    rotations_raw = params.get("rotations")
    if not isinstance(rotations_raw, dict):
        raise AppError("Rotation map missing.")
    rotations = {int(k): int(v) for k, v in rotations_raw.items()}
    result = await anyio.to_thread.run_sync(
        lambda: rotate_pdf(input_path=input_path, output_path=output_path, rotations=rotations)
    )
    return {
        "output_size_bytes": result.output_size_bytes,
        "input_size_bytes": result.input_size_bytes,
        "page_count": result.page_count,
    }


async def _reorder_process(
    input_path: Path, output_path: Path, params: dict[str, Any]
) -> dict[str, Any]:
    order_raw = params.get("order")
    if not isinstance(order_raw, list):
        raise AppError("Page order missing.")
    order = [int(p) for p in order_raw]
    result = await anyio.to_thread.run_sync(
        lambda: reorder_pdf(input_path=input_path, output_path=output_path, order=order)
    )
    return {
        "output_size_bytes": result.output_size_bytes,
        "input_size_bytes": result.input_size_bytes,
        "page_count": result.page_count,
    }


async def _ocr_process(
    input_path: Path, output_path: Path, params: dict[str, Any]
) -> dict[str, Any]:
    language = str(params.get("language", "eng"))
    result = await anyio.to_thread.run_sync(
        lambda: ocr_pdf(input_path=input_path, output_path=output_path, language=language)
    )
    return {
        "output_size_bytes": result.output_size_bytes,
        "input_size_bytes": result.input_size_bytes,
    }


def _make_task(
    *,
    name: str,
    process: ProcessFn,
    label: str,
    extension: str = "pdf",
    content_type: str = "application/pdf",
) -> Any:
    @celery_app.task(
        name=name,
        bind=True,
        autoretry_for=(_TransientStorageError,),
        retry_backoff=True,
        retry_backoff_max=60,
        retry_jitter=True,
        max_retries=3,
        acks_late=True,
        reject_on_worker_lost=True,
    )
    def _task(self: Any, job_id: str) -> str:
        run_async(
            _run_simple_job(
                task_id=self.request.id or str(uuid4()),
                job_id=UUID(job_id),
                kind_label=label,
                process=process,
                output_extension=extension,
                output_content_type=content_type,
            )
        )
        return job_id

    return _task


split_task = _make_task(
    name="papyrus.pdf.split",
    process=_split_process,
    label="split",
    extension="zip",
    content_type="application/zip",
)

rotate_task = _make_task(
    name="papyrus.pdf.rotate",
    process=_rotate_process,
    label="rotate",
)

reorder_task = _make_task(
    name="papyrus.pdf.reorder",
    process=_reorder_process,
    label="reorder",
)

ocr_task = _make_task(
    name="papyrus.pdf.ocr",
    process=_ocr_process,
    label="ocr",
)

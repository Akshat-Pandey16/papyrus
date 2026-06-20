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

from papyrus_api.core.config import settings
from papyrus_api.core.errors import AppError, PdfEncryptedError, PdfMalformedError
from papyrus_api.core.time import utc_now
from papyrus_api.db.session import get_sessionmaker
from papyrus_api.domain.jobs.enums import JobStatus
from papyrus_api.integrations.clamav import scan_input
from papyrus_api.integrations.redis import get_redis
from papyrus_api.repositories.documents import StorageObjectRepository
from papyrus_api.repositories.jobs import JobEventRepository, JobRepository
from papyrus_api.services.pdf.edit import edit_pdf
from papyrus_api.services.pdf.images import PageSize, images_to_pdf
from papyrus_api.services.pdf.sign import sign_pdf
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

ComposeProcessFn = Callable[[list[dict[str, Any]], Path, dict[str, Any]], Awaitable[dict[str, Any]]]

_EXT_BY_CONTENT_TYPE = {
    "application/pdf": "pdf",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
}


def _max_pages(params: dict[str, Any]) -> int | None:
    value = params.get("max_pages")
    if isinstance(value, int) and not isinstance(value, bool) and value > 0:
        return value
    return None


def _input_extension(item: dict[str, Any]) -> str:
    content_type = item.get("content_type")
    if isinstance(content_type, str):
        return _EXT_BY_CONTENT_TYPE.get(content_type, "bin")
    return "bin"


async def _run_compose_job(
    *,
    task_id: str,
    job_id: UUID,
    kind_label: str,
    process: ComposeProcessFn,
    output_extension: str = "pdf",
    output_content_type: str = "application/pdf",
) -> None:
    redis = get_redis()
    lock_key = f"job:lock:{job_id}"
    acquired = await redis.set(lock_key, task_id, nx=True, ex=settings.job_lock_ttl_seconds)
    if not acquired:
        existing_owner = await redis.get(lock_key)
        if existing_owner != task_id:
            log.warning("jobs.compose.duplicate_run", kind=kind_label, job_id=str(job_id))
            return

    structlog.contextvars.bind_contextvars(job_id=str(job_id), task_id=task_id, kind=kind_label)
    sessionmaker = get_sessionmaker()
    storage = StorageService()

    inputs: list[dict[str, Any]] = []
    organization_id: UUID | None = None

    try:
        async with sessionmaker() as session:
            job = await JobRepository(session).get_for_worker(job_id=job_id)
            if job is None:
                log.warning("jobs.compose.missing", job_id=str(job_id))
                return
            if job.status in (JobStatus.SUCCEEDED, JobStatus.FAILED, JobStatus.CANCELLED):
                log.info("jobs.compose.already_terminal", status=job.status.value)
                return
            organization_id = job.organization_id
            structlog.contextvars.bind_contextvars(organization_id=str(organization_id))
            params: dict[str, Any] = dict(job.params or {})
            try:
                inputs_raw = params["inputs"]
                if not isinstance(inputs_raw, list) or not inputs_raw:
                    raise ValueError("inputs must be a non-empty list")
                for item in inputs_raw:
                    if not isinstance(item, dict):
                        raise ValueError("input entry must be an object")
                    if not isinstance(item.get("input_bucket"), str):
                        raise ValueError("input_bucket missing")
                    if not isinstance(item.get("input_key"), str):
                        raise ValueError("input_key missing")
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
                log.warning("jobs.compose.invalid_params", error=str(exc))
                return

            claimed = await JobRepository(session).mark_running(job_id=job.id)
            if claimed is None:
                await session.rollback()
                log.info("jobs.compose.claim_failed", job_id=str(job_id))
                await publish(redis, job_id, JobStatus.CANCELLED, {"phase": "cancelled"})
                return
            await JobEventRepository(session).append(
                job_id=job.id,
                status=JobStatus.RUNNING,
                payload={"phase": "downloading"},
            )
            await session.commit()
            await publish(redis, job.id, JobStatus.RUNNING, {"phase": "downloading"})

        with tempfile.TemporaryDirectory(prefix=f"papyrus-{kind_label}-") as tmp_root:
            tmp_dir = Path(tmp_root)
            downloaded: list[dict[str, Any]] = []
            for index, item in enumerate(inputs):
                dest = tmp_dir / f"input-{index:04d}.{_input_extension(item)}"
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
                await scan_input(dest)
                downloaded.append({**item, "path": dest})

            await check_cancelled(redis, job_id)
            output_path = tmp_dir / f"output.{output_extension}"

            async with sessionmaker() as session:
                await JobEventRepository(session).append(
                    job_id=job_id,
                    status=JobStatus.RUNNING,
                    payload={"phase": "processing"},
                )
                await session.commit()
            await publish(redis, job_id, JobStatus.RUNNING, {"phase": "processing"})

            stats = await process(downloaded, output_path, params)
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
            output_key = f"org/{organization_id}/outputs/{job_id}/{uuid4().hex}.{actual_extension}"
            output_sha256 = await anyio.to_thread.run_sync(sha256_of_file, actual_output)

            try:
                await storage.upload_from_path(
                    bucket=output_bucket,
                    key=output_key,
                    src=actual_output,
                    content_type=actual_content_type,
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
                    size_bytes=int(stats.get("output_size_bytes", 0)),
                    content_type=actual_content_type,
                    purpose="output",
                )
                await so_repo.mark_confirmed(
                    storage_object_id=output_obj.id,
                    sha256=output_sha256,
                    size_bytes=int(stats.get("output_size_bytes", 0)),
                    confirmed_at=utc_now(),
                )
                succeeded = await JobRepository(session).mark_succeeded(
                    job_id=job_id,
                    output_object_id=output_obj.id,
                    output_size_bytes=int(stats.get("output_size_bytes", 0)),
                )
                if succeeded is None:
                    await session.rollback()
                    log.info("jobs.compose.succeed_blocked", job_id=str(job_id))
                    return
                event_payload = {
                    "phase": "done",
                    "output_object_id": str(output_obj.id),
                    **stats,
                }
                await JobEventRepository(session).append(
                    job_id=job_id,
                    status=JobStatus.SUCCEEDED,
                    payload=event_payload,
                )
                await session.commit()
            await publish(redis, job_id, JobStatus.SUCCEEDED, event_payload)
            log.info("jobs.compose.succeeded", kind=kind_label, **stats)
            if settings.zero_retention_mode or params.get("zero_retention"):
                for item in inputs:
                    await purge_input(storage, item.get("input_bucket"), item.get("input_key"))
    except JobCancelledError:
        await publish(redis, job_id, JobStatus.CANCELLED, {"phase": "cancelled"})
        return
    except SoftTimeLimitExceeded:
        await fail_job(
            sessionmaker=sessionmaker,
            job_id=job_id,
            code="job_timeout",
            message=f"{kind_label} took too long.",
        )
        await publish(
            redis,
            job_id,
            JobStatus.FAILED,
            {"phase": "failed", "error_code": "job_timeout", "error_message": "Took too long."},
        )
        return
    except (PdfEncryptedError, PdfMalformedError) as exc:
        await fail_job(sessionmaker=sessionmaker, job_id=job_id, code=exc.code, message=exc.message)
        await publish(
            redis,
            job_id,
            JobStatus.FAILED,
            {"phase": "failed", "error_code": exc.code, "error_message": exc.message},
        )
        return
    except TransientStorageError:
        raise
    except AppError as exc:
        await fail_job(sessionmaker=sessionmaker, job_id=job_id, code=exc.code, message=exc.message)
        await publish(
            redis,
            job_id,
            JobStatus.FAILED,
            {"phase": "failed", "error_code": exc.code, "error_message": exc.message},
        )
        return
    except Exception as exc:
        await fail_job(
            sessionmaker=sessionmaker,
            job_id=job_id,
            code="internal_error",
            message=f"An unexpected error occurred during {kind_label}.",
        )
        await publish(
            redis,
            job_id,
            JobStatus.FAILED,
            {
                "phase": "failed",
                "error_code": "internal_error",
                "error_message": f"An unexpected error occurred during {kind_label}.",
            },
        )
        log.exception("jobs.compose.unhandled", exc_class=type(exc).__name__, kind=kind_label)
        return
    finally:
        structlog.contextvars.unbind_contextvars("job_id", "task_id", "kind", "organization_id")
        await release_lock(redis, job_id, task_id)


def _split_primary_and_images(
    downloaded: list[dict[str, Any]],
) -> tuple[Path | None, dict[str, Path]]:
    primary: Path | None = None
    images: dict[str, Path] = {}
    for item in downloaded:
        ref = item.get("ref")
        path = item["path"]
        if ref == "primary" or item.get("content_type") == "application/pdf":
            if primary is None:
                primary = path
        elif isinstance(ref, str):
            images[ref] = path
    return primary, images


async def _images_to_pdf_process(
    downloaded: list[dict[str, Any]], output_path: Path, params: dict[str, Any]
) -> dict[str, Any]:
    image_paths = [item["path"] for item in downloaded]
    page_size_raw = str(params.get("page_size") or "auto")
    try:
        page_size = PageSize(page_size_raw)
    except ValueError:
        page_size = PageSize.AUTO
    result = await anyio.to_thread.run_sync(
        lambda: images_to_pdf(
            image_paths=image_paths,
            output_path=output_path,
            work_dir=output_path.parent / "work",
            page_size=page_size,
        )
    )
    return {
        "output_size_bytes": result.output_size_bytes,
        "input_size_bytes": result.input_size_bytes,
        "page_count": result.page_count,
    }


async def _sign_process(
    downloaded: list[dict[str, Any]], output_path: Path, params: dict[str, Any]
) -> dict[str, Any]:
    primary, images = _split_primary_and_images(downloaded)
    if primary is None:
        raise AppError("The document to sign is missing.")
    placements = params.get("placements")
    placements_list = placements if isinstance(placements, list) else []
    result = await anyio.to_thread.run_sync(
        lambda: sign_pdf(
            input_path=primary,
            output_path=output_path,
            raw_placements=placements_list,
            images=images,
            max_ops=200,
            max_pages=_max_pages(params),
        )
    )
    return {
        "output_size_bytes": result.output_size_bytes,
        "input_size_bytes": result.input_size_bytes,
        "page_count": result.page_count,
        "ops_applied": result.ops_applied,
    }


async def _edit_process(
    downloaded: list[dict[str, Any]], output_path: Path, params: dict[str, Any]
) -> dict[str, Any]:
    primary, images = _split_primary_and_images(downloaded)
    if primary is None:
        raise AppError("The document to edit is missing.")
    ops = params.get("ops")
    ops_list = ops if isinstance(ops, list) else []
    result = await anyio.to_thread.run_sync(
        lambda: edit_pdf(
            input_path=primary,
            output_path=output_path,
            raw_ops=ops_list,
            images=images,
            max_ops=settings.overlay_max_ops,
            max_pages=_max_pages(params),
        )
    )
    return {
        "output_size_bytes": result.output_size_bytes,
        "input_size_bytes": result.input_size_bytes,
        "page_count": result.page_count,
        "ops_applied": result.ops_applied,
    }


def _make_compose_task(*, name: str, process: ComposeProcessFn, label: str) -> Any:
    @celery_app.task(
        name=name,
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
    def _task(self: Any, job_id: str) -> str:
        run_async(
            _run_compose_job(
                task_id=self.request.id or str(uuid4()),
                job_id=UUID(job_id),
                kind_label=label,
                process=process,
            )
        )
        return job_id

    return _task


images_to_pdf_task = _make_compose_task(
    name="papyrus.pdf.images_to_pdf",
    process=_images_to_pdf_process,
    label="images_to_pdf",
)

sign_task = _make_compose_task(
    name="papyrus.pdf.sign",
    process=_sign_process,
    label="sign",
)

edit_task = _make_compose_task(
    name="papyrus.pdf.edit",
    process=_edit_process,
    label="edit",
)

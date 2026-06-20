from __future__ import annotations

import contextlib
import json
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
from papyrus_api.services.pdf.compress import CompressionLevel, options_from_payload
from papyrus_api.services.pdf.crop import crop_pdf, normalize_box
from papyrus_api.services.pdf.ocr import OcrNotConfiguredError, ocr_pdf
from papyrus_api.services.pdf.page_numbers import PageNumberOptions, number_pages_pdf
from papyrus_api.services.pdf.pdf_to_images import ImageFormat, pdf_to_images
from papyrus_api.services.pdf.redact import redact_pdf, redactions_from_payload
from papyrus_api.services.pdf.reorder import reorder_pdf
from papyrus_api.services.pdf.rotate import rotate_pdf
from papyrus_api.services.pdf.security import protect_pdf, unlock_pdf
from papyrus_api.services.pdf.split import SplitMode, SplitOptions, split_pdf
from papyrus_api.services.pdf.watermark import WatermarkOptions, watermark_pdf
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


ProcessFn = Callable[[Path, Path, dict[str, Any]], Awaitable[dict[str, Any]]]


def _max_pages(params: dict[str, Any]) -> int | None:
    value = params.get("max_pages")
    if isinstance(value, int) and not isinstance(value, bool) and value > 0:
        return value
    return None


async def _read_job_secret(params: dict[str, Any]) -> dict[str, Any]:
    ref = params.get("secret_ref")
    if not isinstance(ref, str) or not ref:
        return {}
    redis = get_redis()
    raw = await redis.get(ref)
    with contextlib.suppress(Exception):
        await redis.delete(ref)
    if raw is None:
        return {}
    try:
        data = json.loads(raw)
    except (TypeError, ValueError):
        return {}
    return data if isinstance(data, dict) else {}


def _rgb_param(raw: object, default: tuple[float, float, float]) -> tuple[float, float, float]:
    if isinstance(raw, (list, tuple)) and len(raw) == 3:
        try:
            values = [max(0.0, min(1.0, float(c))) for c in raw]
            return (values[0], values[1], values[2])
        except (TypeError, ValueError):
            return default
    return default


def _float_param(raw: object, default: float) -> float:
    if isinstance(raw, bool):
        return default
    if isinstance(raw, (int, float)):
        return float(raw)
    return default


def _int_param(raw: object, default: int, *, lo: int, hi: int) -> int:
    if isinstance(raw, bool) or not isinstance(raw, (int, float)):
        return default
    return max(lo, min(hi, int(raw)))


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
    acquired = await redis.set(lock_key, task_id, nx=True, ex=settings.job_lock_ttl_seconds)
    if not acquired:
        existing_owner = await redis.get(lock_key)
        if existing_owner != task_id:
            log.warning("jobs.tool.duplicate_run", kind=kind_label, job_id=str(job_id))
            return

    structlog.contextvars.bind_contextvars(job_id=str(job_id), task_id=task_id, kind=kind_label)
    sessionmaker = get_sessionmaker()
    storage = StorageService()

    input_bucket: str | None = None
    input_key: str | None = None
    organization_id: UUID | None = None

    try:
        async with sessionmaker() as session:
            job = await JobRepository(session).get_for_worker(job_id=job_id)
            if job is None:
                log.warning("jobs.tool.missing", job_id=str(job_id))
                return
            if job.status in (JobStatus.SUCCEEDED, JobStatus.FAILED, JobStatus.CANCELLED):
                log.info("jobs.tool.already_terminal", status=job.status.value)
                return
            organization_id = job.organization_id
            structlog.contextvars.bind_contextvars(organization_id=str(organization_id))
            params: dict[str, Any] = dict(job.params or {})
            try:
                input_bucket = params["input_bucket"]
                input_key = params["input_key"]
            except KeyError as exc:
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
                log.warning("jobs.tool.invalid_params", error=str(exc))
                return

            claimed = await JobRepository(session).mark_running(job_id=job.id)
            if claimed is None:
                await session.rollback()
                log.info("jobs.tool.claim_failed", job_id=str(job_id))
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

        with tempfile.TemporaryDirectory(prefix=f"papyrus-{kind_label}-") as tmp_root:
            tmp_dir = Path(tmp_root)
            input_path = tmp_dir / "input.pdf"
            output_path = tmp_dir / f"output.{output_extension}"

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

            await scan_input(input_path)
            await check_cancelled(redis, job_id)

            async with sessionmaker() as session:
                await JobEventRepository(session).append(
                    job_id=job_id,
                    status=JobStatus.RUNNING,
                    payload={"phase": "processing"},
                )
                await session.commit()
            await publish(redis, job_id, JobStatus.RUNNING, {"phase": "processing"})

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
                    log.info("jobs.tool.succeed_blocked", job_id=str(job_id))
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
            log.info("jobs.tool.succeeded", kind=kind_label, **stats)
            if settings.zero_retention_mode or params.get("zero_retention"):
                await purge_input(storage, input_bucket, input_key)
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
            {
                "phase": "failed",
                "error_code": "job_timeout",
                "error_message": "Took too long.",
            },
        )
        return
    except (PdfEncryptedError, PdfMalformedError, OcrNotConfiguredError) as exc:
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
            {"phase": "failed", "error_code": exc.code, "error_message": exc.message},
        )
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
        log.exception("jobs.tool.unhandled", exc_class=type(exc).__name__, kind=kind_label)
        return
    finally:
        structlog.contextvars.unbind_contextvars("job_id", "task_id", "kind", "organization_id")
        await release_lock(redis, job_id, task_id)


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

    max_pages = _max_pages(params)
    result = await anyio.to_thread.run_sync(
        lambda: split_pdf(
            input_path=input_path,
            output_path=actual_output,
            mode=mode,
            ranges=ranges,
            every_n=every_n,
            options=options,
            max_pages=max_pages,
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
    max_pages = _max_pages(params)
    result = await anyio.to_thread.run_sync(
        lambda: rotate_pdf(
            input_path=input_path,
            output_path=output_path,
            rotations=rotations,
            max_pages=max_pages,
        )
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
    max_pages = _max_pages(params)
    result = await anyio.to_thread.run_sync(
        lambda: reorder_pdf(
            input_path=input_path,
            output_path=output_path,
            order=order,
            max_pages=max_pages,
        )
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
    max_pages = _max_pages(params)
    result = await anyio.to_thread.run_sync(
        lambda: ocr_pdf(
            input_path=input_path,
            output_path=output_path,
            language=language,
            max_pages=max_pages,
        )
    )
    return {
        "output_size_bytes": result.output_size_bytes,
        "input_size_bytes": result.input_size_bytes,
    }


async def _protect_process(
    input_path: Path, output_path: Path, params: dict[str, Any]
) -> dict[str, Any]:
    secret = await _read_job_secret(params)
    user_password = secret.get("user_password")
    if not isinstance(user_password, str) or not user_password:
        raise AppError("Password is missing for this job.")
    owner_raw = secret.get("owner_password")
    owner_password = owner_raw if isinstance(owner_raw, str) and owner_raw else None
    allow_printing = bool(params.get("allow_printing", True))
    allow_copying = bool(params.get("allow_copying", False))
    result = await anyio.to_thread.run_sync(
        lambda: protect_pdf(
            input_path=input_path,
            output_path=output_path,
            user_password=user_password,
            owner_password=owner_password,
            allow_printing=allow_printing,
            allow_copying=allow_copying,
        )
    )
    return {
        "output_size_bytes": result.output_size_bytes,
        "input_size_bytes": result.input_size_bytes,
        "page_count": result.page_count,
        "encrypted": result.encrypted,
    }


async def _unlock_process(
    input_path: Path, output_path: Path, params: dict[str, Any]
) -> dict[str, Any]:
    secret = await _read_job_secret(params)
    password = secret.get("password")
    if not isinstance(password, str):
        password = ""
    result = await anyio.to_thread.run_sync(
        lambda: unlock_pdf(
            input_path=input_path,
            output_path=output_path,
            password=password,
        )
    )
    return {
        "output_size_bytes": result.output_size_bytes,
        "input_size_bytes": result.input_size_bytes,
        "page_count": result.page_count,
        "encrypted": result.encrypted,
    }


async def _watermark_process(
    input_path: Path, output_path: Path, params: dict[str, Any]
) -> dict[str, Any]:
    text = params.get("text")
    if not isinstance(text, str) or not text.strip():
        raise AppError("Watermark text is missing.")
    options = WatermarkOptions(
        text=text,
        color=_rgb_param(params.get("color"), (0.6, 0.6, 0.6)),
        opacity=max(0.05, min(1.0, _float_param(params.get("opacity"), 0.25))),
        size=max(6.0, min(200.0, _float_param(params.get("size"), 48.0))),
        rotation=_float_param(params.get("rotation"), 45.0),
        tile=bool(params.get("tile", True)),
        font=str(params.get("font") or "Helvetica-Bold"),
    )
    result = await anyio.to_thread.run_sync(
        lambda: watermark_pdf(
            input_path=input_path,
            output_path=output_path,
            options=options,
            max_pages=_max_pages(params),
        )
    )
    return {
        "output_size_bytes": result.output_size_bytes,
        "input_size_bytes": result.input_size_bytes,
        "page_count": result.page_count,
        "ops_applied": result.ops_applied,
    }


async def _page_numbers_process(
    input_path: Path, output_path: Path, params: dict[str, Any]
) -> dict[str, Any]:
    options = PageNumberOptions(
        fmt=str(params.get("format") or "{n}"),
        position=str(params.get("position") or "bottom-center"),
        start_at=_int_param(params.get("start_at"), 1, lo=0, hi=1_000_000),
        size=max(6.0, min(72.0, _float_param(params.get("size"), 11.0))),
        color=_rgb_param(params.get("color"), (0.1, 0.1, 0.1)),
        font=str(params.get("font") or "Helvetica"),
    )
    result = await anyio.to_thread.run_sync(
        lambda: number_pages_pdf(
            input_path=input_path,
            output_path=output_path,
            options=options,
            max_pages=_max_pages(params),
        )
    )
    return {
        "output_size_bytes": result.output_size_bytes,
        "input_size_bytes": result.input_size_bytes,
        "page_count": result.page_count,
        "ops_applied": result.ops_applied,
    }


async def _crop_process(
    input_path: Path, output_path: Path, params: dict[str, Any]
) -> dict[str, Any]:
    box = normalize_box(params.get("box"))
    pages_raw = params.get("pages")
    pages = (
        [int(p) for p in pages_raw if isinstance(p, (int, float)) and not isinstance(p, bool)]
        if isinstance(pages_raw, list)
        else None
    )
    result = await anyio.to_thread.run_sync(
        lambda: crop_pdf(
            input_path=input_path,
            output_path=output_path,
            box=box,
            pages=pages,
            max_pages=_max_pages(params),
        )
    )
    return {
        "output_size_bytes": result.output_size_bytes,
        "input_size_bytes": result.input_size_bytes,
        "page_count": result.page_count,
        "pages_cropped": result.pages_cropped,
    }


async def _pdf_to_images_process(
    input_path: Path, output_path: Path, params: dict[str, Any]
) -> dict[str, Any]:
    fmt_raw = str(params.get("image_format") or "jpeg")
    try:
        image_format = ImageFormat(fmt_raw)
    except ValueError:
        image_format = ImageFormat.JPEG
    dpi = _int_param(
        params.get("dpi"), settings.raster_dpi_default, lo=36, hi=settings.raster_dpi_max
    )
    quality = _int_param(params.get("quality"), 85, lo=30, hi=100)
    actual_output = output_path.parent / "output.zip"
    cap = _max_pages(params)
    hard_cap = settings.pdf_to_images_max_pages
    page_cap = min(cap, hard_cap) if cap else hard_cap
    result = await anyio.to_thread.run_sync(
        lambda: pdf_to_images(
            input_path=input_path,
            output_path=actual_output,
            image_format=image_format,
            dpi=dpi,
            quality=quality,
            max_pages=page_cap,
            max_megapixels=settings.raster_max_megapixels,
        )
    )
    return {
        "output_size_bytes": result.output_size_bytes,
        "input_size_bytes": result.input_size_bytes,
        "page_count": result.page_count,
        "images": result.images,
        "image_format": result.image_format,
        "_output_extension": "zip",
        "_output_content_type": "application/zip",
        "_output_path": str(actual_output),
    }


async def _redact_process(
    input_path: Path, output_path: Path, params: dict[str, Any]
) -> dict[str, Any]:
    redactions = redactions_from_payload(params.get("redactions"))
    dpi = _int_param(params.get("dpi"), settings.redact_dpi, lo=72, hi=settings.raster_dpi_max)
    result = await anyio.to_thread.run_sync(
        lambda: redact_pdf(
            input_path=input_path,
            output_path=output_path,
            redactions=redactions,
            dpi=dpi,
            max_megapixels=settings.raster_max_megapixels,
            max_pages=_max_pages(params),
        )
    )
    return {
        "output_size_bytes": result.output_size_bytes,
        "input_size_bytes": result.input_size_bytes,
        "page_count": result.page_count,
        "pages_redacted": result.pages_redacted,
        "boxes_applied": result.boxes_applied,
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

protect_task = _make_task(
    name="papyrus.pdf.protect",
    process=_protect_process,
    label="protect",
)

unlock_task = _make_task(
    name="papyrus.pdf.unlock",
    process=_unlock_process,
    label="unlock",
)

watermark_task = _make_task(
    name="papyrus.pdf.watermark",
    process=_watermark_process,
    label="watermark",
)

page_numbers_task = _make_task(
    name="papyrus.pdf.page_numbers",
    process=_page_numbers_process,
    label="page_numbers",
)

crop_task = _make_task(
    name="papyrus.pdf.crop",
    process=_crop_process,
    label="crop",
)

pdf_to_images_task = _make_task(
    name="papyrus.pdf.pdf_to_images",
    process=_pdf_to_images_process,
    label="pdf_to_images",
    extension="zip",
    content_type="application/zip",
)

redact_task = _make_task(
    name="papyrus.pdf.redact",
    process=_redact_process,
    label="redact",
)

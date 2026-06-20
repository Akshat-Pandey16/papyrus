from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any
from uuid import UUID, uuid4

import structlog
from redis.asyncio import Redis
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from papyrus_api.core.config import settings
from papyrus_api.core.errors import (
    DocumentNotFoundError,
    JobNotFoundError,
    JobNotTerminalError,
    JobOutputExpiredError,
    QuotaExceededError,
    ServiceUnavailableError,
    ValidationError,
)
from papyrus_api.core.filenames import compose_output_filename, safe_filename_stem
from papyrus_api.core.pagination import decode_cursor, encode_cursor
from papyrus_api.core.time import utc_now
from papyrus_api.domain.jobs.enums import JobKind, JobStatus
from papyrus_api.domain.jobs.models import Job
from papyrus_api.integrations.redis import release_daily_quota, reserve_daily_quota
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


_SENSITIVE_PARAM_KEYS: frozenset[str] = frozenset(
    {"secret_ref", "user_password", "owner_password", "password"}
)

_SIMPLE_RETRY_TASKS: dict[JobKind, str] = {
    JobKind.WATERMARK: "papyrus.pdf.watermark",
    JobKind.PAGE_NUMBERS: "papyrus.pdf.page_numbers",
    JobKind.CROP: "papyrus.pdf.crop",
    JobKind.PDF_TO_IMAGES: "papyrus.pdf.pdf_to_images",
    JobKind.REDACT: "papyrus.pdf.redact",
}

_SIMPLE_RETRY_KEYS: dict[JobKind, frozenset[str]] = {
    JobKind.WATERMARK: frozenset({"text", "color", "opacity", "size", "rotation", "tile", "font"}),
    JobKind.PAGE_NUMBERS: frozenset({"format", "position", "start_at", "size", "color", "font"}),
    JobKind.CROP: frozenset({"box", "pages"}),
    JobKind.PDF_TO_IMAGES: frozenset({"image_format", "dpi", "quality"}),
    JobKind.REDACT: frozenset({"redactions", "dpi"}),
}


def _channel(job_id: UUID) -> str:
    return f"job-events:{job_id}"


def _redact_params(params: dict[str, Any] | None) -> dict[str, Any]:
    if not params:
        return {}
    return {k: v for k, v in params.items() if k not in _SENSITIVE_PARAM_KEYS}


def _page_cap(is_anonymous: bool) -> int:
    return settings.anon_max_pages if is_anonymous else settings.user_max_pages


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
        kind=job.kind.value,
        status=job.status.value,
        phase=phase,
        progress=None,
        params=_redact_params(job.params),
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
        options: dict[str, Any] | None = None,
        is_anonymous: bool = False,
        zero_retention: bool = False,
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

        max_bytes = settings.anon_max_file_bytes if is_anonymous else settings.user_max_file_bytes
        if storage_object.size_bytes > max_bytes:
            raise QuotaExceededError(
                "File exceeds the maximum allowed size.",
                details={"max_bytes": max_bytes, "anonymous": is_anonymous},
            )

        await self._reserve_quota(organization_id, is_anonymous=is_anonymous)

        params: dict[str, Any] = {
            "document_id": str(document.id),
            "compression_level": compression_level,
            "compression_options": options or {},
            "input_storage_object_id": str(storage_object.id),
            "input_bucket": storage_object.bucket,
            "input_key": storage_object.key,
            "input_size_bytes": storage_object.size_bytes,
            "input_filename": document.name,
            "created_by_user_id": str(user_id),
            "version_id": str(version.id),
            "zero_retention": zero_retention,
            "is_anonymous": is_anonymous,
            "max_pages": _page_cap(is_anonymous),
        }

        return await self._persist_and_enqueue(
            organization_id=organization_id,
            kind=JobKind.COMPRESS,
            params=params,
            idempotency_key=idempotency_key,
            input_size_bytes=storage_object.size_bytes,
            task_name="papyrus.pdf.compress",
        )

    async def _persist_and_enqueue(
        self,
        *,
        organization_id: UUID,
        kind: JobKind,
        params: dict[str, Any],
        idempotency_key: UUID,
        input_size_bytes: int | None,
        task_name: str,
    ) -> CreateJobResult:
        try:
            job = await self.jobs.create(
                organization_id=organization_id,
                kind=kind,
                params=params,
                idempotency_key=idempotency_key,
                input_size_bytes=input_size_bytes,
            )
            await self.events.append(
                job_id=job.id,
                status=JobStatus.PENDING,
                payload={"phase": "queued"},
            )
            await self.session.commit()
        except IntegrityError:
            await self.session.rollback()
            await release_daily_quota(
                self.redis, namespace="jobs", principal_id=str(organization_id)
            )
            existing = await self.jobs.get_by_idempotency_key(
                organization_id=organization_id,
                idempotency_key=idempotency_key,
            )
            if existing is not None:
                return CreateJobResult(job=existing, replay=True)
            raise

        await self._publish(
            job_id=job.id,
            status=JobStatus.PENDING,
            payload={"phase": "queued"},
        )
        await self._enqueue(
            task_name,
            job.id,
            organization_id=organization_id,
        )
        log.info("jobs.created", job_id=str(job.id), kind=kind.value, replay=False)
        return CreateJobResult(job=job, replay=False)

    async def _enqueue(
        self,
        task_name: str,
        job_id: UUID,
        *,
        organization_id: UUID,
    ) -> None:
        try:
            from papyrus_api.workers.celery_app import celery_app

            celery_app.send_task(
                task_name,
                args=[str(job_id)],
                task_id=str(job_id),
            )
        except Exception as exc:
            await self._abort_enqueue(job_id, organization_id=organization_id)
            raise ServiceUnavailableError(
                "Could not queue the job. Please try again in a moment.",
                details={"retryable": True},
            ) from exc

    async def _abort_enqueue(self, job_id: UUID, *, organization_id: UUID) -> None:
        failed = await self.jobs.mark_failed(
            job_id=job_id,
            error_code="enqueue_failed",
            error_message="Could not queue the job.",
        )
        if failed is not None:
            await self.events.append(
                job_id=job_id,
                status=JobStatus.FAILED,
                payload={
                    "phase": "failed",
                    "error_code": "enqueue_failed",
                    "error_message": "Could not queue the job.",
                },
            )
        await self.session.commit()
        await release_daily_quota(self.redis, namespace="jobs", principal_id=str(organization_id))
        if failed is not None:
            await self._publish(
                job_id=job_id,
                status=JobStatus.FAILED,
                payload={
                    "phase": "failed",
                    "error_code": "enqueue_failed",
                    "error_message": "Could not queue the job.",
                },
            )
        log.warning("jobs.enqueue_failed", job_id=str(job_id))

    async def create_merge_job(
        self,
        *,
        organization_id: UUID,
        user_id: UUID,
        input_specs: list[dict[str, Any]],
        options: dict[str, Any] | None = None,
        idempotency_key: UUID,
        is_anonymous: bool = False,
        zero_retention: bool = False,
    ) -> CreateJobResult:
        existing = await self.jobs.get_by_idempotency_key(
            organization_id=organization_id,
            idempotency_key=idempotency_key,
        )
        if existing is not None:
            return CreateJobResult(job=existing, replay=True)

        if len(input_specs) < 2:
            raise ValidationError("At least two PDFs are required to merge.")
        if len(input_specs) > 50:
            raise ValidationError("At most 50 PDFs can be merged in one job.")

        document_ids: list[UUID] = []
        for index, spec in enumerate(input_specs):
            raw_id = spec.get("document_id")
            if not isinstance(raw_id, str):
                raise ValidationError(
                    "Each input must include a document_id.",
                    details={"input_index": index},
                )
            try:
                document_ids.append(UUID(raw_id))
            except ValueError as exc:
                raise ValidationError(
                    "Invalid document_id.",
                    details={"input_index": index, "value": raw_id},
                ) from exc

        if len(set(document_ids)) != len(document_ids):
            raise ValidationError("inputs must not contain duplicate document_ids.")

        triples_by_id = await self.versions.get_many_with_storage(
            organization_id=organization_id,
            document_ids=document_ids,
        )

        inputs: list[dict[str, Any]] = []
        input_filenames: list[str] = []
        total_input_bytes = 0
        max_bytes = settings.anon_max_file_bytes if is_anonymous else settings.user_max_file_bytes
        for index, (spec, document_id) in enumerate(zip(input_specs, document_ids, strict=True)):
            triple = triples_by_id.get(document_id)
            if triple is None:
                raise DocumentNotFoundError(
                    "One of the documents was not found.",
                    details={"document_id": str(document_id), "input_index": index},
                )
            document, version, storage_object = triple
            if storage_object.size_bytes > max_bytes:
                raise QuotaExceededError(
                    "One of the files exceeds the maximum allowed size.",
                    details={
                        "max_bytes": max_bytes,
                        "document_id": str(document_id),
                        "anonymous": is_anonymous,
                    },
                )
            total_input_bytes += storage_object.size_bytes
            input_filenames.append(document.name)
            page_ranges_raw = spec.get("page_ranges")
            page_ranges = (
                page_ranges_raw.strip()
                if isinstance(page_ranges_raw, str) and page_ranges_raw.strip()
                else None
            )
            inputs.append(
                {
                    "document_id": str(document.id),
                    "version_id": str(version.id),
                    "input_storage_object_id": str(storage_object.id),
                    "input_bucket": storage_object.bucket,
                    "input_key": storage_object.key,
                    "input_size_bytes": storage_object.size_bytes,
                    "input_filename": document.name,
                    "page_ranges": page_ranges,
                }
            )

        await self._reserve_quota(organization_id, is_anonymous=is_anonymous)

        params: dict[str, Any] = {
            "inputs": inputs,
            "input_filenames": input_filenames,
            "input_size_bytes": total_input_bytes,
            "merge_options": options or {},
            "created_by_user_id": str(user_id),
            "zero_retention": zero_retention,
            "is_anonymous": is_anonymous,
            "max_pages": _page_cap(is_anonymous),
        }

        return await self._persist_and_enqueue(
            organization_id=organization_id,
            kind=JobKind.MERGE,
            params=params,
            idempotency_key=idempotency_key,
            input_size_bytes=total_input_bytes,
            task_name="papyrus.pdf.merge",
        )

    async def create_split_job(
        self,
        *,
        organization_id: UUID,
        user_id: UUID,
        document_id: UUID,
        mode: str = "ranges",
        ranges: list[dict[str, int]] | None = None,
        every_n: int | None = None,
        options: dict[str, Any] | None = None,
        idempotency_key: UUID,
        is_anonymous: bool = False,
        zero_retention: bool = False,
    ) -> CreateJobResult:
        extra: dict[str, Any] = {
            "mode": mode,
            "split_options": options or {},
        }
        if ranges is not None:
            extra["ranges"] = ranges
        if every_n is not None:
            extra["every_n"] = every_n
        return await self._create_simple_job(
            organization_id=organization_id,
            user_id=user_id,
            document_id=document_id,
            idempotency_key=idempotency_key,
            is_anonymous=is_anonymous,
            zero_retention=zero_retention,
            kind=JobKind.SPLIT,
            extra_params=extra,
            task_name="papyrus.pdf.split",
        )

    async def create_rotate_job(
        self,
        *,
        organization_id: UUID,
        user_id: UUID,
        document_id: UUID,
        rotations: dict[str, int],
        idempotency_key: UUID,
        is_anonymous: bool = False,
        zero_retention: bool = False,
    ) -> CreateJobResult:
        return await self._create_simple_job(
            organization_id=organization_id,
            user_id=user_id,
            document_id=document_id,
            idempotency_key=idempotency_key,
            is_anonymous=is_anonymous,
            zero_retention=zero_retention,
            kind=JobKind.ROTATE,
            extra_params={"rotations": rotations},
            task_name="papyrus.pdf.rotate",
        )

    async def create_reorder_job(
        self,
        *,
        organization_id: UUID,
        user_id: UUID,
        document_id: UUID,
        order: list[int],
        idempotency_key: UUID,
        is_anonymous: bool = False,
        zero_retention: bool = False,
    ) -> CreateJobResult:
        return await self._create_simple_job(
            organization_id=organization_id,
            user_id=user_id,
            document_id=document_id,
            idempotency_key=idempotency_key,
            is_anonymous=is_anonymous,
            zero_retention=zero_retention,
            kind=JobKind.REORDER,
            extra_params={"order": order},
            task_name="papyrus.pdf.reorder",
        )

    async def create_ocr_job(
        self,
        *,
        organization_id: UUID,
        user_id: UUID,
        document_id: UUID,
        language: str,
        idempotency_key: UUID,
        is_anonymous: bool = False,
        zero_retention: bool = False,
    ) -> CreateJobResult:
        return await self._create_simple_job(
            organization_id=organization_id,
            user_id=user_id,
            document_id=document_id,
            idempotency_key=idempotency_key,
            is_anonymous=is_anonymous,
            zero_retention=zero_retention,
            kind=JobKind.OCR,
            extra_params={"language": language},
            task_name="papyrus.pdf.ocr",
        )

    async def _store_secret(self, payload: dict[str, Any]) -> str:
        key = f"job:secret:{uuid4().hex}"
        await self.redis.set(
            key,
            json.dumps(payload),
            ex=settings.job_secret_ttl_seconds,
        )
        return key

    async def create_protect_job(
        self,
        *,
        organization_id: UUID,
        user_id: UUID,
        document_id: UUID,
        secret: dict[str, Any],
        options: dict[str, Any],
        idempotency_key: UUID,
        is_anonymous: bool = False,
        zero_retention: bool = False,
    ) -> CreateJobResult:
        secret_ref = await self._store_secret(secret)
        return await self._create_simple_job(
            organization_id=organization_id,
            user_id=user_id,
            document_id=document_id,
            idempotency_key=idempotency_key,
            is_anonymous=is_anonymous,
            zero_retention=zero_retention,
            kind=JobKind.PROTECT,
            extra_params={**options, "secret_ref": secret_ref},
            task_name="papyrus.pdf.protect",
        )

    async def create_unlock_job(
        self,
        *,
        organization_id: UUID,
        user_id: UUID,
        document_id: UUID,
        secret: dict[str, Any],
        idempotency_key: UUID,
        is_anonymous: bool = False,
        zero_retention: bool = False,
    ) -> CreateJobResult:
        secret_ref = await self._store_secret(secret)
        return await self._create_simple_job(
            organization_id=organization_id,
            user_id=user_id,
            document_id=document_id,
            idempotency_key=idempotency_key,
            is_anonymous=is_anonymous,
            zero_retention=zero_retention,
            kind=JobKind.UNLOCK,
            extra_params={"secret_ref": secret_ref},
            task_name="papyrus.pdf.unlock",
        )

    async def create_watermark_job(
        self,
        *,
        organization_id: UUID,
        user_id: UUID,
        document_id: UUID,
        options: dict[str, Any],
        idempotency_key: UUID,
        is_anonymous: bool = False,
        zero_retention: bool = False,
    ) -> CreateJobResult:
        return await self._create_simple_job(
            organization_id=organization_id,
            user_id=user_id,
            document_id=document_id,
            idempotency_key=idempotency_key,
            is_anonymous=is_anonymous,
            zero_retention=zero_retention,
            kind=JobKind.WATERMARK,
            extra_params=options,
            task_name="papyrus.pdf.watermark",
        )

    async def create_page_numbers_job(
        self,
        *,
        organization_id: UUID,
        user_id: UUID,
        document_id: UUID,
        options: dict[str, Any],
        idempotency_key: UUID,
        is_anonymous: bool = False,
        zero_retention: bool = False,
    ) -> CreateJobResult:
        return await self._create_simple_job(
            organization_id=organization_id,
            user_id=user_id,
            document_id=document_id,
            idempotency_key=idempotency_key,
            is_anonymous=is_anonymous,
            zero_retention=zero_retention,
            kind=JobKind.PAGE_NUMBERS,
            extra_params=options,
            task_name="papyrus.pdf.page_numbers",
        )

    async def create_crop_job(
        self,
        *,
        organization_id: UUID,
        user_id: UUID,
        document_id: UUID,
        options: dict[str, Any],
        idempotency_key: UUID,
        is_anonymous: bool = False,
        zero_retention: bool = False,
    ) -> CreateJobResult:
        return await self._create_simple_job(
            organization_id=organization_id,
            user_id=user_id,
            document_id=document_id,
            idempotency_key=idempotency_key,
            is_anonymous=is_anonymous,
            zero_retention=zero_retention,
            kind=JobKind.CROP,
            extra_params=options,
            task_name="papyrus.pdf.crop",
        )

    async def create_pdf_to_images_job(
        self,
        *,
        organization_id: UUID,
        user_id: UUID,
        document_id: UUID,
        options: dict[str, Any],
        idempotency_key: UUID,
        is_anonymous: bool = False,
        zero_retention: bool = False,
    ) -> CreateJobResult:
        return await self._create_simple_job(
            organization_id=organization_id,
            user_id=user_id,
            document_id=document_id,
            idempotency_key=idempotency_key,
            is_anonymous=is_anonymous,
            zero_retention=zero_retention,
            kind=JobKind.PDF_TO_IMAGES,
            extra_params=options,
            task_name="papyrus.pdf.pdf_to_images",
        )

    async def create_redact_job(
        self,
        *,
        organization_id: UUID,
        user_id: UUID,
        document_id: UUID,
        options: dict[str, Any],
        idempotency_key: UUID,
        is_anonymous: bool = False,
        zero_retention: bool = False,
    ) -> CreateJobResult:
        return await self._create_simple_job(
            organization_id=organization_id,
            user_id=user_id,
            document_id=document_id,
            idempotency_key=idempotency_key,
            is_anonymous=is_anonymous,
            zero_retention=zero_retention,
            kind=JobKind.REDACT,
            extra_params=options,
            task_name="papyrus.pdf.redact",
        )

    async def _create_compose_job(
        self,
        *,
        organization_id: UUID,
        user_id: UUID,
        idempotency_key: UUID,
        is_anonymous: bool,
        zero_retention: bool,
        kind: JobKind,
        task_name: str,
        input_specs: list[tuple[str, UUID]],
        extra_params: dict[str, Any],
        primary_ref: str,
    ) -> CreateJobResult:
        existing = await self.jobs.get_by_idempotency_key(
            organization_id=organization_id,
            idempotency_key=idempotency_key,
        )
        if existing is not None:
            return CreateJobResult(job=existing, replay=True)

        if not input_specs:
            raise ValidationError("At least one input is required.")

        unique_ids = list({doc_id for _, doc_id in input_specs})
        triples_by_id = await self.versions.get_many_with_storage(
            organization_id=organization_id,
            document_ids=unique_ids,
        )

        max_bytes = settings.anon_max_file_bytes if is_anonymous else settings.user_max_file_bytes
        inputs: list[dict[str, Any]] = []
        total_bytes = 0
        primary_name: str | None = None
        for ref, document_id in input_specs:
            triple = triples_by_id.get(document_id)
            if triple is None:
                raise DocumentNotFoundError(
                    "One of the documents was not found.",
                    details={"document_id": str(document_id)},
                )
            document, version, storage_object = triple
            if storage_object.size_bytes > max_bytes:
                raise QuotaExceededError(
                    "One of the files exceeds the maximum allowed size.",
                    details={"max_bytes": max_bytes, "anonymous": is_anonymous},
                )
            total_bytes += storage_object.size_bytes
            inputs.append(
                {
                    "ref": ref,
                    "content_type": storage_object.content_type,
                    "document_id": str(document.id),
                    "version_id": str(version.id),
                    "input_storage_object_id": str(storage_object.id),
                    "input_bucket": storage_object.bucket,
                    "input_key": storage_object.key,
                    "input_size_bytes": storage_object.size_bytes,
                    "input_filename": document.name,
                }
            )
            if ref == primary_ref:
                primary_name = document.name
        if primary_name is None and inputs:
            primary_name = str(inputs[0]["input_filename"])

        await self._reserve_quota(organization_id, is_anonymous=is_anonymous)

        params: dict[str, Any] = {
            "inputs": inputs,
            "input_filename": primary_name,
            "input_size_bytes": total_bytes,
            "created_by_user_id": str(user_id),
            "zero_retention": zero_retention,
            "is_anonymous": is_anonymous,
            "max_pages": _page_cap(is_anonymous),
            **extra_params,
        }

        return await self._persist_and_enqueue(
            organization_id=organization_id,
            kind=kind,
            params=params,
            idempotency_key=idempotency_key,
            input_size_bytes=total_bytes,
            task_name=task_name,
        )

    async def create_images_to_pdf_job(
        self,
        *,
        organization_id: UUID,
        user_id: UUID,
        document_ids: list[UUID],
        options: dict[str, Any],
        idempotency_key: UUID,
        is_anonymous: bool = False,
        zero_retention: bool = False,
    ) -> CreateJobResult:
        if not document_ids:
            raise ValidationError("At least one image is required.")
        if len(document_ids) > settings.images_to_pdf_max_count:
            raise ValidationError(
                "Too many images in one job.",
                details={"max_count": settings.images_to_pdf_max_count},
            )
        input_specs = [(f"img{index}", doc_id) for index, doc_id in enumerate(document_ids)]
        return await self._create_compose_job(
            organization_id=organization_id,
            user_id=user_id,
            idempotency_key=idempotency_key,
            is_anonymous=is_anonymous,
            zero_retention=zero_retention,
            kind=JobKind.IMAGES_TO_PDF,
            task_name="papyrus.pdf.images_to_pdf",
            input_specs=input_specs,
            extra_params=options,
            primary_ref="img0",
        )

    async def create_sign_job(
        self,
        *,
        organization_id: UUID,
        user_id: UUID,
        document_id: UUID,
        image_refs: list[tuple[str, UUID]],
        placements: list[dict[str, Any]],
        idempotency_key: UUID,
        is_anonymous: bool = False,
        zero_retention: bool = False,
    ) -> CreateJobResult:
        input_specs: list[tuple[str, UUID]] = [("primary", document_id), *image_refs]
        return await self._create_compose_job(
            organization_id=organization_id,
            user_id=user_id,
            idempotency_key=idempotency_key,
            is_anonymous=is_anonymous,
            zero_retention=zero_retention,
            kind=JobKind.SIGN,
            task_name="papyrus.pdf.sign",
            input_specs=input_specs,
            extra_params={"placements": placements},
            primary_ref="primary",
        )

    async def create_edit_job(
        self,
        *,
        organization_id: UUID,
        user_id: UUID,
        document_id: UUID,
        image_refs: list[tuple[str, UUID]],
        ops: list[dict[str, Any]],
        idempotency_key: UUID,
        is_anonymous: bool = False,
        zero_retention: bool = False,
    ) -> CreateJobResult:
        input_specs: list[tuple[str, UUID]] = [("primary", document_id), *image_refs]
        return await self._create_compose_job(
            organization_id=organization_id,
            user_id=user_id,
            idempotency_key=idempotency_key,
            is_anonymous=is_anonymous,
            zero_retention=zero_retention,
            kind=JobKind.EDIT,
            task_name="papyrus.pdf.edit",
            input_specs=input_specs,
            extra_params={"ops": ops},
            primary_ref="primary",
        )

    async def _create_simple_job(
        self,
        *,
        organization_id: UUID,
        user_id: UUID,
        document_id: UUID,
        idempotency_key: UUID,
        is_anonymous: bool,
        kind: JobKind,
        extra_params: dict[str, Any],
        task_name: str,
        zero_retention: bool = False,
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

        max_bytes = settings.anon_max_file_bytes if is_anonymous else settings.user_max_file_bytes
        if storage_object.size_bytes > max_bytes:
            raise QuotaExceededError(
                "File exceeds the maximum allowed size.",
                details={"max_bytes": max_bytes, "anonymous": is_anonymous},
            )

        await self._reserve_quota(organization_id, is_anonymous=is_anonymous)

        params: dict[str, Any] = {
            "document_id": str(document.id),
            "input_storage_object_id": str(storage_object.id),
            "input_bucket": storage_object.bucket,
            "input_key": storage_object.key,
            "input_size_bytes": storage_object.size_bytes,
            "input_filename": document.name,
            "created_by_user_id": str(user_id),
            "version_id": str(version.id),
            "zero_retention": zero_retention,
            "is_anonymous": is_anonymous,
            "max_pages": _page_cap(is_anonymous),
            **extra_params,
        }

        return await self._persist_and_enqueue(
            organization_id=organization_id,
            kind=kind,
            params=params,
            idempotency_key=idempotency_key,
            input_size_bytes=storage_object.size_bytes,
            task_name=task_name,
        )

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
                raise ValidationError("Invalid cursor.") from exc

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

    async def retry(
        self,
        *,
        organization_id: UUID,
        user_id: UUID,
        job_id: UUID,
        idempotency_key: UUID,
    ) -> CreateJobResult:
        job = await self.jobs.get_for_org(
            organization_id=organization_id,
            job_id=job_id,
        )
        if job is None:
            raise JobNotFoundError("Job not found.")
        if job.status not in (JobStatus.FAILED, JobStatus.CANCELLED):
            raise ValidationError(
                "Only failed or cancelled jobs can be retried.",
                details={"status": job.status.value},
            )

        zero_retention = bool(job.params.get("zero_retention")) if job.params else False

        if job.kind == JobKind.COMPRESS:
            document_id_raw = job.params.get("document_id") if job.params else None
            level = job.params.get("compression_level") if job.params else None
            options_raw = job.params.get("compression_options") if job.params else None
            options = options_raw if isinstance(options_raw, dict) else None
            if not isinstance(document_id_raw, str) or not isinstance(level, str):
                raise ValidationError("Job is missing the data needed to retry.")
            return await self.create_compression_job(
                organization_id=organization_id,
                user_id=user_id,
                document_id=UUID(document_id_raw),
                compression_level=level,
                options=options,
                idempotency_key=idempotency_key,
                zero_retention=zero_retention,
            )

        if job.kind == JobKind.MERGE:
            inputs_raw = job.params.get("inputs") if job.params else None
            if not isinstance(inputs_raw, list) or not inputs_raw:
                raise ValidationError("Job is missing the data needed to retry.")
            input_specs: list[dict[str, Any]] = []
            for item in inputs_raw:
                if not isinstance(item, dict):
                    raise ValidationError("Job inputs are malformed.")
                doc_id = item.get("document_id")
                if not isinstance(doc_id, str):
                    raise ValidationError("Job inputs are missing a document_id.")
                spec: dict[str, Any] = {"document_id": doc_id}
                pr = item.get("page_ranges")
                if isinstance(pr, str):
                    spec["page_ranges"] = pr
                input_specs.append(spec)
            options_raw = job.params.get("merge_options") if job.params else None
            options = options_raw if isinstance(options_raw, dict) else None
            return await self.create_merge_job(
                organization_id=organization_id,
                user_id=user_id,
                input_specs=input_specs,
                options=options,
                idempotency_key=idempotency_key,
                zero_retention=zero_retention,
            )

        if job.kind in (JobKind.SPLIT, JobKind.ROTATE, JobKind.REORDER, JobKind.OCR):
            document_id_raw = job.params.get("document_id") if job.params else None
            if not isinstance(document_id_raw, str):
                raise ValidationError("Job is missing the data needed to retry.")
            document_id = UUID(document_id_raw)
            if job.kind == JobKind.SPLIT:
                mode_raw = job.params.get("mode", "ranges")
                mode = mode_raw if isinstance(mode_raw, str) else "ranges"
                ranges_raw = job.params.get("ranges")
                ranges: list[dict[str, int]] | None = None
                if isinstance(ranges_raw, list):
                    parsed_ranges: list[dict[str, int]] = []
                    for entry in ranges_raw:
                        if isinstance(entry, dict) and "from" in entry and "to" in entry:
                            try:
                                parsed_ranges.append(
                                    {"from": int(entry["from"]), "to": int(entry["to"])}
                                )
                            except (TypeError, ValueError) as exc:
                                raise ValidationError("Bad range in saved job.") from exc
                    ranges = parsed_ranges if parsed_ranges else None
                every_n_raw = job.params.get("every_n")
                every_n = (
                    int(every_n_raw)
                    if isinstance(every_n_raw, int) and not isinstance(every_n_raw, bool)
                    else None
                )
                options_raw = job.params.get("split_options")
                options = options_raw if isinstance(options_raw, dict) else None
                return await self.create_split_job(
                    organization_id=organization_id,
                    user_id=user_id,
                    document_id=document_id,
                    mode=mode,
                    ranges=ranges,
                    every_n=every_n,
                    options=options,
                    idempotency_key=idempotency_key,
                    zero_retention=zero_retention,
                )
            if job.kind == JobKind.ROTATE:
                rotations = job.params.get("rotations")
                if not isinstance(rotations, dict):
                    raise ValidationError("Job is missing rotation map.")
                return await self.create_rotate_job(
                    organization_id=organization_id,
                    user_id=user_id,
                    document_id=document_id,
                    rotations={str(k): int(v) for k, v in rotations.items()},
                    idempotency_key=idempotency_key,
                    zero_retention=zero_retention,
                )
            if job.kind == JobKind.REORDER:
                order_raw = job.params.get("order")
                if not isinstance(order_raw, list):
                    raise ValidationError("Job is missing page order.")
                return await self.create_reorder_job(
                    organization_id=organization_id,
                    user_id=user_id,
                    document_id=document_id,
                    order=[int(p) for p in order_raw],
                    idempotency_key=idempotency_key,
                    zero_retention=zero_retention,
                )
            language = job.params.get("language", "eng")
            return await self.create_ocr_job(
                organization_id=organization_id,
                user_id=user_id,
                document_id=document_id,
                language=str(language),
                idempotency_key=idempotency_key,
                zero_retention=zero_retention,
            )

        if job.kind in _SIMPLE_RETRY_TASKS:
            document_id_raw = job.params.get("document_id") if job.params else None
            if not isinstance(document_id_raw, str):
                raise ValidationError("Job is missing the data needed to retry.")
            allowed_keys = _SIMPLE_RETRY_KEYS[job.kind]
            extra = {k: v for k, v in (job.params or {}).items() if k in allowed_keys}
            return await self._create_simple_job(
                organization_id=organization_id,
                user_id=user_id,
                document_id=UUID(document_id_raw),
                idempotency_key=idempotency_key,
                is_anonymous=False,
                zero_retention=zero_retention,
                kind=job.kind,
                extra_params=extra,
                task_name=_SIMPLE_RETRY_TASKS[job.kind],
            )

        raise ValidationError(
            f"Retry is not supported for {job.kind.value} jobs yet.",
            details={"kind": job.kind.value},
        )

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
        if cancelled is None:
            await self.session.rollback()
            current = await self.jobs.get_for_org(
                organization_id=organization_id,
                job_id=job_id,
            )
            if current is None:
                raise JobNotFoundError("Job not found.")
            phase = await self._latest_phase(job_id=current.id)
            return _job_to_out(current, phase=phase)

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

        suggested = _suggest_output_filename_for(job)

        url = await self.storage.presign_download(
            bucket=storage_object.bucket,
            key=storage_object.key,
            filename=suggested,
        )
        expires_at = utc_now() + timedelta(seconds=settings.s3_presign_expires_seconds)

        zero_retention = bool(job.params.get("zero_retention")) if job.params else False
        if zero_retention or settings.zero_retention_mode:
            self._schedule_output_purge(job.id)

        return DownloadUrlResult(url=url, expires_at=expires_at, filename=suggested)

    @staticmethod
    def _schedule_output_purge(job_id: UUID) -> None:
        try:
            from papyrus_api.workers.celery_app import celery_app

            celery_app.send_task(
                "papyrus.cleanup.purge_job_output",
                args=[str(job_id)],
                countdown=settings.zero_retention_grace_seconds,
            )
        except Exception:
            log.warning("jobs.zero_retention.schedule_purge_failed", job_id=str(job_id))

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
        event = await self.events.latest(job_id=job_id)
        if event is None:
            return None
        payload = event.payload or {}
        phase = payload.get("phase") if isinstance(payload, dict) else None
        return phase if isinstance(phase, str) else None

    async def _reserve_quota(
        self,
        organization_id: UUID,
        *,
        is_anonymous: bool = False,
    ) -> None:
        inflight = await self.jobs.count_inflight_for_org(organization_id=organization_id)
        if inflight >= settings.max_inflight_jobs_per_org:
            raise QuotaExceededError(
                "Too many jobs are still in progress. Let some finish, then try again.",
                details={"max_inflight": settings.max_inflight_jobs_per_org},
            )

        limit = settings.anon_daily_job_quota if is_anonymous else settings.user_daily_job_quota
        allowed, _count = await reserve_daily_quota(
            self.redis,
            namespace="jobs",
            principal_id=str(organization_id),
            limit=limit,
        )
        if not allowed:
            message = (
                "Daily job quota exceeded. Sign up for a higher limit."
                if is_anonymous
                else "Daily job quota exceeded."
            )
            raise QuotaExceededError(
                message,
                details={"quota": limit, "anonymous": is_anonymous},
            )

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


_SUFFIX_BY_KIND: dict[JobKind, str] = {
    JobKind.COMPRESS: "compressed",
    JobKind.MERGE: "merged",
    JobKind.SPLIT: "split",
    JobKind.ROTATE: "rotated",
    JobKind.REORDER: "reordered",
    JobKind.OCR: "ocr",
    JobKind.PROTECT: "protected",
    JobKind.UNLOCK: "unlocked",
    JobKind.WATERMARK: "watermarked",
    JobKind.PAGE_NUMBERS: "numbered",
    JobKind.CROP: "cropped",
    JobKind.PDF_TO_IMAGES: "images",
    JobKind.IMAGES_TO_PDF: "converted",
    JobKind.SIGN: "signed",
    JobKind.REDACT: "redacted",
    JobKind.EDIT: "edited",
}


def _split_combined_into_single(params: dict[str, Any]) -> bool:
    if params.get("mode") != "ranges":
        return False
    options = params.get("split_options")
    if not isinstance(options, dict):
        return False
    return bool(options.get("combine_into_single"))


def _merge_stem_from_inputs(names: list[str], suffix: str) -> str:
    cleaned = [safe_filename_stem(n, fallback="") for n in names if isinstance(n, str)]
    cleaned = [c for c in cleaned if c]
    if not cleaned:
        return suffix
    if len(cleaned) == 1:
        return cleaned[0]
    head = cleaned[0]
    extra = len(cleaned) - 1
    return safe_filename_stem(
        f"{head}-and-{extra}-more",
        fallback=suffix,
    )


def _suggest_output_filename_for(job: Job) -> str:
    params = job.params if isinstance(job.params, dict) else {}

    if job.kind == JobKind.SPLIT:
        if _split_combined_into_single(params):
            suffix = "extracted"
            ext = "pdf"
        else:
            suffix = "split"
            ext = "zip"
    elif job.kind == JobKind.MERGE:
        suffix = "merged"
        ext = "pdf"
    elif job.kind == JobKind.PDF_TO_IMAGES:
        suffix = "images"
        ext = "zip"
    else:
        suffix = _SUFFIX_BY_KIND.get(job.kind, "output")
        ext = "pdf"

    if job.kind == JobKind.MERGE:
        names = params.get("input_filenames")
        stem: str | None = None
        if isinstance(names, list) and names:
            stem = _merge_stem_from_inputs(
                [n for n in names if isinstance(n, str)],
                suffix=suffix,
            )
        return compose_output_filename(
            stem=stem,
            suffix=suffix,
            extension=ext,
            fallback_stem=suffix,
        )

    original = params.get("input_filename")
    return compose_output_filename(
        stem=original if isinstance(original, str) else None,
        suffix=suffix,
        extension=ext,
    )


def job_to_out(job: Job, *, phase: str | None) -> JobOut:
    return _job_to_out(job, phase=phase)


__all__ = [
    "CreateJobResult",
    "DownloadUrlResult",
    "JobService",
    "job_to_out",
]

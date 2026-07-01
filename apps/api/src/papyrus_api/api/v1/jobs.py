from __future__ import annotations

import contextlib
import json
from collections.abc import AsyncIterator
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query, Response, status
from fastapi.responses import StreamingResponse
from redis.asyncio import Redis

from papyrus_api.api.deps import (
    CompressEstimateServiceDep,
    CurrentPrincipal,
    JobServiceDep,
    RedisDep,
    SsePrincipal,
    rate_limit,
)
from papyrus_api.core.config import settings
from papyrus_api.core.cookies import set_sse_cookie
from papyrus_api.core.security import issue_sse_token
from papyrus_api.domain.jobs.enums import JobKind, JobStatus
from papyrus_api.integrations.redis import get_pubsub_redis
from papyrus_api.schemas.jobs import (
    CompressEstimateOut,
    CompressEstimateRequest,
    CompressJobRequest,
    ConvertJobRequest,
    CropJobRequest,
    DownloadUrlOut,
    EditJobRequest,
    ImagesToPdfJobRequest,
    JobKindLiteral,
    JobOut,
    JobsListPage,
    JobStatusLiteral,
    MergeJobRequest,
    OcrJobRequest,
    PageNumbersJobRequest,
    PdfToImagesJobRequest,
    ProtectJobRequest,
    RedactJobRequest,
    ReorderJobRequest,
    RetryJobRequest,
    RotateJobRequest,
    SignJobRequest,
    SplitJobRequest,
    UnlockJobRequest,
    WatermarkJobRequest,
)
from papyrus_api.services.job_service import JobService, job_to_out

router = APIRouter(prefix="/jobs", tags=["jobs"])

_TERMINAL_VALUES = {
    JobStatus.SUCCEEDED.value,
    JobStatus.FAILED.value,
    JobStatus.CANCELLED.value,
}

_SUBMIT_LIMITS = [
    rate_limit(
        "jobs.submit.burst",
        limit=settings.jobs_submit_burst_limit,
        window_seconds=settings.jobs_submit_burst_window_seconds,
    ),
    rate_limit(
        "jobs.submit.hourly",
        limit=settings.jobs_submit_hourly_limit,
        window_seconds=settings.jobs_submit_hourly_window_seconds,
    ),
]


@router.post(
    "/compress",
    response_model=JobOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=_SUBMIT_LIMITS,
)
async def create_compression_job(
    payload: CompressJobRequest,
    principal: CurrentPrincipal,
    service: JobServiceDep,
    response: Response,
) -> JobOut:
    user, organization = principal
    options_dict: dict[str, object] | None = None
    if payload.options is not None:
        options_dict = payload.options.model_dump(exclude_none=True)
    result = await service.create_compression_job(
        organization_id=organization.id,
        user_id=user.id,
        document_id=payload.document_id,
        compression_level=payload.compression_level,
        options=options_dict,
        idempotency_key=payload.idempotency_key,
        is_anonymous=user.is_anonymous,
        zero_retention=payload.zero_retention,
    )
    if result.replay:
        response.status_code = status.HTTP_200_OK
    phase = "queued" if result.job.status == JobStatus.PENDING else None
    return job_to_out(result.job, phase=phase)


@router.post(
    "/compress/estimate",
    response_model=CompressEstimateOut,
    dependencies=[rate_limit("jobs.compress.estimate", limit=20, window_seconds=60)],
)
async def estimate_compression(
    payload: CompressEstimateRequest,
    principal: CurrentPrincipal,
    service: CompressEstimateServiceDep,
) -> CompressEstimateOut:
    user, organization = principal
    options_dict: dict[str, object] | None = None
    if payload.options is not None:
        options_dict = payload.options.model_dump(exclude_none=True)
    result = await service.estimate(
        organization_id=organization.id,
        document_id=payload.document_id,
        compression_level=payload.compression_level,
        options=options_dict,
        is_anonymous=user.is_anonymous,
    )
    return CompressEstimateOut(
        input_size_bytes=result.input_size_bytes,
        projected_output_size_bytes=result.projected_output_size_bytes,
        projected_ratio=result.projected_ratio,
        projected_savings_bytes=result.projected_savings_bytes,
        total_page_count=result.total_page_count,
        sample_page_count=result.sample_page_count,
        sample_input_size_bytes=result.sample_input_size_bytes,
        sample_output_size_bytes=result.sample_output_size_bytes,
        engine=result.engine,  # type: ignore[arg-type]
        gs_version=result.gs_version,
        elapsed_ms=result.elapsed_ms,
    )


@router.post(
    "/merge",
    response_model=JobOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=_SUBMIT_LIMITS,
)
async def create_merge_job(
    payload: MergeJobRequest,
    principal: CurrentPrincipal,
    service: JobServiceDep,
    response: Response,
) -> JobOut:
    user, organization = principal
    input_specs = [
        {
            "document_id": str(spec.document_id),
            "page_ranges": spec.page_ranges,
        }
        for spec in payload.inputs
    ]
    options_dict: dict[str, object] | None = None
    if payload.options is not None:
        options_dict = payload.options.model_dump(exclude_none=True)
    result = await service.create_merge_job(
        organization_id=organization.id,
        user_id=user.id,
        input_specs=input_specs,
        options=options_dict,
        idempotency_key=payload.idempotency_key,
        is_anonymous=user.is_anonymous,
        zero_retention=payload.zero_retention,
    )
    if result.replay:
        response.status_code = status.HTTP_200_OK
    phase = "queued" if result.job.status == JobStatus.PENDING else None
    return job_to_out(result.job, phase=phase)


@router.post(
    "/split",
    response_model=JobOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=_SUBMIT_LIMITS,
)
async def create_split_job(
    payload: SplitJobRequest,
    principal: CurrentPrincipal,
    service: JobServiceDep,
    response: Response,
) -> JobOut:
    user, organization = principal
    ranges_payload: list[dict[str, int]] | None = None
    if payload.ranges is not None:
        ranges_payload = [{"from": item.from_page, "to": item.to_page} for item in payload.ranges]
    options_dict: dict[str, object] | None = None
    if payload.options is not None:
        options_dict = payload.options.model_dump(exclude_none=True)
    result = await service.create_split_job(
        organization_id=organization.id,
        user_id=user.id,
        document_id=payload.document_id,
        mode=payload.mode,
        ranges=ranges_payload,
        every_n=payload.every_n,
        options=options_dict,
        idempotency_key=payload.idempotency_key,
        is_anonymous=user.is_anonymous,
        zero_retention=payload.zero_retention,
    )
    if result.replay:
        response.status_code = status.HTTP_200_OK
    phase = "queued" if result.job.status == JobStatus.PENDING else None
    return job_to_out(result.job, phase=phase)


@router.post(
    "/convert",
    response_model=JobOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=_SUBMIT_LIMITS,
)
async def create_convert_job(
    payload: ConvertJobRequest,
    principal: CurrentPrincipal,
    service: JobServiceDep,
    response: Response,
) -> JobOut:
    user, organization = principal
    result = await service.create_convert_job(
        organization_id=organization.id,
        user_id=user.id,
        document_id=payload.document_id,
        idempotency_key=payload.idempotency_key,
        is_anonymous=user.is_anonymous,
        zero_retention=payload.zero_retention,
    )
    if result.replay:
        response.status_code = status.HTTP_200_OK
    phase = "queued" if result.job.status == JobStatus.PENDING else None
    return job_to_out(result.job, phase=phase)


@router.post(
    "/pdf-to-word",
    response_model=JobOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=_SUBMIT_LIMITS,
)
async def create_pdf_to_word_job(
    payload: ConvertJobRequest,
    principal: CurrentPrincipal,
    service: JobServiceDep,
    response: Response,
) -> JobOut:
    user, organization = principal
    result = await service.create_pdf_to_word_job(
        organization_id=organization.id,
        user_id=user.id,
        document_id=payload.document_id,
        idempotency_key=payload.idempotency_key,
        is_anonymous=user.is_anonymous,
        zero_retention=payload.zero_retention,
    )
    if result.replay:
        response.status_code = status.HTTP_200_OK
    phase = "queued" if result.job.status == JobStatus.PENDING else None
    return job_to_out(result.job, phase=phase)


@router.post(
    "/rotate",
    response_model=JobOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=_SUBMIT_LIMITS,
)
async def create_rotate_job(
    payload: RotateJobRequest,
    principal: CurrentPrincipal,
    service: JobServiceDep,
    response: Response,
) -> JobOut:
    user, organization = principal
    result = await service.create_rotate_job(
        organization_id=organization.id,
        user_id=user.id,
        document_id=payload.document_id,
        rotations=payload.rotations,
        idempotency_key=payload.idempotency_key,
        is_anonymous=user.is_anonymous,
        zero_retention=payload.zero_retention,
    )
    if result.replay:
        response.status_code = status.HTTP_200_OK
    phase = "queued" if result.job.status == JobStatus.PENDING else None
    return job_to_out(result.job, phase=phase)


@router.post(
    "/reorder",
    response_model=JobOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=_SUBMIT_LIMITS,
)
async def create_reorder_job(
    payload: ReorderJobRequest,
    principal: CurrentPrincipal,
    service: JobServiceDep,
    response: Response,
) -> JobOut:
    user, organization = principal
    result = await service.create_reorder_job(
        organization_id=organization.id,
        user_id=user.id,
        document_id=payload.document_id,
        order=payload.order,
        idempotency_key=payload.idempotency_key,
        is_anonymous=user.is_anonymous,
        zero_retention=payload.zero_retention,
    )
    if result.replay:
        response.status_code = status.HTTP_200_OK
    phase = "queued" if result.job.status == JobStatus.PENDING else None
    return job_to_out(result.job, phase=phase)


@router.post(
    "/ocr",
    response_model=JobOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=_SUBMIT_LIMITS,
)
async def create_ocr_job(
    payload: OcrJobRequest,
    principal: CurrentPrincipal,
    service: JobServiceDep,
    response: Response,
) -> JobOut:
    user, organization = principal
    result = await service.create_ocr_job(
        organization_id=organization.id,
        user_id=user.id,
        document_id=payload.document_id,
        language=payload.language,
        idempotency_key=payload.idempotency_key,
        is_anonymous=user.is_anonymous,
        zero_retention=payload.zero_retention,
    )
    if result.replay:
        response.status_code = status.HTTP_200_OK
    phase = "queued" if result.job.status == JobStatus.PENDING else None
    return job_to_out(result.job, phase=phase)


@router.post(
    "/protect",
    response_model=JobOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=_SUBMIT_LIMITS,
)
async def create_protect_job(
    payload: ProtectJobRequest,
    principal: CurrentPrincipal,
    service: JobServiceDep,
    response: Response,
) -> JobOut:
    user, organization = principal
    result = await service.create_protect_job(
        organization_id=organization.id,
        user_id=user.id,
        document_id=payload.document_id,
        secret={"user_password": payload.password, "owner_password": payload.owner_password},
        options={
            "allow_printing": payload.allow_printing,
            "allow_copying": payload.allow_copying,
        },
        idempotency_key=payload.idempotency_key,
        is_anonymous=user.is_anonymous,
        zero_retention=payload.zero_retention,
    )
    if result.replay:
        response.status_code = status.HTTP_200_OK
    phase = "queued" if result.job.status == JobStatus.PENDING else None
    return job_to_out(result.job, phase=phase)


@router.post(
    "/unlock",
    response_model=JobOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=_SUBMIT_LIMITS,
)
async def create_unlock_job(
    payload: UnlockJobRequest,
    principal: CurrentPrincipal,
    service: JobServiceDep,
    response: Response,
) -> JobOut:
    user, organization = principal
    result = await service.create_unlock_job(
        organization_id=organization.id,
        user_id=user.id,
        document_id=payload.document_id,
        secret={"password": payload.password},
        idempotency_key=payload.idempotency_key,
        is_anonymous=user.is_anonymous,
        zero_retention=payload.zero_retention,
    )
    if result.replay:
        response.status_code = status.HTTP_200_OK
    phase = "queued" if result.job.status == JobStatus.PENDING else None
    return job_to_out(result.job, phase=phase)


@router.post(
    "/watermark",
    response_model=JobOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=_SUBMIT_LIMITS,
)
async def create_watermark_job(
    payload: WatermarkJobRequest,
    principal: CurrentPrincipal,
    service: JobServiceDep,
    response: Response,
) -> JobOut:
    user, organization = principal
    result = await service.create_watermark_job(
        organization_id=organization.id,
        user_id=user.id,
        document_id=payload.document_id,
        options={
            "text": payload.text,
            "color": payload.color,
            "opacity": payload.opacity,
            "size": payload.size,
            "rotation": payload.rotation,
            "tile": payload.tile,
            "font": payload.font,
        },
        idempotency_key=payload.idempotency_key,
        is_anonymous=user.is_anonymous,
        zero_retention=payload.zero_retention,
    )
    if result.replay:
        response.status_code = status.HTTP_200_OK
    phase = "queued" if result.job.status == JobStatus.PENDING else None
    return job_to_out(result.job, phase=phase)


@router.post(
    "/page-numbers",
    response_model=JobOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=_SUBMIT_LIMITS,
)
async def create_page_numbers_job(
    payload: PageNumbersJobRequest,
    principal: CurrentPrincipal,
    service: JobServiceDep,
    response: Response,
) -> JobOut:
    user, organization = principal
    result = await service.create_page_numbers_job(
        organization_id=organization.id,
        user_id=user.id,
        document_id=payload.document_id,
        options={
            "format": payload.format,
            "position": payload.position,
            "start_at": payload.start_at,
            "size": payload.size,
            "color": payload.color,
            "font": payload.font,
        },
        idempotency_key=payload.idempotency_key,
        is_anonymous=user.is_anonymous,
        zero_retention=payload.zero_retention,
    )
    if result.replay:
        response.status_code = status.HTTP_200_OK
    phase = "queued" if result.job.status == JobStatus.PENDING else None
    return job_to_out(result.job, phase=phase)


@router.post(
    "/crop",
    response_model=JobOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=_SUBMIT_LIMITS,
)
async def create_crop_job(
    payload: CropJobRequest,
    principal: CurrentPrincipal,
    service: JobServiceDep,
    response: Response,
) -> JobOut:
    user, organization = principal
    result = await service.create_crop_job(
        organization_id=organization.id,
        user_id=user.id,
        document_id=payload.document_id,
        options={"box": payload.box.model_dump(), "pages": payload.pages},
        idempotency_key=payload.idempotency_key,
        is_anonymous=user.is_anonymous,
        zero_retention=payload.zero_retention,
    )
    if result.replay:
        response.status_code = status.HTTP_200_OK
    phase = "queued" if result.job.status == JobStatus.PENDING else None
    return job_to_out(result.job, phase=phase)


@router.post(
    "/pdf-to-images",
    response_model=JobOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=_SUBMIT_LIMITS,
)
async def create_pdf_to_images_job(
    payload: PdfToImagesJobRequest,
    principal: CurrentPrincipal,
    service: JobServiceDep,
    response: Response,
) -> JobOut:
    user, organization = principal
    result = await service.create_pdf_to_images_job(
        organization_id=organization.id,
        user_id=user.id,
        document_id=payload.document_id,
        options={
            "image_format": payload.image_format,
            "dpi": payload.dpi,
            "quality": payload.quality,
        },
        idempotency_key=payload.idempotency_key,
        is_anonymous=user.is_anonymous,
        zero_retention=payload.zero_retention,
    )
    if result.replay:
        response.status_code = status.HTTP_200_OK
    phase = "queued" if result.job.status == JobStatus.PENDING else None
    return job_to_out(result.job, phase=phase)


@router.post(
    "/images-to-pdf",
    response_model=JobOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=_SUBMIT_LIMITS,
)
async def create_images_to_pdf_job(
    payload: ImagesToPdfJobRequest,
    principal: CurrentPrincipal,
    service: JobServiceDep,
    response: Response,
) -> JobOut:
    user, organization = principal
    result = await service.create_images_to_pdf_job(
        organization_id=organization.id,
        user_id=user.id,
        document_ids=payload.document_ids,
        options={"page_size": payload.page_size},
        idempotency_key=payload.idempotency_key,
        is_anonymous=user.is_anonymous,
        zero_retention=payload.zero_retention,
    )
    if result.replay:
        response.status_code = status.HTTP_200_OK
    phase = "queued" if result.job.status == JobStatus.PENDING else None
    return job_to_out(result.job, phase=phase)


@router.post(
    "/redact",
    response_model=JobOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=_SUBMIT_LIMITS,
)
async def create_redact_job(
    payload: RedactJobRequest,
    principal: CurrentPrincipal,
    service: JobServiceDep,
    response: Response,
) -> JobOut:
    user, organization = principal
    result = await service.create_redact_job(
        organization_id=organization.id,
        user_id=user.id,
        document_id=payload.document_id,
        options={"redactions": payload.redactions, "dpi": payload.dpi},
        idempotency_key=payload.idempotency_key,
        is_anonymous=user.is_anonymous,
        zero_retention=payload.zero_retention,
    )
    if result.replay:
        response.status_code = status.HTTP_200_OK
    phase = "queued" if result.job.status == JobStatus.PENDING else None
    return job_to_out(result.job, phase=phase)


@router.post(
    "/sign",
    response_model=JobOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=_SUBMIT_LIMITS,
)
async def create_sign_job(
    payload: SignJobRequest,
    principal: CurrentPrincipal,
    service: JobServiceDep,
    response: Response,
) -> JobOut:
    user, organization = principal
    image_refs = [(image.ref, image.document_id) for image in payload.images]
    result = await service.create_sign_job(
        organization_id=organization.id,
        user_id=user.id,
        document_id=payload.document_id,
        image_refs=image_refs,
        placements=payload.placements,
        idempotency_key=payload.idempotency_key,
        is_anonymous=user.is_anonymous,
        zero_retention=payload.zero_retention,
    )
    if result.replay:
        response.status_code = status.HTTP_200_OK
    phase = "queued" if result.job.status == JobStatus.PENDING else None
    return job_to_out(result.job, phase=phase)


@router.post(
    "/edit",
    response_model=JobOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=_SUBMIT_LIMITS,
)
async def create_edit_job(
    payload: EditJobRequest,
    principal: CurrentPrincipal,
    service: JobServiceDep,
    response: Response,
) -> JobOut:
    user, organization = principal
    image_refs = [(image.ref, image.document_id) for image in payload.images]
    result = await service.create_edit_job(
        organization_id=organization.id,
        user_id=user.id,
        document_id=payload.document_id,
        image_refs=image_refs,
        ops=payload.ops,
        idempotency_key=payload.idempotency_key,
        is_anonymous=user.is_anonymous,
        zero_retention=payload.zero_retention,
    )
    if result.replay:
        response.status_code = status.HTTP_200_OK
    phase = "queued" if result.job.status == JobStatus.PENDING else None
    return job_to_out(result.job, phase=phase)


@router.get("/{job_id}", response_model=JobOut)
async def get_job(
    job_id: UUID,
    principal: CurrentPrincipal,
    service: JobServiceDep,
) -> JobOut:
    _user, organization = principal
    return await service.get(organization_id=organization.id, job_id=job_id)


@router.get("", response_model=JobsListPage)
async def list_jobs(
    principal: CurrentPrincipal,
    service: JobServiceDep,
    kind: Annotated[JobKindLiteral | None, Query()] = None,
    status_filter: Annotated[JobStatusLiteral | None, Query(alias="status")] = None,
    cursor: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> JobsListPage:
    _user, organization = principal
    items, next_cursor = await service.list(
        organization_id=organization.id,
        kind=JobKind(kind) if kind else None,
        status=JobStatus(status_filter) if status_filter else None,
        limit=limit,
        cursor=cursor,
    )
    return JobsListPage(items=items, next_cursor=next_cursor)


@router.post("/{job_id}/download", response_model=DownloadUrlOut)
async def get_download_url(
    job_id: UUID,
    principal: CurrentPrincipal,
    service: JobServiceDep,
) -> DownloadUrlOut:
    _user, organization = principal
    result = await service.mint_download_url(
        organization_id=organization.id,
        job_id=job_id,
    )
    return DownloadUrlOut(
        url=result.url,
        expires_at=result.expires_at,
        filename=result.filename,
    )


@router.post("/{job_id}/cancel", response_model=JobOut)
async def cancel_job(
    job_id: UUID,
    principal: CurrentPrincipal,
    service: JobServiceDep,
) -> JobOut:
    _user, organization = principal
    return await service.cancel(organization_id=organization.id, job_id=job_id)


@router.post(
    "/{job_id}/retry",
    response_model=JobOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=_SUBMIT_LIMITS,
)
async def retry_job(
    job_id: UUID,
    payload: RetryJobRequest,
    principal: CurrentPrincipal,
    service: JobServiceDep,
    response: Response,
) -> JobOut:
    user, organization = principal
    result = await service.retry(
        organization_id=organization.id,
        user_id=user.id,
        job_id=job_id,
        idempotency_key=payload.idempotency_key,
    )
    if result.replay:
        response.status_code = status.HTTP_200_OK
    phase = "queued" if result.job.status == JobStatus.PENDING else None
    return job_to_out(result.job, phase=phase)


@router.post(
    "/{job_id}/events/ticket",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[rate_limit("jobs.sse_ticket", limit=120, window_seconds=60)],
)
async def issue_sse_ticket(
    job_id: UUID,
    principal: CurrentPrincipal,
    service: JobServiceDep,
    response: Response,
) -> Response:
    user, organization = principal
    await service.get(organization_id=organization.id, job_id=job_id)
    token = issue_sse_token(
        subject=user.id,
        organization_id=organization.id,
        job_id=job_id,
    )
    set_sse_cookie(response, token, path=f"/api/v1/jobs/{job_id}/events")
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.get("/{job_id}/events")
async def stream_job_events(
    job_id: UUID,
    principal: SsePrincipal,
    service: JobServiceDep,
    redis: RedisDep,
) -> StreamingResponse:
    user, organization = principal
    initial = await service.get(organization_id=organization.id, job_id=job_id)
    return StreamingResponse(
        _event_stream(redis, get_pubsub_redis(), str(user.id), job_id, initial),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


def _format_event(event_name: str, data: dict[str, object]) -> bytes:
    payload = json.dumps(data, default=str)
    return f"event: {event_name}\ndata: {payload}\n\n".encode()


async def _event_stream(
    redis: Redis,
    pubsub_redis: Redis,
    user_id: str,
    job_id: UUID,
    initial: JobOut,
) -> AsyncIterator[bytes]:
    yield _format_event("state", initial.model_dump(mode="json"))

    if initial.status in _TERMINAL_VALUES:
        yield _format_event("terminal", initial.model_dump(mode="json"))
        return

    guard_key = f"sse:streams:{user_id}"
    try:
        active = int(await redis.incr(guard_key))
        await redis.expire(guard_key, 3600)
    except Exception:
        active = 1
    if active > settings.sse_max_streams_per_user:
        with contextlib.suppress(Exception):
            await redis.decr(guard_key)
        yield _format_event(
            "terminal",
            {"status": "error", "payload": {"error_code": "too_many_streams"}},
        )
        return

    pubsub = pubsub_redis.pubsub()
    try:
        await pubsub.subscribe(JobService.channel(job_id))
        while True:
            message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=15.0)
            if message is None:
                yield b": ping\n\n"
                continue

            data_raw = message.get("data")
            if not isinstance(data_raw, str):
                continue
            try:
                payload = json.loads(data_raw)
            except json.JSONDecodeError:
                continue

            yield _format_event("state", payload)

            status_value = payload.get("status")
            if isinstance(status_value, str) and status_value in _TERMINAL_VALUES:
                yield _format_event("terminal", payload)
                break
    finally:
        with contextlib.suppress(Exception):
            await redis.decr(guard_key)
        with contextlib.suppress(Exception):
            await pubsub.unsubscribe(JobService.channel(job_id))
        with contextlib.suppress(Exception):
            await pubsub.close()

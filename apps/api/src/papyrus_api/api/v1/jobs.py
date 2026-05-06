from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query, Response, status
from fastapi.responses import StreamingResponse

from papyrus_api.api.deps import (
    CurrentPrincipal,
    JobServiceDep,
    RedisDep,
    SsePrincipal,
)
from papyrus_api.core.config import settings
from papyrus_api.core.security import TokenType, issue_token
from papyrus_api.domain.jobs.enums import JobKind, JobStatus
from papyrus_api.schemas.jobs import (
    CompressJobRequest,
    DownloadUrlOut,
    JobKindLiteral,
    JobOut,
    JobsListPage,
    JobStatusLiteral,
)
from papyrus_api.services.job_service import JobService, job_to_out

router = APIRouter(prefix="/jobs", tags=["jobs"])

_TERMINAL_VALUES = {
    JobStatus.SUCCEEDED.value,
    JobStatus.FAILED.value,
    JobStatus.CANCELLED.value,
}


@router.post(
    "/compress",
    response_model=JobOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_compression_job(
    payload: CompressJobRequest,
    principal: CurrentPrincipal,
    service: JobServiceDep,
    response: Response,
) -> JobOut:
    user, organization = principal
    result = await service.create_compression_job(
        organization_id=organization.id,
        user_id=user.id,
        document_id=payload.document_id,
        compression_level=payload.compression_level,
        idempotency_key=payload.idempotency_key,
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
    "/{job_id}/events/ticket",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def issue_sse_ticket(
    job_id: UUID,
    principal: CurrentPrincipal,
    service: JobServiceDep,
    response: Response,
) -> Response:
    user, organization = principal
    await service.get(organization_id=organization.id, job_id=job_id)
    token = issue_token(
        subject=user.id,
        organization_id=organization.id,
        token_type=TokenType.ACCESS,
    )
    response.set_cookie(
        key="papyrus_sse",
        value=token,
        max_age=60,
        path=f"/api/v1/jobs/{job_id}/events",
        httponly=True,
        secure=settings.is_production,
        samesite="lax",
    )
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.get("/{job_id}/events")
async def stream_job_events(
    job_id: UUID,
    principal: SsePrincipal,
    service: JobServiceDep,
    redis: RedisDep,
) -> StreamingResponse:
    _user, organization = principal
    initial = await service.get(organization_id=organization.id, job_id=job_id)
    return StreamingResponse(
        _event_stream(redis, job_id, initial),
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
    redis: RedisDep,
    job_id: UUID,
    initial: JobOut,
) -> AsyncIterator[bytes]:
    yield _format_event("state", initial.model_dump(mode="json"))

    if initial.status in _TERMINAL_VALUES:
        yield _format_event("terminal", initial.model_dump(mode="json"))
        return

    pubsub = redis.pubsub()
    try:
        await pubsub.subscribe(JobService.channel(job_id))
        while True:
            try:
                message = await asyncio.wait_for(
                    pubsub.get_message(ignore_subscribe_messages=True),
                    timeout=15.0,
                )
            except TimeoutError:
                yield b": ping\n\n"
                continue

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
        try:
            await pubsub.unsubscribe(JobService.channel(job_id))
        except Exception:
            pass
        try:
            await pubsub.close()
        except Exception:
            pass

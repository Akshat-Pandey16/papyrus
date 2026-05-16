from __future__ import annotations

from typing import Annotated, Any
from uuid import UUID

import structlog
from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from papyrus_api.core.errors import AuthenticationError, RateLimitedError
from papyrus_api.core.rate_limit import RateLimiter
from papyrus_api.core.security import TokenType, decode_token
from papyrus_api.db.session import get_session
from papyrus_api.domain.identity.models import Organization, User
from papyrus_api.integrations.redis import get_redis
from papyrus_api.services.compress_estimate_service import CompressEstimateService
from papyrus_api.services.document_service import DocumentService
from papyrus_api.services.identity_service import IdentityService
from papyrus_api.services.job_service import JobService
from papyrus_api.services.storage_service import StorageService
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

DbSession = Annotated[AsyncSession, Depends(get_session)]

_bearer = HTTPBearer(auto_error=False)


def get_identity_service(session: DbSession) -> IdentityService:
    return IdentityService(session)


IdentityServiceDep = Annotated[IdentityService, Depends(get_identity_service)]


def get_storage_service() -> StorageService:
    return StorageService()


StorageServiceDep = Annotated[StorageService, Depends(get_storage_service)]


def get_redis_dep() -> Redis:
    return get_redis()


RedisDep = Annotated[Redis, Depends(get_redis_dep)]


def get_document_service(
    session: DbSession,
    storage: StorageServiceDep,
) -> DocumentService:
    return DocumentService(session, storage)


DocumentServiceDep = Annotated[DocumentService, Depends(get_document_service)]


def get_job_service(
    session: DbSession,
    redis: RedisDep,
    storage: StorageServiceDep,
) -> JobService:
    return JobService(session, redis, storage)


JobServiceDep = Annotated[JobService, Depends(get_job_service)]


def get_compress_estimate_service(
    session: DbSession,
    storage: StorageServiceDep,
) -> CompressEstimateService:
    return CompressEstimateService(session, storage)


CompressEstimateServiceDep = Annotated[
    CompressEstimateService,
    Depends(get_compress_estimate_service),
]


async def _principal_from_token(
    token: str,
    service: IdentityService,
) -> tuple[User, Organization]:
    claims = decode_token(token, expected_type=TokenType.ACCESS)
    user_id = UUID(claims["sub"])
    user, organization = await service.get_session(user_id=user_id)
    structlog.contextvars.bind_contextvars(
        user_id=str(user.id),
        organization_id=str(organization.id),
    )
    return user, organization


async def get_current_principal(
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    service: IdentityServiceDep,
) -> tuple[User, Organization]:
    if creds is None or not creds.credentials:
        raise AuthenticationError("Missing bearer token.")
    return await _principal_from_token(creds.credentials, service)


CurrentPrincipal = Annotated[tuple[User, Organization], Depends(get_current_principal)]


async def get_principal_for_sse(
    request: Request,
    service: IdentityServiceDep,
) -> tuple[User, Organization]:
    auth = request.headers.get("authorization")
    if auth and auth.lower().startswith("bearer "):
        return await _principal_from_token(auth.split(" ", 1)[1], service)
    ticket = request.cookies.get("papyrus_sse")
    if ticket:
        return await _principal_from_token(ticket, service)
    raise AuthenticationError("Missing SSE auth.")


SsePrincipal = Annotated[tuple[User, Organization], Depends(get_principal_for_sse)]


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",", 1)[0].strip()
    return request.client.host if request.client else "anonymous"


def rate_limit(
    scope: str,
    *,
    limit: int,
    window_seconds: int,
) -> Any:
    async def _dep(request: Request, redis: RedisDep) -> None:
        limiter = RateLimiter(redis)
        principal_id = _client_ip(request)
        decision = await limiter.hit(
            scope=scope,
            principal_id=principal_id,
            limit=limit,
            window_seconds=window_seconds,
        )
        if not decision.allowed:
            raise RateLimitedError(
                "Too many requests. Please try again shortly.",
                details={
                    "scope": scope,
                    "retry_after_seconds": decision.retry_after_seconds,
                    "limit": decision.limit,
                },
            )

    return Depends(_dep)

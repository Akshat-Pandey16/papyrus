from __future__ import annotations

from fastapi import APIRouter, Response, status
from sqlalchemy import text

from papyrus_api import __version__
from papyrus_api.api.deps import DbSession, RedisDep
from papyrus_api.schemas.common import HealthResponse, ReadinessResponse

router = APIRouter()


@router.get("/healthz", response_model=HealthResponse)
async def healthz() -> HealthResponse:
    return HealthResponse(status="ok", version=__version__)


@router.get("/readyz", response_model=ReadinessResponse)
async def readyz(
    response: Response,
    session: DbSession,
    redis: RedisDep,
) -> ReadinessResponse:
    checks: dict[str, str] = {}
    overall = "ready"
    try:
        await session.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except Exception as exc:
        checks["database"] = f"error: {type(exc).__name__}"
        overall = "degraded"
    try:
        pong = await redis.ping()
        checks["redis"] = "ok" if pong else "no-pong"
        if not pong:
            overall = "degraded"
    except Exception as exc:
        checks["redis"] = f"error: {type(exc).__name__}"
        overall = "degraded"

    if overall != "ready":
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return ReadinessResponse(status=overall, version=__version__, checks=checks)

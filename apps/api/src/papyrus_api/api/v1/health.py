from __future__ import annotations

from fastapi import APIRouter
from papyrus_api import __version__
from papyrus_api.schemas.common import HealthResponse

router = APIRouter()


@router.get("/healthz", response_model=HealthResponse)
async def healthz() -> HealthResponse:
    return HealthResponse(status="ok", version=__version__)


@router.get("/readyz", response_model=HealthResponse)
async def readyz() -> HealthResponse:
    return HealthResponse(status="ready", version=__version__)

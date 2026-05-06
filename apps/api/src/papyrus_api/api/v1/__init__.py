from __future__ import annotations

from fastapi import APIRouter

from papyrus_api.api.v1 import health

v1_router = APIRouter()
v1_router.include_router(health.router, tags=["health"])

from __future__ import annotations

from fastapi import APIRouter

from papyrus_api.api.v1 import auth, documents, health, jobs

v1_router = APIRouter()
v1_router.include_router(health.router, tags=["health"])
v1_router.include_router(auth.router)
v1_router.include_router(documents.router)
v1_router.include_router(jobs.router)

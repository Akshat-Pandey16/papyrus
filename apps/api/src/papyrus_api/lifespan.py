from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI

from papyrus_api.db.session import dispose_engine, init_engine

log = structlog.get_logger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    log.info("app.startup")
    init_engine()
    try:
        yield
    finally:
        await dispose_engine()
        log.info("app.shutdown")

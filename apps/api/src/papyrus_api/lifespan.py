from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI

from papyrus_api.core.config import settings
from papyrus_api.db.session import dispose_engine, init_engine
from papyrus_api.integrations.redis import close_redis, init_redis
from papyrus_api.services.storage_service import StorageService, close_storage

log = structlog.get_logger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    log.info("app.startup")
    init_engine()
    init_redis()
    for bucket in (settings.s3_bucket_uploads, settings.s3_bucket_outputs):
        try:
            created = await StorageService.ensure_bucket(bucket)
            if created:
                log.info("storage.bucket.created", bucket=bucket)
        except Exception as exc:
            log.warning(
                "storage.bucket.ensure_failed",
                bucket=bucket,
                error=type(exc).__name__,
            )
    try:
        yield
    finally:
        await close_storage()
        await close_redis()
        await dispose_engine()
        log.info("app.shutdown")

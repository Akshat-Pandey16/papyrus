from __future__ import annotations

import structlog
from redis.asyncio import ConnectionPool, Redis

from papyrus_api.core.config import settings

log = structlog.get_logger(__name__)

_pool: ConnectionPool | None = None


def init_redis() -> None:
    global _pool
    if _pool is not None:
        return
    _pool = ConnectionPool.from_url(
        settings.redis_url,
        decode_responses=True,
        max_connections=50,
    )
    log.info("redis.init", url=settings.redis_url)


async def close_redis() -> None:
    global _pool
    if _pool is None:
        return
    await _pool.disconnect(inuse_connections=True)
    _pool = None
    log.info("redis.close")


def get_redis() -> Redis:
    if _pool is None:
        init_redis()
    assert _pool is not None
    return Redis(connection_pool=_pool)

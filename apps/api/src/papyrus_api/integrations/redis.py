from __future__ import annotations

import structlog
from papyrus_api.core.config import settings
from redis.asyncio import ConnectionPool, Redis

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


async def reserve_daily_quota(
    redis: Redis,
    *,
    namespace: str,
    principal_id: str,
    limit: int,
    bucket_seconds: int = 86_400,
) -> tuple[bool, int]:
    key = f"quota:{namespace}:{principal_id}"
    pipe = redis.pipeline()
    pipe.incr(key, 1)
    pipe.expire(key, bucket_seconds, nx=True)
    raw_results = await pipe.execute()
    count = int(raw_results[0]) if raw_results else 0
    if count > limit:
        await redis.decr(key)
        return False, count - 1
    return True, count

from __future__ import annotations

import structlog
from redis.asyncio import ConnectionPool, Redis

from papyrus_api.core.config import settings
from papyrus_api.core.time import utc_now

log = structlog.get_logger(__name__)


def _quota_key(namespace: str, principal_id: str) -> str:
    day = utc_now().strftime("%Y%m%d")
    return f"quota:{namespace}:{day}:{principal_id}"


_pool: ConnectionPool | None = None
_pubsub_pool: ConnectionPool | None = None


def init_redis() -> None:
    global _pool, _pubsub_pool
    if _pool is None:
        _pool = ConnectionPool.from_url(
            settings.redis_url,
            decode_responses=True,
            max_connections=settings.redis_max_connections,
        )
    if _pubsub_pool is None:
        _pubsub_pool = ConnectionPool.from_url(
            settings.redis_url,
            decode_responses=True,
            max_connections=settings.redis_pubsub_max_connections,
        )
    log.info("redis.init", url=settings.redis_url)


async def close_redis() -> None:
    global _pool, _pubsub_pool
    if _pool is not None:
        await _pool.disconnect(inuse_connections=True)
        _pool = None
    if _pubsub_pool is not None:
        await _pubsub_pool.disconnect(inuse_connections=True)
        _pubsub_pool = None
    log.info("redis.close")


def get_redis() -> Redis:
    if _pool is None:
        init_redis()
    assert _pool is not None
    return Redis(connection_pool=_pool)


def get_pubsub_redis() -> Redis:
    if _pubsub_pool is None:
        init_redis()
    assert _pubsub_pool is not None
    return Redis(connection_pool=_pubsub_pool)


async def reserve_daily_quota(
    redis: Redis,
    *,
    namespace: str,
    principal_id: str,
    limit: int,
    bucket_seconds: int = 90_000,
) -> tuple[bool, int]:
    key = _quota_key(namespace, principal_id)
    pipe = redis.pipeline()
    pipe.incr(key, 1)
    pipe.expire(key, bucket_seconds, nx=True)
    raw_results = await pipe.execute()
    count = int(raw_results[0]) if raw_results else 0
    if count > limit:
        await redis.decr(key)
        return False, count - 1
    return True, count


async def release_daily_quota(
    redis: Redis,
    *,
    namespace: str,
    principal_id: str,
) -> None:
    key = _quota_key(namespace, principal_id)
    try:
        remaining = await redis.decr(key)
        if remaining < 0:
            await redis.set(key, 0)
    except Exception:
        log.warning("quota.release_failed", namespace=namespace)

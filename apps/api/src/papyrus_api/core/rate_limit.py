from __future__ import annotations

from dataclasses import dataclass

from redis.asyncio import Redis

_LUA_INCR_WINDOW = """
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('TTL', KEYS[1])
return {current, ttl}
"""


@dataclass(slots=True, frozen=True)
class RateLimitDecision:
    allowed: bool
    remaining: int
    retry_after_seconds: int
    limit: int


class RateLimiter:
    def __init__(self, redis: Redis) -> None:
        self._redis = redis
        self._script = redis.register_script(_LUA_INCR_WINDOW)

    async def hit(
        self,
        *,
        scope: str,
        principal_id: str,
        limit: int,
        window_seconds: int,
    ) -> RateLimitDecision:
        key = f"rl:{scope}:{principal_id}"
        raw = await self._script(keys=[key], args=[window_seconds])
        count = int(raw[0])
        ttl = max(int(raw[1]), 1) if raw[1] is not None else window_seconds
        if count > limit:
            return RateLimitDecision(
                allowed=False,
                remaining=0,
                retry_after_seconds=ttl,
                limit=limit,
            )
        return RateLimitDecision(
            allowed=True,
            remaining=max(limit - count, 0),
            retry_after_seconds=ttl,
            limit=limit,
        )

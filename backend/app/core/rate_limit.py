"""Fixed-window rate limits. Redis when configured, memory in tests."""

import time
from typing import Protocol

from redis.asyncio import Redis


class RateLimiter(Protocol):
    async def allow(self, key: str, limit: int, window_seconds: int) -> bool: ...


class MemoryRateLimiter:
    def __init__(self) -> None:
        self._hits: dict[str, list[float]] = {}

    async def allow(self, key: str, limit: int, window_seconds: int) -> bool:
        now = time.monotonic()
        recent = [item for item in self._hits.get(key, []) if now - item < window_seconds]
        if len(recent) >= limit:
            self._hits[key] = recent
            return False
        recent.append(now)
        self._hits[key] = recent
        return True


class RedisRateLimiter:
    def __init__(self, client: Redis) -> None:
        self._client = client

    async def allow(self, key: str, limit: int, window_seconds: int) -> bool:
        bucket = int(time.time()) // window_seconds
        redis_key = f"rl:{key}:{bucket}"
        count = await self._client.incr(redis_key)
        if count == 1:
            await self._client.expire(redis_key, window_seconds + 1)
        return int(count) <= limit

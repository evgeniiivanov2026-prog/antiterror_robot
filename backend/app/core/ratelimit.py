from __future__ import annotations

import logging
import time
from collections import defaultdict

from app.core.config import Settings


class MemoryRateLimiter:
    def __init__(self) -> None:
        self._hits: dict[str, list[float]] = defaultdict(list)

    async def allow(self, key: str, limit: int, window_seconds: int) -> bool:
        now = time.monotonic()
        fresh = [stamp for stamp in self._hits[key] if now - stamp < window_seconds]
        if len(fresh) >= limit:
            self._hits[key] = fresh
            return False
        fresh.append(now)
        self._hits[key] = fresh
        return True


class RedisRateLimiter:
    def __init__(self, client, fallback: MemoryRateLimiter) -> None:
        self._client = client
        self._fallback = fallback

    async def allow(self, key: str, limit: int, window_seconds: int) -> bool:
        try:
            namespaced = f"atr:{key}"
            current = await self._client.incr(namespaced)
            if current == 1:
                await self._client.expire(namespaced, window_seconds)
            return int(current) <= limit
        except Exception:
            logging.getLogger("antiterror").warning(
                "rate_limit_backend_unavailable",
                extra={"fields": {"event": "rate_limit_backend_unavailable"}},
            )
            return await self._fallback.allow(key, limit, window_seconds)


def make_limiter(settings: Settings):
    memory = MemoryRateLimiter()
    if not settings.redis_url:
        return memory
    from redis.asyncio import Redis

    client = Redis.from_url(settings.redis_url, socket_timeout=1.0)
    return RedisRateLimiter(client, memory)

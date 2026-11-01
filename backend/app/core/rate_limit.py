"""Fixed-window counters. Redis in production, memory in tests."""

import time
from typing import Protocol

from redis.asyncio import Redis

from app.core.config import get_settings
from app.core.errors import AppError


class RateLimiter(Protocol):
    async def hit(self, key: str, limit: int, window_seconds: int) -> tuple[bool, int]: ...

    async def close(self) -> None: ...


class MemoryRateLimiter:
    def __init__(self) -> None:
        self._hits: dict[str, list[float]] = {}

    def reset(self) -> None:
        self._hits.clear()

    async def hit(self, key: str, limit: int, window_seconds: int) -> tuple[bool, int]:
        now = time.monotonic()
        fresh = [stamp for stamp in self._hits.get(key, []) if now - stamp < window_seconds]
        if len(fresh) >= limit:
            retry = int(window_seconds - (now - fresh[0])) + 1
            self._hits[key] = fresh
            return False, max(retry, 1)
        fresh.append(now)
        self._hits[key] = fresh
        return True, 0

    async def close(self) -> None:
        return None


class RedisRateLimiter:
    def __init__(self, url: str) -> None:
        self._redis = Redis.from_url(url, decode_responses=True)

    async def hit(self, key: str, limit: int, window_seconds: int) -> tuple[bool, int]:
        namespaced = f"atr:{key}"
        count = await self._redis.incr(namespaced)
        if count == 1:
            await self._redis.expire(namespaced, window_seconds)
        if count > limit:
            ttl = await self._redis.ttl(namespaced)
            return False, max(int(ttl), 1)
        return True, 0

    async def close(self) -> None:
        await self._redis.aclose()


_limiter: RateLimiter | None = None


def get_limiter() -> RateLimiter:
    global _limiter
    if _limiter is None:
        settings = get_settings()
        if settings.rate_limit_backend == "redis":
            _limiter = RedisRateLimiter(settings.redis_url)
        else:
            _limiter = MemoryRateLimiter()
    return _limiter


async def enforce_rate_limit(key: str, limit: int, window_seconds: int) -> None:
    try:
        allowed, retry_after = await get_limiter().hit(key, limit, window_seconds)
    except Exception as exc:
        raise AppError(
            "unavailable",
            "Сервис временно ограничивает приём. Если опасность сейчас — звоните 112 или 102.",
            503,
        ) from exc
    if not allowed:
        raise AppError(
            "rate_limited",
            "Слишком много обращений. Подождите немного и попробуйте снова. Если опасность сейчас — звоните 112 или 102.",
            429,
            [{"field": "retry_after", "message": str(retry_after)}],
        )

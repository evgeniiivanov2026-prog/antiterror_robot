from __future__ import annotations

from fastapi import Request

from app.core.config import Settings
from app.core.security import AuthError, TelegramIdentity, parse_init_data
from app.services.errors import DomainError


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


async def get_identity(request: Request) -> TelegramIdentity:
    settings: Settings = request.app.state.settings
    header = request.headers.get("authorization", "")
    if header.lower().startswith("tma "):
        return parse_init_data(
            header[4:].strip(),
            settings.bot_token,
            settings.init_data_max_age_seconds,
        )
    if settings.allow_dev_auth and settings.environment in {"development", "test"}:
        raw = request.headers.get("x-dev-user-id", "")
        if raw.isdigit() and int(raw) > 0:
            return TelegramIdentity(telegram_id=int(raw), auth_date=0)
    raise AuthError("missing init data")


async def enforce_rate_limit(request: Request, bucket: str, limit: int, window: int) -> None:
    allowed = await request.app.state.limiter.allow(bucket, limit, window)
    if not allowed:
        raise DomainError("rate_limited", "Слишком много запросов. Подождите и попробуйте снова.", 429)


def client_key(request: Request) -> str:
    if request.client is None:
        return "unknown"
    return request.client.host or "unknown"

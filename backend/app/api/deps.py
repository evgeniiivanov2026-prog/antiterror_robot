"""Shared dependencies: database session, Telegram user, and roles."""

from collections.abc import AsyncIterator

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.errors import AppError
from app.core.telegram_auth import validate_init_data
from app.models.user import User, UserRole
from app.services.users import upsert_user


def client_host(request: Request, settings: Settings) -> str:
    if settings.trust_proxy:
        forwarded = request.headers.get("x-forwarded-for", "")
        if forwarded:
            return forwarded.split(",")[0].strip()[:64]
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


async def get_session(request: Request) -> AsyncIterator[AsyncSession]:
    maker = request.app.state.sessionmaker
    async with maker() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        else:
            await session.commit()


def _init_data(request: Request) -> str:
    header = request.headers.get("authorization", "")
    if header.lower().startswith("tma "):
        return header[4:].strip()
    return request.headers.get("x-telegram-init-data", "").strip()


async def get_current_user(
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> User:
    settings: Settings = request.app.state.settings
    raw = _init_data(request)
    if raw:
        telegram_id = validate_init_data(raw, settings.bot_token, settings.telegram_auth_max_age_seconds)["telegram_id"]
    elif settings.allow_dev_auth_bypass and settings.app_env != "production":
        raw_id = request.headers.get("x-dev-user-id", "")
        if not raw_id.isdigit():
            raise AppError("unauthorized", "Нужна авторизация Telegram", 401)
        telegram_id = int(raw_id)
    else:
        raise AppError("unauthorized", "Нужна авторизация Telegram", 401)

    limiter = request.app.state.limiter
    allowed = await limiter.allow(
        f"user:{telegram_id}",
        settings.rate_limit_requests,
        settings.rate_limit_window_seconds,
    )
    if not allowed:
        raise AppError("rate_limited", "Слишком много запросов. Подождите немного.", 429)
    return await upsert_user(session, telegram_id, settings)


async def require_staff(user: User = Depends(get_current_user)) -> User:
    if user.role not in {UserRole.moderator, UserRole.admin}:
        raise AppError("forbidden", "Недостаточно прав", 403)
    return user

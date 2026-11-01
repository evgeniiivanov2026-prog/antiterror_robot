from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_session
from app.core.errors import AppError
from app.core.security import validate_init_data
from app.models.user import UserAccount
from app.services.users import upsert_user


async def get_current_user(
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> UserAccount:
    return await upsert_user(session, resolve_telegram_id(request))


def resolve_telegram_id(request: Request) -> int:
    settings = get_settings()
    header = request.headers.get("authorization", "")
    if header[:4].lower() == "tma ":
        user = validate_init_data(header[4:].strip(), settings.bot_token, settings.init_data_max_age_seconds)
        return int(user["id"])
    if settings.allow_dev_auth and settings.environment in {"development", "test"}:
        raw = request.headers.get("x-dev-telegram-id", "")
        if raw.isdigit() and int(raw) > 0:
            return int(raw)
    raise AppError("unauthorized", "Откройте сервис из Telegram и попробуйте снова.", 401)

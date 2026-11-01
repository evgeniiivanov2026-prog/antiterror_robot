"""Telegram webhook. The raw update is not written to logs."""

from fastapi import APIRouter, Request

from app.core.config import get_settings
from app.core.errors import AppError
from app.core.security import webhook_secret_matches

router = APIRouter()


@router.post("/bot/webhook")
async def telegram_webhook(request: Request) -> dict[str, bool]:
    settings = get_settings()
    provided = request.headers.get("x-telegram-bot-api-secret-token", "")
    if not webhook_secret_matches(provided, settings.webhook_secret):
        raise AppError("unauthorized", "Недостаточно прав.", 401)
    if not settings.bot_token:
        raise AppError("bot_disabled", "Бот не настроен.", 503)
    try:
        payload = await request.json()
    except Exception as exc:
        raise AppError("invalid_update", "Некорректное обновление.", 400) from exc
    from aiogram.types import Update

    from app.bot.runtime import get_bot, get_dispatcher

    update = Update.model_validate(payload)
    await get_dispatcher().feed_update(get_bot(), update)
    return {"ok": True}

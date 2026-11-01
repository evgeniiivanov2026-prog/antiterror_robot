"""Telegram webhook. The shared secret is required and the body is not logged."""

import hmac
import logging

from fastapi import APIRouter, Request

from app.core.errors import AppError

logger = logging.getLogger(__name__)
router = APIRouter(tags=["telegram"])


@router.post("/telegram/webhook")
async def telegram_webhook(request: Request) -> dict[str, bool]:
    settings = request.app.state.settings
    if settings.bot_mode != "webhook":
        raise AppError("not_found", "Ресурс не найден", 404)
    provided = request.headers.get("x-telegram-bot-api-secret-token", "")
    expected = settings.bot_webhook_secret
    if not expected or not hmac.compare_digest(provided, expected):
        raise AppError("unauthorized", "Неверный секрет вебхука", 401)
    try:
        payload = await request.json()
    except Exception as exc:
        raise AppError("validation_error", "Некорректное обновление", 400) from exc
    bot = getattr(request.app.state, "bot", None)
    dispatcher = getattr(request.app.state, "dispatcher", None)
    if bot is None or dispatcher is None:
        logger.error("webhook is enabled but the bot is not ready", extra={"event": "webhook_not_ready"})
        return {"ok": True}
    try:
        from aiogram.types import Update

        update = Update.model_validate(payload, context={"bot": bot})
        await dispatcher.feed_update(bot, update)
    except Exception:
        logger.exception("telegram update was not processed")
    return {"ok": True}

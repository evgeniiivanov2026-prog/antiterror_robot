"""MAX webhook. The shared secret is required and the body is not logged."""

import hmac
import logging

from fastapi import APIRouter, Request

from app.bot.max_flow import plan_reply
from app.core.errors import AppError

logger = logging.getLogger(__name__)
router = APIRouter(tags=["max"])


@router.post("/max/webhook")
async def max_webhook(request: Request) -> dict[str, bool]:
    settings = request.app.state.settings
    if settings.bot_platform != "max" or settings.bot_mode != "webhook":
        raise AppError("not_found", "Ресурс не найден", 404)
    provided = request.headers.get("x-max-bot-api-secret", "")
    expected = settings.bot_webhook_secret
    if not expected or not hmac.compare_digest(provided, expected):
        raise AppError("unauthorized", "Неверный секрет вебхука", 401)
    try:
        payload = await request.json()
    except Exception as exc:
        raise AppError("validation_error", "Некорректное обновление", 400) from exc
    if not isinstance(payload, dict):
        raise AppError("validation_error", "Некорректное обновление", 400)
    client = getattr(request.app.state, "max_client", None)
    if client is None:
        logger.error("max webhook is enabled but the bot is not ready", extra={"event": "max_not_ready"})
        return {"ok": True}
    try:
        reply = await plan_reply(payload, settings, getattr(request.app.state, "sessionmaker", None))
        if reply is not None:
            await client.send_reply(reply)
    except Exception:
        logger.exception("max update was not processed")
    return {"ok": True}

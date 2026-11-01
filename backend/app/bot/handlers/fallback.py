import logging

from aiogram import Router
from aiogram.types import ErrorEvent, Message

from app.bot.texts import UNKNOWN_TEXT

logger = logging.getLogger(__name__)
router = Router(name="fallback")


@router.message()
async def fallback(message: Message) -> None:
    await message.answer(UNKNOWN_TEXT)


@router.error()
async def on_error(event: ErrorEvent) -> None:
    logger.error("bot_handler_error", extra={"error_type": type(event.exception).__name__})
    message = event.update.message
    if message is None:
        return
    try:
        await message.answer("Не получилось обработать сообщение. Если опасность сейчас — звоните 112 или 102.")
    except Exception:
        logger.error("bot_error_reply_failed")

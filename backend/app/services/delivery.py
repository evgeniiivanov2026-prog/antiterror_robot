"""Send the PDF copy to the user's own Telegram chat."""

import logging
from typing import Protocol

from app.core.config import get_settings
from app.core.errors import AppError

logger = logging.getLogger(__name__)


class CopySender(Protocol):
    async def send_pdf(self, telegram_id: int, filename: str, payload: bytes, caption: str) -> None: ...


class AiogramCopySender:
    async def send_pdf(self, telegram_id: int, filename: str, payload: bytes, caption: str) -> None:
        settings = get_settings()
        if not settings.bot_token:
            raise AppError("bot_disabled", "Отправка в чат недоступна. Скачайте PDF.", 503)
        from aiogram import Bot
        from aiogram.exceptions import TelegramAPIError
        from aiogram.types import BufferedInputFile

        bot = Bot(token=settings.bot_token)
        try:
            await bot.send_document(
                chat_id=telegram_id,
                document=BufferedInputFile(payload, filename=filename),
                caption=caption,
            )
        except TelegramAPIError as exc:
            logger.warning("telegram_send_failed", extra={"error_type": type(exc).__name__})
            raise AppError(
                "delivery_failed",
                "Не удалось отправить копию. Откройте бота, нажмите /start и попробуйте снова. PDF можно скачать на экране карточки.",
                502,
            ) from exc
        finally:
            await bot.session.close()


def get_copy_sender() -> CopySender:
    return AiogramCopySender()

"""Send a short copy of the card into the user's bot chat."""

from typing import Protocol

from aiogram import Bot
from aiogram.exceptions import TelegramAPIError

from app.core.errors import AppError


class Notifier(Protocol):
    async def send_message(self, telegram_id: int, text: str) -> None: ...


class MaxNotifier:
    def __init__(self, bot_token: str) -> None:
        self._token = bot_token

    async def send_message(self, telegram_id: int, text: str) -> None:
        from app.bot.max_client import MaxClient
        from app.bot.max_flow import MaxReply

        client = MaxClient(self._token)
        try:
            await client.send_reply(MaxReply(telegram_id, text))
        except AppError:
            raise
        except Exception as exc:
            raise AppError(
                "max_unavailable",
                "Не удалось отправить сообщение. Откройте чат с ботом в MAX и нажмите «Старт».",
                502,
            ) from exc
        finally:
            await client.aclose()


class TelegramNotifier:
    def __init__(self, bot_token: str) -> None:
        self._token = bot_token

    async def send_message(self, telegram_id: int, text: str) -> None:
        bot = Bot(token=self._token)
        try:
            await bot.send_message(telegram_id, text)
        except TelegramAPIError as exc:
            raise AppError(
                "telegram_unavailable",
                "Не удалось отправить сообщение. Откройте чат с ботом и нажмите «Старт».",
                502,
            ) from exc
        finally:
            await bot.session.close()

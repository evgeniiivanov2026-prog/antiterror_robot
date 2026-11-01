from __future__ import annotations

from aiogram import BaseMiddleware, Dispatcher
from aiogram.types import BotCommand

from app.bot.handlers import router
from app.core.config import Settings
from app.core.ratelimit import MemoryRateLimiter

COMMANDS = [
    BotCommand(command="start", description="Открыть AntiTerror Robot"),
    BotCommand(command="report", description="Сообщить о происшествии"),
    BotCommand(command="emergency", description="Срочная помощь: 112 и 102"),
    BotCommand(command="evidence", description="Как сохранить доказательства"),
    BotCommand(command="privacy", description="Конфиденциальность"),
]


class SettingsMiddleware(BaseMiddleware):
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    async def __call__(self, handler, event, data):
        data["settings"] = self.settings
        return await handler(event, data)


class BotLimitMiddleware(BaseMiddleware):
    def __init__(self) -> None:
        self.limiter = MemoryRateLimiter()

    async def __call__(self, handler, event, data):
        user = getattr(event, "from_user", None)
        user_id = getattr(user, "id", 0) or 0
        if not await self.limiter.allow(f"bot:{user_id}", 20, 60):
            answer = getattr(event, "answer", None)
            if answer is not None:
                await answer("Слишком много сообщений. Подождите минуту.")
            return None
        return await handler(event, data)


def build_dispatcher(settings: Settings) -> Dispatcher:
    dispatcher = Dispatcher()
    dispatcher.update.middleware(SettingsMiddleware(settings))
    router.message.middleware(BotLimitMiddleware())
    dispatcher.include_router(router)
    return dispatcher

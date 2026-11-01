"""Shared dispatcher. Polling and webhooks must not run together."""

from aiogram import Bot, Dispatcher
from aiogram.types import BotCommand, MenuButtonWebApp, WebAppInfo

from app.bot.handlers.emergency import router as emergency_router
from app.bot.handlers.fallback import router as fallback_router
from app.bot.handlers.guides import router as guides_router
from app.bot.handlers.start import router as start_router
from app.core.config import get_settings
from app.core.errors import AppError

COMMANDS = [
    BotCommand(command="start", description="Начало работы"),
    BotCommand(command="report", description="Сообщить о происшествии"),
    BotCommand(command="emergency", description="Срочная помощь"),
    BotCommand(command="evidence", description="Как сохранить доказательства"),
    BotCommand(command="privacy", description="Конфиденциальность"),
]

_bot: Bot | None = None
_dispatcher: Dispatcher | None = None


def build_router_dispatcher() -> Dispatcher:
    dispatcher = Dispatcher()
    dispatcher.include_routers(start_router, emergency_router, guides_router, fallback_router)
    return dispatcher


def get_bot() -> Bot:
    global _bot
    settings = get_settings()
    if not settings.bot_token:
        raise AppError("bot_disabled", "Бот не настроен.", 503)
    if _bot is None:
        _bot = Bot(token=settings.bot_token)
    return _bot


def get_dispatcher() -> Dispatcher:
    global _dispatcher
    if _dispatcher is None:
        _dispatcher = build_router_dispatcher()
    return _dispatcher


async def configure_bot(bot: Bot) -> None:
    settings = get_settings()
    await bot.set_my_commands(COMMANDS)
    await bot.set_my_short_description("Сообщай. Фиксируй. Защищай.")
    await bot.set_my_description(
        "Помогаю зафиксировать информацию о мошенничестве, вербовке и шантаже "
        "и подсказываю, как обратиться в МВД. Это не правоохранительный орган."
    )
    if settings.webapp_url.startswith("https://"):
        await bot.set_chat_menu_button(
            menu_button=MenuButtonWebApp(text="Сообщить", web_app=WebAppInfo(url=settings.webapp_url))
        )
    if settings.webhook_url:
        await bot.set_webhook(
            url=settings.webhook_url,
            secret_token=settings.webhook_secret,
            drop_pending_updates=False,
        )

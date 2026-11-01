from __future__ import annotations

import asyncio

from aiogram import Bot

from app.bot.dispatcher import COMMANDS, build_dispatcher
from app.core.config import assert_runtime_safe, get_settings
from app.core.logging import configure_logging, log_event


async def run() -> None:
    settings = get_settings()
    assert_runtime_safe(settings)
    configure_logging(settings)
    if not settings.bot_token:
        log_event("bot_disabled", reason="missing_token")
        return
    bot = Bot(token=settings.bot_token)
    dispatcher = build_dispatcher(settings)
    try:
        await bot.set_my_commands(COMMANDS)
        if hasattr(bot, "set_my_short_description"):
            await bot.set_my_short_description("Сообщай. Фиксируй. Защищай.")
    except Exception:
        log_event("bot_profile_update_failed", error_type="telegram")
    await bot.delete_webhook(drop_pending_updates=False)
    await dispatcher.start_polling(bot)


def main() -> None:
    asyncio.run(run())


if __name__ == "__main__":
    main()

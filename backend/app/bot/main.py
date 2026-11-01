"""Long polling for local development. Production should use the webhook."""

import asyncio
import logging

from aiogram import Bot

from app.bot.runtime import COMMANDS, build_router_dispatcher, configure_bot
from app.core.config import get_settings
from app.core.logging import setup_logging

logger = logging.getLogger(__name__)


async def run() -> None:
    setup_logging()
    settings = get_settings()
    if not settings.bot_token:
        logger.error("bot_token_missing")
        raise SystemExit(1)
    if settings.webhook_url:
        logger.error("webhook_configured_stop_polling")
        raise SystemExit(1)
    bot = Bot(token=settings.bot_token)
    dispatcher = build_router_dispatcher()
    await bot.delete_webhook(drop_pending_updates=False)
    await configure_bot(bot)
    logger.info("bot_polling_started", extra={"commands": len(COMMANDS)})
    await dispatcher.start_polling(bot)


def main() -> None:
    asyncio.run(run())


if __name__ == "__main__":
    main()

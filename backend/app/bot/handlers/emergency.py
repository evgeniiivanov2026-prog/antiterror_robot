import logging

from aiogram import Router
from aiogram.filters import Command
from aiogram.types import Message

from app.bot.texts import EMERGENCY_TEXT
from app.core.database import get_sessionmaker
from app.services.emergency import register_emergency

logger = logging.getLogger(__name__)
router = Router(name="emergency")


@router.message(Command("emergency"))
async def emergency(message: Message) -> None:
    if message.from_user is not None:
        try:
            async with get_sessionmaker()() as session:
                await register_emergency(session, message.from_user.id, "bot")
        except Exception:
            logger.error("emergency_log_failed")
    await message.answer(EMERGENCY_TEXT)

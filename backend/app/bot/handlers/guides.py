from aiogram import Router
from aiogram.filters import Command
from aiogram.types import Message

from app.bot.texts import EVIDENCE_TEXT, PRIVACY_TEXT

router = Router(name="guides")


@router.message(Command("evidence"))
async def evidence(message: Message) -> None:
    await message.answer(EVIDENCE_TEXT)


@router.message(Command("privacy"))
async def privacy(message: Message) -> None:
    await message.answer(PRIVACY_TEXT)

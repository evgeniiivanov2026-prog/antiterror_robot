from aiogram import Router
from aiogram.filters import Command, CommandStart
from aiogram.types import Message

from app.bot.keyboards import report_keyboard
from app.bot.texts import HTTPS_HINT, REPORT_TEXT, START_TEXT

router = Router(name="start")


@router.message(CommandStart())
async def start(message: Message) -> None:
    await message.answer(_with_hint(START_TEXT), reply_markup=report_keyboard())


@router.message(Command("report"))
async def report(message: Message) -> None:
    await message.answer(_with_hint(REPORT_TEXT), reply_markup=report_keyboard())


def _with_hint(text: str) -> str:
    if report_keyboard() is None:
        return f"{text}\n\n{HTTPS_HINT}"
    return text

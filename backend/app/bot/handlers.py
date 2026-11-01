from __future__ import annotations

from aiogram import Router
from aiogram.filters import Command, CommandStart
from aiogram.types import ErrorEvent, Message

from app.bot.keyboards import report_keyboard
from app.bot.texts import emergency_text, evidence_text, privacy_text, report_text, start_text
from app.core.config import Settings
from app.core.logging import log_event

router = Router()


@router.message(CommandStart())
async def cmd_start(message: Message, settings: Settings) -> None:
    await message.answer(start_text(), reply_markup=report_keyboard(settings))


@router.message(Command("report"))
async def cmd_report(message: Message, settings: Settings) -> None:
    await message.answer(report_text(settings), reply_markup=report_keyboard(settings))


@router.message(Command("emergency"))
async def cmd_emergency(message: Message, settings: Settings) -> None:
    del settings
    await message.answer(emergency_text())


@router.message(Command("evidence"))
async def cmd_evidence(message: Message, settings: Settings) -> None:
    del settings
    await message.answer(evidence_text())


@router.message(Command("privacy"))
async def cmd_privacy(message: Message, settings: Settings) -> None:
    await message.answer(privacy_text(settings))


@router.message()
async def fallback(message: Message, settings: Settings) -> None:
    await message.answer(
        "Я принимаю команды /report, /emergency, /evidence и /privacy.\n\n" + emergency_text(),
        reply_markup=report_keyboard(settings),
    )


@router.error()
async def on_error(event: ErrorEvent) -> None:
    log_event("bot_handler_error", error_type=type(event.exception).__name__)
    message = event.update.message
    if message is not None:
        await message.answer("Не получилось обработать команду. Попробуйте ещё раз или откройте приложение.")

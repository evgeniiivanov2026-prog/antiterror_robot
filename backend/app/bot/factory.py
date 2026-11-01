"""aiogram dispatcher. Handlers stay side-effect free until a message arrives."""

import logging

from aiogram import F, Router
from aiogram.filters import Command, CommandStart
from aiogram.types import CallbackQuery, ErrorEvent, Message
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.bot import texts
from app.bot.keyboards import main_keyboard
from app.core.config import Settings
from app.models.emergency import EmergencyEvent
from app.services.users import upsert_user

logger = logging.getLogger(__name__)


async def _record_emergency(sessionmaker: async_sessionmaker | None, telegram_id: int | None, settings: Settings) -> None:
    if sessionmaker is None or telegram_id is None:
        return
    try:
        async with sessionmaker() as session:
            user = await upsert_user(session, telegram_id, settings)
            session.add(EmergencyEvent(user_id=user.id, source="bot"))
            await session.commit()
    except Exception:
        logger.exception("emergency event was not stored")


def build_dispatcher(settings: Settings, sessionmaker: async_sessionmaker | None):
    from aiogram import Dispatcher

    router = Router()
    keyboard = main_keyboard(settings)

    @router.message(CommandStart())
    async def cmd_start(message: Message) -> None:
        await message.answer(texts.START, reply_markup=keyboard)

    @router.message(Command("report"))
    async def cmd_report(message: Message) -> None:
        if settings.webapp_url.startswith("https://"):
            await message.answer("Откройте форму по кнопке ниже.", reply_markup=keyboard)
            return
        await message.answer(texts.REPORT_WITHOUT_APP, reply_markup=keyboard)

    @router.message(Command("emergency"))
    async def cmd_emergency(message: Message) -> None:
        await _record_emergency(sessionmaker, message.from_user.id if message.from_user else None, settings)
        await message.answer(texts.EMERGENCY, reply_markup=keyboard)

    @router.message(Command("evidence"))
    async def cmd_evidence(message: Message) -> None:
        await message.answer(texts.EVIDENCE)

    @router.message(Command("privacy"))
    async def cmd_privacy(message: Message) -> None:
        await message.answer(texts.PRIVACY)

    @router.callback_query(F.data == "emergency")
    async def cb_emergency(query: CallbackQuery) -> None:
        await _record_emergency(sessionmaker, query.from_user.id if query.from_user else None, settings)
        await query.answer()
        if query.message:
            await query.message.answer(texts.EMERGENCY)

    @router.callback_query(F.data == "evidence")
    async def cb_evidence(query: CallbackQuery) -> None:
        await query.answer()
        if query.message:
            await query.message.answer(texts.EVIDENCE)

    @router.callback_query(F.data == "privacy")
    async def cb_privacy(query: CallbackQuery) -> None:
        await query.answer()
        if query.message:
            await query.message.answer(texts.PRIVACY)

    @router.error()
    async def on_error(event: ErrorEvent) -> None:
        logger.error("bot handler failed", extra={"event": "bot_error", "error_type": type(event.exception).__name__})

    dispatcher = Dispatcher()
    dispatcher.include_router(router)
    return dispatcher

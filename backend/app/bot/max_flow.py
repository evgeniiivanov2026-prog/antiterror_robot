"""Turn a MAX update into one reply. No network calls happen here."""

from dataclasses import dataclass

from sqlalchemy.ext.asyncio import async_sessionmaker

from app.bot import texts
from app.core.config import Settings
from app.models.emergency import EmergencyEvent
from app.services.users import upsert_user


@dataclass(frozen=True)
class MaxReply:
    user_id: int
    text: str
    buttons: list[list[dict[str, str]]] | None = None
    callback_id: str | None = None


def _user_id(update: dict) -> int | None:
    kind = update.get("update_type")
    if kind == "bot_started":
        raw = (update.get("user") or {}).get("user_id")
    elif kind == "message_created":
        raw = ((update.get("message") or {}).get("sender") or {}).get("user_id")
    elif kind == "message_callback":
        raw = ((update.get("callback") or {}).get("user") or {}).get("user_id")
    else:
        return None
    return raw if isinstance(raw, int) else None


def _command(update: dict) -> str:
    kind = update.get("update_type")
    if kind == "bot_started":
        return "/start"
    if kind == "message_callback":
        return str((update.get("callback") or {}).get("payload") or "").strip().lower()
    text = str(((update.get("message") or {}).get("body") or {}).get("text") or "").strip()
    token = text.split()[0].lower() if text else ""
    return token.split("@", 1)[0]


def _open_app(settings: Settings, label: str, payload: str | None = None) -> list[list[dict[str, str]]] | None:
    if not settings.bot_username:
        return None
    button = {"type": "open_app", "text": label, "web_app": settings.bot_username}
    if payload:
        button["payload"] = payload
    return [[button]]


def _callback_id(update: dict) -> str | None:
    if update.get("update_type") != "message_callback":
        return None
    raw = (update.get("callback") or {}).get("callback_id")
    return raw if isinstance(raw, str) and raw else None


async def plan_reply(
    update: dict,
    settings: Settings,
    sessionmaker: async_sessionmaker | None,
) -> MaxReply | None:
    user_id = _user_id(update)
    if user_id is None:
        return None
    command = _command(update)
    callback_id = _callback_id(update)
    if command in {"/start", "/report", "start"}:
        return MaxReply(user_id, texts.START, _open_app(settings, "Сообщить"), callback_id)
    if command in {"/emergency", "emergency"}:
        await _record_emergency(sessionmaker, user_id, settings)
        return MaxReply(user_id, texts.EMERGENCY, None, callback_id)
    if command in {"/evidence", "evidence"}:
        return MaxReply(user_id, texts.EVIDENCE, None, callback_id)
    if command in {"/privacy", "privacy"}:
        return MaxReply(user_id, texts.PRIVACY, None, callback_id)
    if command == "/admin":
        is_admin = user_id in settings.admin_ids
        return MaxReply(
            user_id,
            texts.admin_panel_text(user_id, is_admin, is_admin and bool(settings.bot_username)),
            _open_app(settings, "Открыть панель", "admin") if is_admin else None,
            callback_id,
        )
    return None


async def _record_emergency(
    sessionmaker: async_sessionmaker | None,
    user_id: int,
    settings: Settings,
) -> None:
    if sessionmaker is None:
        return
    async with sessionmaker() as session:
        user = await upsert_user(session, user_id, settings)
        session.add(EmergencyEvent(user_id=user.id, source="bot"))
        await session.commit()

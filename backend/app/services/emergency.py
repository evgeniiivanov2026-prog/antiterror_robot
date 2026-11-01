from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.emergency import EmergencyEvent
from app.schemas.emergency import EmergencyIn, EmergencyOut

_MESSAGE = (
    "Если опасность происходит сейчас, наберите 112 или 102. "
    "Не ждите ответа в приложении и не выполняйте требования."
)


async def record_emergency(
    session: AsyncSession,
    telegram_id: int,
    payload: EmergencyIn,
) -> EmergencyOut:
    event = EmergencyEvent(actor_telegram_id=telegram_id, trigger=payload.trigger)
    session.add(event)
    await session.commit()
    await session.refresh(event)
    return EmergencyOut(id=event.id, trigger=event.trigger, created_at=event.created_at, message=_MESSAGE)

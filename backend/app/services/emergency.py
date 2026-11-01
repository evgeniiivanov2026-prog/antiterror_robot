"""Record that someone opened urgent help. Always return the phone numbers."""

import logging
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.rate_limit import get_limiter
from app.models.emergency import EmergencyEvent

logger = logging.getLogger(__name__)

EMERGENCY_CONTACTS = [
    {
        "label": "Единый номер экстренных служб",
        "phone": "112",
        "note": "Звоните, если опасность прямо сейчас.",
    },
    {
        "label": "Полиция",
        "phone": "102",
        "note": "Если нужно вызвать полицию.",
    },
    {
        "label": "Детский телефон доверия",
        "phone": "88002000122",
        "note": "Бесплатно для детей, подростков и их родителей.",
    },
]

EMERGENCY_NOTICE = (
    "Если угроза жизни или здоровью есть прямо сейчас, звоните 112 или 102. "
    "Не выполняйте требования и не продолжайте разговор с тем, кто давит. "
    "Несовершеннолетнему можно позвонить вместе со взрослым, которому он доверяет."
)


async def register_emergency(session: AsyncSession, telegram_id: int, source: str) -> bool:
    try:
        allowed, _retry = await get_limiter().hit(f"emergency-log:{telegram_id}", 10, 3600)
        if not allowed:
            return False
        session.add(
            EmergencyEvent(
                telegram_id=telegram_id,
                source=source,
                created_at=datetime.now(timezone.utc),
            )
        )
        await session.commit()
        logger.info("emergency_recorded", extra={"source": source})
        return True
    except Exception:
        logger.error("emergency_log_failed")
        await session.rollback()
        return False

"""Accounts are keyed by Telegram id. Names from the client are not stored."""

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.enums import UserRole
from app.models.user import UserAccount


async def upsert_user(session: AsyncSession, telegram_id: int) -> UserAccount:
    settings = get_settings()
    existing = await session.scalar(select(UserAccount).where(UserAccount.telegram_id == telegram_id))
    now = datetime.now(timezone.utc)
    if existing is not None:
        if telegram_id in settings.admin_ids and existing.role != UserRole.ADMIN.value:
            existing.role = UserRole.ADMIN.value
            existing.updated_at = now
            await session.commit()
        return existing
    role = UserRole.ADMIN.value if telegram_id in settings.admin_ids else UserRole.USER.value
    user = UserAccount(telegram_id=telegram_id, role=role, created_at=now, updated_at=now)
    session.add(user)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        existing = await session.scalar(select(UserAccount).where(UserAccount.telegram_id == telegram_id))
        if existing is None:
            raise
        return existing
    return user

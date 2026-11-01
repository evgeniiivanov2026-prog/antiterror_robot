"""Create the local user row from a verified Telegram id and refresh the role."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.models.base import utcnow
from app.models.user import User, UserRole


def role_for(telegram_id: int, settings: Settings) -> UserRole:
    if telegram_id in settings.admin_ids:
        return UserRole.admin
    if telegram_id in settings.moderator_ids:
        return UserRole.moderator
    return UserRole.user


async def upsert_user(session: AsyncSession, telegram_id: int, settings: Settings) -> User:
    result = await session.execute(select(User).where(User.telegram_id == telegram_id))
    user = result.scalar_one_or_none()
    role = role_for(telegram_id, settings)
    if user is None:
        user = User(telegram_id=telegram_id, role=role)
        session.add(user)
        await session.flush()
        return user
    user.role = role
    user.updated_at = utcnow()
    await session.flush()
    return user

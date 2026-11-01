from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import AppError
from app.models.enums import UserRole
from app.models.user import UserAccount
from app.services.audit import write_audit
from app.services.users import upsert_user


async def set_role(session: AsyncSession, actor: UserAccount, telegram_id: int, role: str) -> UserAccount:
    if actor.role != UserRole.ADMIN.value:
        raise AppError("forbidden", "Недостаточно прав.", 403)
    if telegram_id in get_settings().admin_ids and role != UserRole.ADMIN.value:
        raise AppError("forbidden", "Эту роль задаёт конфигурация окружения.", 403)
    if actor.telegram_id == telegram_id and role != UserRole.ADMIN.value:
        raise AppError("forbidden", "Нельзя снять с себя роль администратора.", 403)
    user = await upsert_user(session, telegram_id)
    previous = user.role
    user.role = role
    user.updated_at = datetime.now(timezone.utc)
    await write_audit(
        session,
        actor_telegram_id=actor.telegram_id,
        action="role_changed",
        entity_type="user_account",
        entity_id=str(telegram_id),
        meta={"from": previous, "to": role},
    )
    await session.commit()
    return user

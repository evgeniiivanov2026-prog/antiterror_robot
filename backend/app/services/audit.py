from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import AuditLog


async def write_audit(
    session: AsyncSession,
    *,
    actor_id,
    action: str,
    target_type: str,
    target_id: str | None = None,
    meta: dict | None = None,
) -> None:
    session.add(
        AuditLog(
            actor_user_id=actor_id,
            action=action,
            target_type=target_type,
            target_id=target_id,
            meta=meta,
        )
    )
    await session.flush()

"""Hard-delete cards older than the retention window, including stored files."""

from datetime import timedelta

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.audit import AuditLog
from app.models.base import utcnow
from app.models.emergency import EmergencyEvent
from app.models.incident import IncidentReport
from app.models.user import User
from app.services.audit import write_audit
from app.services.storage import ObjectStorage


async def _drop_files(report: IncidentReport, storage: ObjectStorage) -> None:
    for item in list(report.evidence_files):
        await storage.delete(item.storage_key)


async def delete_report(session: AsyncSession, report: IncidentReport, storage: ObjectStorage) -> None:
    await _drop_files(report, storage)
    await session.execute(delete(AuditLog).where(AuditLog.target_id == str(report.id)))
    await session.delete(report)
    await session.flush()


async def delete_account(session: AsyncSession, user: User, storage: ObjectStorage) -> int:
    result = await session.execute(
        select(IncidentReport)
        .options(selectinload(IncidentReport.evidence_files))
        .where(IncidentReport.owner_id == user.id)
    )
    reports = list(result.scalars().all())
    for report in reports:
        await delete_report(session, report, storage)
    await session.execute(delete(EmergencyEvent).where(EmergencyEvent.user_id == user.id))
    await session.execute(delete(AuditLog).where(AuditLog.actor_user_id == user.id))
    await session.delete(user)
    await session.flush()
    return len(reports)


async def purge_expired(session: AsyncSession, storage: ObjectStorage, retention_days: int) -> int:
    cutoff = utcnow() - timedelta(days=retention_days)
    result = await session.execute(
        select(IncidentReport)
        .options(selectinload(IncidentReport.evidence_files))
        .where(IncidentReport.created_at < cutoff)
    )
    reports = list(result.scalars().all())
    for report in reports:
        public_id = report.public_id
        await delete_report(session, report, storage)
        await write_audit(
            session,
            actor_id=None,
            action="retention.delete",
            target_type="incident_report",
            target_id=public_id,
        )
    return len(reports)

"""Delete personal records after the retention window."""

from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import get_settings
from app.models.emergency import EmergencyEvent
from app.models.incident import IncidentReport
from app.services.storage import get_storage


async def purge_expired(session: AsyncSession, now: datetime | None = None) -> dict[str, int]:
    settings = get_settings()
    moment = now or datetime.now(timezone.utc)
    report_cutoff = moment - timedelta(days=settings.data_retention_days)
    emergency_cutoff = moment - timedelta(days=settings.emergency_retention_days)
    reports = (
        await session.scalars(
            select(IncidentReport)
            .options(selectinload(IncidentReport.evidence_files))
            .where(IncidentReport.created_at < report_cutoff)
        )
    ).all()
    storage = get_storage()
    for report in reports:
        for evidence in report.evidence_files:
            await storage.delete(evidence.storage_key)
        await session.delete(report)
    events = (await session.scalars(select(EmergencyEvent).where(EmergencyEvent.created_at < emergency_cutoff))).all()
    for event in events:
        await session.delete(event)
    await session.commit()
    return {"reports": len(reports), "emergency_events": len(events)}

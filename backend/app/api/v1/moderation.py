"""Abuse-control queue. Statuses here are not a police investigation."""

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_session, require_staff
from app.core.errors import AppError
from app.models.base import utcnow
from app.models.incident import IncidentReport, ReportStatus
from app.models.user import User
from app.schemas.incident import CloseReport, IncidentCard, ModerationReport
from app.services.audit import write_audit
from app.services.incidents import to_card

router = APIRouter(prefix="/moderation", tags=["moderation"])

_REASONS = {
    "under_review": {"completeness", "other"},
    "closed": {"spam", "duplicate", "user_request", "other"},
}


@router.get("/reports", response_model=list[ModerationReport])
async def list_reports(
    user: User = Depends(require_staff),
    session: AsyncSession = Depends(get_session),
) -> list[ModerationReport]:
    await write_audit(session, actor_id=user.id, action="moderation.list", target_type="incident_report")
    result = await session.execute(select(IncidentReport).order_by(IncidentReport.created_at.desc()).limit(50))
    return [
        ModerationReport(
            id=item.id,
            public_id=item.public_id,
            category=item.category,
            threat_level=item.threat_level,
            status=item.status,
            created_at=item.created_at,
        )
        for item in result.scalars().all()
    ]


@router.get("/reports/{report_id}", response_model=IncidentCard)
async def view_report(
    report_id: UUID,
    user: User = Depends(require_staff),
    session: AsyncSession = Depends(get_session),
) -> IncidentCard:
    result = await session.execute(
        select(IncidentReport)
        .options(selectinload(IncidentReport.evidence_files))
        .where(IncidentReport.id == report_id)
    )
    report = result.scalar_one_or_none()
    if report is None:
        raise AppError("not_found", "Карточка не найдена", 404)
    await write_audit(
        session,
        actor_id=user.id,
        action="moderation.view",
        target_type="incident_report",
        target_id=report.public_id,
    )
    # Contact value stays encrypted. Moderators see the consent flag only.
    return to_card(report)


@router.post("/reports/{report_id}/close", response_model=ModerationReport)
async def close_report(
    report_id: UUID,
    payload: CloseReport,
    user: User = Depends(require_staff),
    session: AsyncSession = Depends(get_session),
) -> ModerationReport:
    if payload.reason not in _REASONS[payload.status]:
        raise AppError("validation_error", "Эта причина не подходит к выбранному статусу", 422)
    result = await session.execute(select(IncidentReport).where(IncidentReport.id == report_id))
    report = result.scalar_one_or_none()
    if report is None:
        raise AppError("not_found", "Карточка не найдена", 404)
    report.status = ReportStatus(payload.status)
    report.updated_at = utcnow()
    await write_audit(
        session,
        actor_id=user.id,
        action="moderation.close" if payload.status == "closed" else "moderation.mark_review",
        target_type="incident_report",
        target_id=report.public_id,
        meta={"reason": payload.reason},
    )
    return ModerationReport(
        id=report.id,
        public_id=report.public_id,
        category=report.category,
        threat_level=report.threat_level,
        status=report.status,
        created_at=report.created_at,
    )

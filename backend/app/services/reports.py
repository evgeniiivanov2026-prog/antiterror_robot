"""Create and read incident cards. The service does not contact the police."""

import logging
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.errors import AppError
from app.models.enums import ReportStatus, UserRole
from app.models.incident import IncidentReport
from app.models.user import UserAccount
from app.schemas.report import ReportCreate
from app.services.audit import write_audit
from app.services.catalog import assess_threat
from app.services.crypto import encrypt_text
from app.services.identifiers import generate_public_id
from app.services.storage import get_storage

logger = logging.getLogger(__name__)

_STAFF = {UserRole.MODERATOR.value, UserRole.ADMIN.value}
_STAFF_TRANSITIONS = {
    ReportStatus.NEW.value: {ReportStatus.UNDER_REVIEW.value, ReportStatus.CLOSED.value},
    ReportStatus.UNDER_REVIEW.value: {ReportStatus.CLOSED.value},
    ReportStatus.FORWARDED.value: {ReportStatus.CLOSED.value},
    ReportStatus.CLOSED.value: set(),
}


async def create_report(session: AsyncSession, user: UserAccount, payload: ReportCreate) -> IncidentReport:
    now = datetime.now(timezone.utc)
    suspect = None
    if payload.suspect is not None and not payload.suspect.is_empty():
        suspect = payload.suspect.as_dict()
    note = payload.suspect.note if payload.suspect and payload.suspect.note else ""
    threat = assess_threat(payload.category.value, f"{payload.description}\n{payload.demands.summary}\n{note}")
    encrypted_contact = encrypt_text(payload.contact_value) if payload.contact_value else None
    for _attempt in range(5):
        report = IncidentReport(
            public_id=generate_public_id(),
            owner_telegram_id=user.telegram_id,
            category=payload.category.value,
            description=payload.description,
            occurred_at=payload.occurred_at,
            platform=payload.platform,
            source_url=payload.source_url,
            suspect_identifiers=suspect,
            demands=payload.demands.model_dump(),
            threat_level=threat,
            contact_consent=payload.contact_consent,
            contact_channel=payload.contact_channel.value if payload.contact_channel else None,
            contact_value=encrypted_contact,
            status=ReportStatus.NEW.value,
            created_at=now,
            updated_at=now,
        )
        session.add(report)
        try:
            await session.commit()
        except IntegrityError as exc:
            await session.rollback()
            if "public_id" not in str(exc).lower():
                raise
            continue
        logger.info(
            "report_created",
            extra={"public_id": report.public_id, "category": report.category, "threat_level": report.threat_level},
        )
        return await get_for_viewer_by_public_id(session, report.public_id, user)
    raise AppError("unavailable", "Не удалось сохранить карточку. Попробуйте ещё раз.", 503)


async def get_for_viewer_by_public_id(session: AsyncSession, public_id: str, user: UserAccount) -> IncidentReport:
    report = await _load(session, IncidentReport.public_id == public_id)
    if report is None or not _can_view(report, user):
        raise AppError("not_found", "Карточка не найдена.", 404)
    return report


async def get_for_owner_by_id(session: AsyncSession, report_id: UUID, user: UserAccount) -> IncidentReport:
    report = await _load(session, IncidentReport.id == report_id)
    if report is None or report.owner_telegram_id != user.telegram_id:
        raise AppError("not_found", "Карточка не найдена.", 404)
    return report


async def get_for_viewer_by_id(session: AsyncSession, report_id: UUID, user: UserAccount) -> IncidentReport:
    report = await _load(session, IncidentReport.id == report_id)
    if report is None or not _can_view(report, user):
        raise AppError("not_found", "Карточка не найдена.", 404)
    return report


async def update_status(session: AsyncSession, user: UserAccount, report_id: UUID, new_status: str) -> IncidentReport:
    report = await get_for_viewer_by_id(session, report_id, user)
    _assert_transition(user, report, new_status)
    previous = report.status
    if previous != new_status:
        report.status = new_status
        report.updated_at = datetime.now(timezone.utc)
        await write_audit(
            session,
            actor_telegram_id=user.telegram_id,
            action="status_changed",
            entity_type="incident_report",
            entity_id=report.public_id,
            meta={"from": previous, "to": new_status},
        )
        await session.commit()
        logger.info("report_status_changed", extra={"public_id": report.public_id, "status": new_status})
    return await get_for_viewer_by_id(session, report_id, user)


async def delete_report(session: AsyncSession, user: UserAccount, report_id: UUID) -> None:
    report = await get_for_viewer_by_id(session, report_id, user)
    storage = get_storage()
    for evidence in list(report.evidence_files):
        await storage.delete(evidence.storage_key)
    public_id = report.public_id
    await write_audit(
        session,
        actor_telegram_id=user.telegram_id,
        action="report_deleted",
        entity_type="incident_report",
        entity_id=public_id,
        meta=None,
    )
    await session.delete(report)
    await session.commit()
    logger.info("report_deleted", extra={"public_id": public_id})


async def _load(session: AsyncSession, criterion) -> IncidentReport | None:  # type: ignore[no-untyped-def]
    return await session.scalar(select(IncidentReport).options(selectinload(IncidentReport.evidence_files)).where(criterion))


def _can_view(report: IncidentReport, user: UserAccount) -> bool:
    return report.owner_telegram_id == user.telegram_id or user.role in _STAFF


def _assert_transition(user: UserAccount, report: IncidentReport, new_status: str) -> None:
    current = report.status
    if new_status == current:
        return
    if user.role == UserRole.USER.value:
        if user.telegram_id != report.owner_telegram_id:
            raise AppError("not_found", "Карточка не найдена.", 404)
        if new_status != ReportStatus.FORWARDED.value or current == ReportStatus.CLOSED.value:
            raise AppError("forbidden", "Этот статус может поставить только модератор сервиса.", 403)
        return
    if user.role in _STAFF:
        if new_status not in _STAFF_TRANSITIONS[current]:
            raise AppError("invalid_transition", "Такой статус поставить нельзя.", 409)
        return
    raise AppError("forbidden", "Недостаточно прав.", 403)

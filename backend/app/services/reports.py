from __future__ import annotations

from datetime import datetime, timedelta
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import Settings
from app.core.labels import COMPLIED_NOTICE, SAFETY_NOTICE
from app.core.security import ConfigurationError, decrypt_text, encrypt_text, role_for
from app.core.threats import assess_threat
from app.models.audit import AuditLog
from app.models.incident import IncidentReport
from app.models.user import AppUser
from app.schemas.report import ReportCreate, ReportOut, StatusUpdate
from app.services.errors import DomainError
from app.services.identifiers import new_public_id
from app.services.storage import ObjectStorage

_STAFF = {"moderator", "admin"}
_STATUSES = {"new", "under_review", "forwarded", "closed"}


async def get_or_create_user(session: AsyncSession, telegram_id: int, settings: Settings) -> AppUser:
    found = await session.execute(select(AppUser).where(AppUser.telegram_id == telegram_id))
    user = found.scalar_one_or_none()
    role = role_for(telegram_id, settings)
    if user is None:
        user = AppUser(telegram_id=telegram_id, role=role)
        session.add(user)
        await session.flush()
        return user
    if user.role != role:
        user.role = role
    return user


def _notice(demands: dict | None) -> str:
    if demands and demands.get("user_complied"):
        return f"{SAFETY_NOTICE} {COMPLIED_NOTICE}"
    return SAFETY_NOTICE


def serialize_report(report: IncidentReport, viewer: AppUser, settings: Settings) -> ReportOut:
    contact = None
    if viewer.id == report.owner_id and report.contact_value:
        contact = decrypt_text(report.contact_value, settings.contact_encryption_key)
    evidence = [
        {
            "id": item.id,
            "file_type": item.file_type,
            "mime_type": item.mime_type,
            "size_bytes": item.size_bytes,
            "checksum": item.checksum,
            "uploaded_at": item.uploaded_at,
        }
        for item in report.evidence_files
    ]
    return ReportOut(
        id=report.id,
        public_id=report.public_id,
        category=report.category,
        description=report.description,
        occurred_at=report.occurred_at,
        platform=report.platform,
        source_url=report.source_url,
        suspect_identifiers=report.suspect_identifiers,
        demands=report.demands,
        threat_level=report.threat_level,
        status=report.status,
        contact_consent=report.contact_consent,
        contact_channel=report.contact_channel if viewer.id == report.owner_id else None,
        contact_value=contact,
        created_at=report.created_at,
        updated_at=report.updated_at,
        evidence=evidence,
        emergency_recommended=report.threat_level == "immediate",
        safety_notice=_notice(report.demands),
    )


async def _allocate_public_id(session: AsyncSession) -> str:
    for _ in range(5):
        public_id = new_public_id()
        exists = await session.execute(select(IncidentReport.id).where(IncidentReport.public_id == public_id))
        if exists.scalar_one_or_none() is None:
            return public_id
    raise DomainError("id_collision", "Не удалось сохранить карточку. Попробуйте ещё раз.", 503)


async def create_report(
    session: AsyncSession,
    settings: Settings,
    telegram_id: int,
    payload: ReportCreate,
) -> ReportOut:
    user = await get_or_create_user(session, telegram_id, settings)
    suspect = payload.suspect_identifiers.model_dump() if payload.suspect_identifiers else None
    if suspect and not any(suspect.values()):
        suspect = None
    demands = payload.demands.model_dump()
    combined = " ".join(
        part
        for part in (
            payload.description,
            payload.demands.summary,
            (payload.suspect_identifiers.note if payload.suspect_identifiers else ""),
        )
        if part
    )
    contact_value = None
    if payload.contact_consent and payload.contact_value:
        try:
            contact_value = encrypt_text(payload.contact_value, settings.contact_encryption_key)
        except ConfigurationError as exc:
            raise DomainError(
                "configuration_error",
                "Контакт сейчас нельзя сохранить: сервер не настроен.",
                503,
            ) from exc
    report = IncidentReport(
        public_id=await _allocate_public_id(session),
        owner_id=user.id,
        category=payload.category,
        description=payload.description,
        occurred_at=payload.occurred_at,
        platform=payload.platform,
        source_url=payload.source_url,
        suspect_identifiers=suspect,
        demands=demands,
        threat_level=assess_threat(payload.category, combined, payload.immediate_danger),
        contact_consent=payload.contact_consent,
        contact_channel=payload.contact_channel,
        contact_value=contact_value,
        status="new",
    )
    session.add(report)
    await session.commit()
    stored = await _load(session, report.public_id)
    return serialize_report(stored, user, settings)


async def _load(session: AsyncSession, public_id: str) -> IncidentReport:
    found = await session.execute(
        select(IncidentReport)
        .options(selectinload(IncidentReport.evidence_files))
        .where(IncidentReport.public_id == public_id)
    )
    report = found.scalar_one_or_none()
    if report is None:
        raise DomainError("not_found", "Карточка не найдена.", 404)
    return report


async def _load_by_id(session: AsyncSession, report_id: UUID) -> IncidentReport:
    found = await session.execute(
        select(IncidentReport)
        .options(selectinload(IncidentReport.evidence_files))
        .where(IncidentReport.id == report_id)
    )
    report = found.scalar_one_or_none()
    if report is None:
        raise DomainError("not_found", "Карточка не найдена.", 404)
    return report


def _require_reader(user: AppUser, report: IncidentReport) -> None:
    if user.id != report.owner_id and user.role not in _STAFF:
        raise DomainError("not_found", "Карточка не найдена.", 404)


async def get_report(
    session: AsyncSession,
    settings: Settings,
    telegram_id: int,
    public_id: str,
) -> ReportOut:
    user = await get_or_create_user(session, telegram_id, settings)
    report = await _load(session, public_id)
    _require_reader(user, report)
    await session.commit()
    return serialize_report(report, user, settings)


async def get_owned(
    session: AsyncSession,
    settings: Settings,
    telegram_id: int,
    report_id: UUID,
) -> tuple[AppUser, IncidentReport]:
    user = await get_or_create_user(session, telegram_id, settings)
    report = await _load_by_id(session, report_id)
    if user.id != report.owner_id:
        raise DomainError("not_found", "Карточка не найдена.", 404)
    return user, report


async def update_status(
    session: AsyncSession,
    settings: Settings,
    telegram_id: int,
    public_id: str,
    payload: StatusUpdate,
) -> ReportOut:
    user = await get_or_create_user(session, telegram_id, settings)
    if user.role not in _STAFF:
        raise DomainError("forbidden", "Недостаточно прав.", 403)
    if payload.status not in _STATUSES:
        raise DomainError("validation_error", "Неизвестный статус.", 422)
    report = await _load(session, public_id)
    report.status = payload.status
    session.add(
        AuditLog(
            actor_telegram_id=user.telegram_id,
            action="status_changed",
            target_type="incident_report",
            target_id=report.public_id,
            details={"status": payload.status, "note": payload.note},
        )
    )
    await session.commit()
    stored = await _load(session, public_id)
    return serialize_report(stored, user, settings)


async def delete_report(
    session: AsyncSession,
    settings: Settings,
    storage: ObjectStorage,
    telegram_id: int,
    public_id: str,
) -> None:
    user = await get_or_create_user(session, telegram_id, settings)
    report = await _load(session, public_id)
    if user.id != report.owner_id and user.role != "admin":
        raise DomainError("not_found", "Карточка не найдена.", 404)
    keys = [item.storage_key for item in report.evidence_files]
    owner_id = report.owner_id
    is_owner = user.id == owner_id
    session.add(
        AuditLog(
            actor_telegram_id=user.telegram_id,
            action="report_deleted",
            target_type="incident_report",
            target_id=report.public_id,
            details={"by_admin": not is_owner},
        )
    )
    await session.delete(report)
    await session.flush()
    if is_owner and user.role == "user":
        remaining = await session.execute(select(IncidentReport.id).where(IncidentReport.owner_id == owner_id))
        if remaining.first() is None:
            await session.delete(user)
    await session.commit()
    for key in keys:
        await storage.delete(key)


async def purge_expired(session: AsyncSession, storage: ObjectStorage, retention_days: int) -> int:
    cutoff = datetime.now(tz=report_timezone()) - timedelta(days=retention_days)
    found = await session.execute(
        select(IncidentReport)
        .options(selectinload(IncidentReport.evidence_files))
        .where(IncidentReport.created_at < cutoff)
    )
    reports = list(found.scalars())
    keys: list[str] = []
    owner_ids = set()
    for report in reports:
        keys.extend(item.storage_key for item in report.evidence_files)
        owner_ids.add(report.owner_id)
        await session.delete(report)
    from app.models.emergency import EmergencyEvent

    old_events = await session.execute(select(EmergencyEvent).where(EmergencyEvent.created_at < cutoff))
    for event in old_events.scalars():
        await session.delete(event)
    old_audits = await session.execute(select(AuditLog).where(AuditLog.created_at < cutoff))
    for entry in old_audits.scalars():
        await session.delete(entry)
    await session.flush()
    for owner_id in owner_ids:
        user = await session.get(AppUser, owner_id)
        if user is None or user.role != "user":
            continue
        remaining = await session.execute(select(IncidentReport.id).where(IncidentReport.owner_id == owner_id))
        if remaining.first() is None:
            await session.delete(user)
    await session.commit()
    for key in keys:
        await storage.delete(key)
    return len(reports)


def report_timezone():
    from datetime import timezone

    return timezone.utc

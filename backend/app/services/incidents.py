"""Create and read incident cards owned by the authenticated user."""

import re
import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.copy import DISCLAIMER, MVD_RECOMMENDATION
from app.core.errors import AppError
from app.models.base import utcnow
from app.models.incident import ContactChannel, IncidentReport, ReportStatus
from app.models.user import User
from app.schemas.incident import Demands, EvidenceOut, IncidentCard, ReportCreate, SuspectIdentifiers
from app.services.encryption import ContactCipher, mask_contact
from app.services.safety import assess_threat, urgency_note
from app.services.sanitize import clean_text
from app.services.ssrf import normalize_http_url

_PUBLIC_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
_PHONE_RE = re.compile(r"^\+?[0-9]{10,15}$")
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_TELEGRAM_RE = re.compile(r"^(@?[A-Za-z][A-Za-z0-9_]{4,31}|[0-9]{5,15})$")


def new_public_id() -> str:
    suffix = "".join(secrets.choice(_PUBLIC_ALPHABET) for _ in range(6))
    return f"ATR-{suffix}"


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _validate_when(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    moment = _as_utc(value)
    now = datetime.now(timezone.utc)
    if moment > now + timedelta(days=1):
        raise AppError("validation_error", "Время события не может быть в будущем", 422)
    if moment.year < 2000:
        raise AppError("validation_error", "Укажите более позднее время события", 422)
    return moment


def _clean_suspect(payload: SuspectIdentifiers | None) -> dict | None:
    if payload is None:
        return None
    url = normalize_http_url(payload.url)
    phone = clean_text(payload.phone, max_len=20)
    if phone and not _PHONE_RE.match(phone):
        raise AppError("validation_error", "Телефон укажите цифрами, без лишнего текста", 422)
    data = {
        "platform": clean_text(payload.platform, max_len=80),
        "username": clean_text(payload.username, max_len=64),
        "display_name": clean_text(payload.display_name, max_len=80),
        "url": url,
        "phone": phone,
        "note": clean_text(payload.note, max_len=300, multiline=True),
    }
    if not any(data.values()):
        return None
    return data


def _clean_demands(payload: Demands | None) -> dict | None:
    if payload is None:
        return None
    data = {
        "summary": clean_text(payload.summary, max_len=1000, multiline=True),
        "money_requested": payload.money_requested,
        "meeting_requested": payload.meeting_requested,
        "intimate_material_requested": payload.intimate_material_requested,
        "secrecy_requested": payload.secrecy_requested,
        "other": clean_text(payload.other, max_len=300, multiline=True),
    }
    if not any(value for value in data.values()):
        return None
    return data


def _validate_contact(payload: ReportCreate) -> tuple[ContactChannel | None, str | None]:
    if not payload.contact_consent:
        return None, None
    if payload.contact_channel is None or not payload.contact_value:
        raise AppError("validation_error", "Укажите канал и контакт или отключите обратную связь", 422)
    value = clean_text(payload.contact_value, max_len=254, required=True)
    assert value is not None
    if payload.contact_channel == ContactChannel.phone and not _PHONE_RE.match(value):
        raise AppError("validation_error", "Проверьте номер телефона", 422)
    if payload.contact_channel == ContactChannel.email and not _EMAIL_RE.match(value):
        raise AppError("validation_error", "Проверьте адрес электронной почты", 422)
    if payload.contact_channel == ContactChannel.telegram and not _TELEGRAM_RE.match(value):
        raise AppError("validation_error", "Укажите Telegram-имя или числовой id", 422)
    return payload.contact_channel, value


async def create_report(
    session: AsyncSession,
    user: User,
    payload: ReportCreate,
    cipher: ContactCipher,
) -> IncidentReport:
    description = clean_text(payload.description, max_len=4000, multiline=True, required=True)
    assert description is not None
    platform = clean_text(payload.platform, max_len=80) or ""
    source_url = normalize_http_url(payload.source_url)
    suspect = _clean_suspect(payload.suspect_identifiers)
    demands = _clean_demands(payload.demands)
    channel, contact = _validate_contact(payload)
    encrypted = cipher.encrypt(contact) if contact else None

    public_id = ""
    for _ in range(5):
        candidate_id = new_public_id()
        exists = await session.execute(select(IncidentReport.id).where(IncidentReport.public_id == candidate_id))
        if exists.scalar_one_or_none() is None:
            public_id = candidate_id
            break
    if not public_id:
        raise AppError("internal_error", "Не удалось сохранить карточку. Попробуйте ещё раз", 500)

    report = IncidentReport(
        public_id=public_id,
        owner_id=user.id,
        category=payload.category,
        description=description,
        occurred_at=_validate_when(payload.occurred_at),
        platform=platform,
        source_url=source_url,
        suspect_identifiers=suspect,
        demands=demands,
        threat_level=assess_threat(payload.category, description, payload.demands),
        contact_consent=payload.contact_consent,
        contact_channel=channel,
        contact_value_encrypted=encrypted,
        status=ReportStatus.new,
    )
    session.add(report)
    await session.flush()
    return report


async def get_owned(
    session: AsyncSession,
    user: User,
    *,
    public_id: str | None = None,
    report_id: UUID | None = None,
) -> IncidentReport:
    stmt = (
        select(IncidentReport)
        .options(selectinload(IncidentReport.evidence_files))
        .where(IncidentReport.owner_id == user.id)
    )
    if public_id is not None:
        stmt = stmt.where(IncidentReport.public_id == public_id)
    else:
        stmt = stmt.where(IncidentReport.id == report_id)
    report = (await session.execute(stmt)).scalar_one_or_none()
    if report is None:
        raise AppError("not_found", "Карточка не найдена", 404)
    return report


def to_card(report: IncidentReport, *, contact_value: str | None = None) -> IncidentCard:
    suspect = SuspectIdentifiers.model_validate(report.suspect_identifiers) if report.suspect_identifiers else None
    demands = Demands.model_validate(report.demands) if report.demands else None
    channel = report.contact_channel.value if report.contact_channel else None
    return IncidentCard(
        id=report.id,
        public_id=report.public_id,
        category=report.category,
        description=report.description,
        occurred_at=report.occurred_at,
        platform=report.platform,
        source_url=report.source_url,
        suspect_identifiers=suspect,
        demands=demands,
        threat_level=report.threat_level,
        contact_consent=report.contact_consent,
        contact_channel=report.contact_channel,
        contact_hint=mask_contact(channel, contact_value) if report.contact_consent else None,
        status=report.status,
        created_at=report.created_at,
        updated_at=report.updated_at,
        evidence=[
            EvidenceOut(
                id=item.id,
                file_type=item.file_type.value,
                mime_type=item.mime_type,
                size_bytes=item.size_bytes,
                checksum_prefix=item.checksum[:12],
                uploaded_at=item.uploaded_at,
            )
            for item in report.evidence_files
        ],
        disclaimer=DISCLAIMER,
        mvd_recommendation=MVD_RECOMMENDATION,
        urgency_note=urgency_note(report.threat_level),
    )


def decrypt_contact(report: IncidentReport, cipher: ContactCipher) -> str | None:
    if not report.contact_value_encrypted:
        return None
    return cipher.decrypt(report.contact_value_encrypted)


async def mark_referred(session: AsyncSession, report: IncidentReport) -> None:
    if report.status == ReportStatus.closed:
        raise AppError("conflict", "Закрытую карточку нельзя отметить", 409)
    report.status = ReportStatus.forwarded
    report.updated_at = utcnow()
    await session.flush()

"""Incident card API. Responses never include storage keys or raw encrypted contacts."""

import re
from uuid import UUID

from fastapi import APIRouter, Depends, File, Request, UploadFile
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_session
from app.core.copy import DISCLAIMER, MVD_RECOMMENDATION
from app.core.errors import AppError
from app.models.user import User
from app.schemas.incident import EvidenceOut, IncidentCard, ReportCreate
from app.services.audit import write_audit
from app.services.evidence import read_upload, save_evidence
from app.services.incidents import create_report, decrypt_contact, get_owned, mark_referred, to_card
from app.services.pdf_export import render_incident_pdf
from app.services.retention import delete_account, delete_report

router = APIRouter(tags=["reports"])
_PUBLIC_ID = re.compile(r"^ATR-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$")

_CATEGORY_TITLES = {
    "recruitment": "Вербовка",
    "fraud": "Мошенничество",
    "blackmail": "Шантаж",
    "suspicious_account": "Подозрительный аккаунт или канал",
    "witness": "Свидетель",
    "emergency": "Срочная опасность",
}


def _chat_text(report) -> str:
    description = report.description if len(report.description) <= 700 else f"{report.description[:700]}…"
    lines = [
        f"Карточка {report.public_id}",
        f"Категория: {_CATEGORY_TITLES.get(report.category.value, report.category.value)}",
        f"Платформа: {report.platform or '—'}",
        "",
        description,
        "",
        DISCLAIMER,
        "",
        MVD_RECOMMENDATION,
    ]
    suspect = report.suspect_identifiers or {}
    username = suspect.get("username")
    if username:
        lines.insert(3, f"Публичное имя: {username}")
    return "\n".join(lines)


@router.post("/reports", response_model=IncidentCard, status_code=201)
async def create(
    payload: ReportCreate,
    request: Request,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> IncidentCard:
    settings = request.app.state.settings
    allowed = await request.app.state.limiter.allow(
        f"reports:{user.telegram_id}",
        settings.rate_limit_reports,
        settings.rate_limit_reports_window_seconds,
    )
    if not allowed:
        raise AppError(
            "rate_limited",
            "Слишком много карточек за короткое время. Подождите и попробуйте снова.",
            429,
        )
    created = await create_report(session, user, payload, request.app.state.cipher)
    report = await get_owned(session, user, report_id=created.id)
    return to_card(report, contact_value=decrypt_contact(report, request.app.state.cipher))


@router.get("/reports/{public_id}", response_model=IncidentCard)
async def read_report(
    public_id: str,
    request: Request,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> IncidentCard:
    if not _PUBLIC_ID.match(public_id):
        raise AppError("not_found", "Карточка не найдена", 404)
    report = await get_owned(session, user, public_id=public_id)
    contact = decrypt_contact(report, request.app.state.cipher)
    return to_card(report, contact_value=contact)


@router.post("/reports/{report_id}/evidence", response_model=EvidenceOut, status_code=201)
async def upload_evidence(
    report_id: UUID,
    request: Request,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> EvidenceOut:
    report = await get_owned(session, user, report_id=report_id)
    data = await read_upload(file)
    row = await save_evidence(session, report, data, request.app.state.storage, request.app.state.settings)
    return EvidenceOut(
        id=row.id,
        file_type=row.file_type.value,
        mime_type=row.mime_type,
        size_bytes=row.size_bytes,
        checksum_prefix=row.checksum[:12],
        uploaded_at=row.uploaded_at,
    )


@router.post("/reports/{report_id}/export")
async def export_pdf(
    report_id: UUID,
    request: Request,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> Response:
    report = await get_owned(session, user, report_id=report_id)
    contact = decrypt_contact(report, request.app.state.cipher)
    pdf = render_incident_pdf(report, contact)
    await write_audit(
        session,
        actor_id=user.id,
        action="user.export_pdf",
        target_type="incident_report",
        target_id=report.public_id,
    )
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{report.public_id}.pdf"',
            "Cache-Control": "no-store",
        },
    )


@router.post("/reports/{report_id}/send-to-chat")
async def send_to_chat(
    report_id: UUID,
    request: Request,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict[str, bool]:
    notifier = getattr(request.app.state, "notifier", None)
    if notifier is None:
        raise AppError("bot_unavailable", "Бот сейчас не подключён, поэтому копия в чат недоступна", 503)
    report = await get_owned(session, user, report_id=report_id)
    await notifier.send_message(user.telegram_id, _chat_text(report))
    await write_audit(
        session,
        actor_id=user.id,
        action="user.send_to_chat",
        target_type="incident_report",
        target_id=report.public_id,
    )
    return {"ok": True}


@router.post("/reports/{report_id}/mark-referred", response_model=IncidentCard)
async def referred(
    report_id: UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> IncidentCard:
    report = await get_owned(session, user, report_id=report_id)
    await mark_referred(session, report)
    await write_audit(
        session,
        actor_id=user.id,
        action="user.mark_referred",
        target_type="incident_report",
        target_id=report.public_id,
        meta={"status": "forwarded"},
    )
    return to_card(report)


@router.delete("/reports/{report_id}", status_code=204)
async def remove_report(
    report_id: UUID,
    request: Request,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> Response:
    report = await get_owned(session, user, report_id=report_id)
    public_id = report.public_id
    await delete_report(session, report, request.app.state.storage)
    await write_audit(
        session,
        actor_id=user.id,
        action="user.delete_report",
        target_type="incident_report",
        target_id=public_id,
    )
    return Response(status_code=204)


@router.delete("/me")
async def remove_me(
    request: Request,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict[str, int]:
    deleted = await delete_account(session, user, request.app.state.storage)
    return {"deleted_reports": deleted}

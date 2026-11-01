from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, File, Request, UploadFile
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import enforce_rate_limit, get_identity
from app.core.db import get_session
from app.core.logging import log_event
from app.core.security import TelegramIdentity, actor_hash, decrypt_text
from app.schemas.report import EvidenceOut, ReportCreate, ReportOut, StatusUpdate
from app.services.evidence import add_evidence
from app.services.export import render_pdf
from app.services.notify import send_chat_copy
from app.services.reports import create_report, delete_report, get_owned, get_report, update_status

router = APIRouter()


def _actor(identity: TelegramIdentity, request: Request) -> str:
    return actor_hash(identity.telegram_id, request.app.state.settings.log_hash_salt)


@router.post("/reports", response_model=ReportOut, status_code=201)
async def post_report(
    payload: ReportCreate,
    request: Request,
    identity: TelegramIdentity = Depends(get_identity),
    session: AsyncSession = Depends(get_session),
) -> ReportOut:
    settings = request.app.state.settings
    await enforce_rate_limit(
        request,
        f"report:{identity.telegram_id}",
        settings.rate_limit_reports,
        settings.rate_limit_window_seconds,
    )
    report = await create_report(session, settings, identity.telegram_id, payload)
    log_event(
        "report_created",
        actor=_actor(identity, request),
        public_id=report.public_id,
        category=report.category,
        threat_level=report.threat_level,
    )
    return report


@router.get("/reports/{public_id}", response_model=ReportOut)
async def read_report(
    public_id: str,
    request: Request,
    identity: TelegramIdentity = Depends(get_identity),
    session: AsyncSession = Depends(get_session),
) -> ReportOut:
    settings = request.app.state.settings
    await enforce_rate_limit(
        request,
        f"read:{identity.telegram_id}",
        settings.rate_limit_reads,
        settings.read_window_seconds,
    )
    return await get_report(session, settings, identity.telegram_id, public_id)


@router.post("/reports/{report_id}/evidence", response_model=EvidenceOut, status_code=201)
async def post_evidence(
    report_id: UUID,
    request: Request,
    file: UploadFile = File(...),
    identity: TelegramIdentity = Depends(get_identity),
    session: AsyncSession = Depends(get_session),
) -> EvidenceOut:
    settings = request.app.state.settings
    await enforce_rate_limit(
        request,
        f"evidence:{identity.telegram_id}",
        settings.rate_limit_evidence,
        settings.rate_limit_window_seconds,
    )
    limit = settings.max_video_bytes + 1
    data = await file.read(limit)
    saved = await add_evidence(
        session,
        settings,
        request.app.state.storage,
        identity.telegram_id,
        report_id,
        data,
        file.content_type,
    )
    log_event(
        "evidence_stored",
        actor=_actor(identity, request),
        report_id=str(report_id),
        mime_type=saved.mime_type,
        size_bytes=saved.size_bytes,
    )
    return saved


@router.post("/reports/{report_id}/export")
async def export_report(
    report_id: UUID,
    request: Request,
    identity: TelegramIdentity = Depends(get_identity),
    session: AsyncSession = Depends(get_session),
) -> Response:
    settings = request.app.state.settings
    await enforce_rate_limit(
        request,
        f"export:{identity.telegram_id}",
        settings.rate_limit_reads,
        settings.read_window_seconds,
    )
    _user, report = await get_owned(session, settings, identity.telegram_id, report_id)
    contact = None
    if report.contact_value:
        contact = decrypt_text(report.contact_value, settings.contact_encryption_key)
    pdf = render_pdf(report, contact, settings)
    log_event("report_exported", actor=_actor(identity, request), public_id=report.public_id)
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{report.public_id}.pdf"'},
    )


@router.post("/reports/{report_id}/notify", status_code=202)
async def notify_report(
    report_id: UUID,
    request: Request,
    identity: TelegramIdentity = Depends(get_identity),
    session: AsyncSession = Depends(get_session),
) -> dict:
    settings = request.app.state.settings
    await enforce_rate_limit(
        request,
        f"notify:{identity.telegram_id}",
        settings.rate_limit_reads,
        settings.read_window_seconds,
    )
    _user, report = await get_owned(session, settings, identity.telegram_id, report_id)
    await send_chat_copy(settings, identity.telegram_id, report)
    log_event("report_notified", actor=_actor(identity, request), public_id=report.public_id)
    return {"status": "sent"}


@router.patch("/reports/{public_id}/status", response_model=ReportOut)
async def patch_status(
    public_id: str,
    payload: StatusUpdate,
    request: Request,
    identity: TelegramIdentity = Depends(get_identity),
    session: AsyncSession = Depends(get_session),
) -> ReportOut:
    settings = request.app.state.settings
    await enforce_rate_limit(
        request,
        f"status:{identity.telegram_id}",
        settings.rate_limit_reads,
        settings.read_window_seconds,
    )
    report = await update_status(session, settings, identity.telegram_id, public_id, payload)
    log_event(
        "report_status_changed",
        actor=_actor(identity, request),
        public_id=report.public_id,
        status=report.status,
    )
    return report


@router.delete("/reports/{public_id}", status_code=204)
async def remove_report(
    public_id: str,
    request: Request,
    identity: TelegramIdentity = Depends(get_identity),
    session: AsyncSession = Depends(get_session),
) -> Response:
    settings = request.app.state.settings
    await enforce_rate_limit(
        request,
        f"delete:{identity.telegram_id}",
        settings.rate_limit_reads,
        settings.read_window_seconds,
    )
    await delete_report(
        session,
        settings,
        request.app.state.storage,
        identity.telegram_id,
        public_id,
    )
    log_event("report_deleted", actor=_actor(identity, request), public_id=public_id)
    return Response(status_code=204)

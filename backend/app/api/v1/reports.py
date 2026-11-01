import re
from uuid import UUID

from fastapi import APIRouter, Depends, File, Response, UploadFile
from fastapi.responses import Response as RawResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.config import get_settings
from app.core.database import get_session
from app.core.errors import AppError
from app.core.rate_limit import enforce_rate_limit
from app.models.user import UserAccount
from app.schemas.report import EvidenceResponse, ReportCreate, ReportResponse, StatusUpdate
from app.services.delivery import CopySender, get_copy_sender
from app.services.evidence import add_evidence
from app.services.pdf_export import build_chat_caption, render_report_pdf
from app.services.presentation import to_report_response
from app.services.reports import create_report, delete_report, get_for_owner_by_id, get_for_viewer_by_public_id, update_status

router = APIRouter()
_PUBLIC_ID = re.compile(r"^ATR-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$")
_MAX_UPLOAD = 50 * 1024 * 1024


@router.post("/reports", response_model=ReportResponse, status_code=201)
async def create_incident(
    payload: ReportCreate,
    user: UserAccount = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> ReportResponse:
    settings = get_settings()
    await enforce_rate_limit(f"report:{user.telegram_id}", settings.rate_limit_reports, settings.rate_limit_reports_window)
    report = await create_report(session, user, payload)
    return to_report_response(report)


@router.get("/reports/{public_id}", response_model=ReportResponse)
async def read_incident(
    public_id: str,
    user: UserAccount = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> ReportResponse:
    if not _PUBLIC_ID.fullmatch(public_id):
        raise AppError("not_found", "Карточка не найдена.", 404)
    settings = get_settings()
    await enforce_rate_limit(f"read:{user.telegram_id}", settings.rate_limit_reads, settings.rate_limit_reads_window)
    report = await get_for_viewer_by_public_id(session, public_id, user)
    return to_report_response(report)


@router.post("/reports/{report_id}/evidence", response_model=EvidenceResponse, status_code=201)
async def upload_evidence(
    report_id: UUID,
    file: UploadFile = File(...),
    user: UserAccount = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> EvidenceResponse:
    settings = get_settings()
    await enforce_rate_limit(
        f"evidence:{user.telegram_id}",
        settings.rate_limit_evidence,
        settings.rate_limit_evidence_window,
    )
    payload = await _read_limited(file)
    mime = (file.content_type or "").split(";", 1)[0].strip().lower()
    mime = {"image/jpg": "image/jpeg", "audio/mp3": "audio/mpeg"}.get(mime, mime)
    evidence = await add_evidence(session, user, report_id, file.filename or "file", mime, payload)
    return EvidenceResponse(
        id=evidence.id,
        file_type=evidence.file_type,
        mime_type=evidence.mime_type,
        size_bytes=evidence.size_bytes,
        checksum=evidence.checksum,
        uploaded_at=evidence.uploaded_at,
    )


@router.post("/reports/{report_id}/export")
async def export_pdf(
    report_id: UUID,
    user: UserAccount = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> RawResponse:
    settings = get_settings()
    await enforce_rate_limit(f"export:{user.telegram_id}", settings.rate_limit_reads, settings.rate_limit_reads_window)
    report = await get_for_owner_by_id(session, report_id, user)
    pdf = render_report_pdf(report)
    return RawResponse(
        content=pdf,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{report.public_id}.pdf"',
            "Cache-Control": "no-store",
        },
    )


@router.post("/reports/{report_id}/send-copy", status_code=204)
async def send_copy(
    report_id: UUID,
    user: UserAccount = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
    sender: CopySender = Depends(get_copy_sender),
) -> Response:
    settings = get_settings()
    await enforce_rate_limit(f"copy:{user.telegram_id}", settings.rate_limit_reads, settings.rate_limit_reads_window)
    report = await get_for_owner_by_id(session, report_id, user)
    pdf = render_report_pdf(report)
    await sender.send_pdf(user.telegram_id, f"{report.public_id}.pdf", pdf, build_chat_caption(report))
    return Response(status_code=204)


@router.patch("/reports/{report_id}/status", response_model=ReportResponse)
async def patch_status(
    report_id: UUID,
    payload: StatusUpdate,
    user: UserAccount = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> ReportResponse:
    report = await update_status(session, user, report_id, payload.status.value)
    return to_report_response(report)


@router.delete("/reports/{report_id}", status_code=204)
async def remove_report(
    report_id: UUID,
    user: UserAccount = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> Response:
    await delete_report(session, user, report_id)
    return Response(status_code=204)


async def _read_limited(upload: UploadFile) -> bytes:
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = await upload.read(1024 * 1024)
        if not chunk:
            break
        total += len(chunk)
        if total > _MAX_UPLOAD:
            raise AppError("file_too_large", "Файл больше допустимого размера.", 422)
        chunks.append(chunk)
    return b"".join(chunks)

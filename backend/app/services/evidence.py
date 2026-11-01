"""Attach a checked file to the owner's incident card."""

import hashlib
import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError
from app.models.enums import ReportStatus
from app.models.evidence import EvidenceFile
from app.models.user import UserAccount
from app.services.content_scan import scan_upload
from app.services.reports import get_for_owner_by_id
from app.services.storage import get_storage

logger = logging.getLogger(__name__)

MAX_FILES = 5
_EXTENSIONS = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "application/pdf": "pdf",
    "audio/ogg": "ogg",
    "audio/mpeg": "mp3",
    "video/mp4": "mp4",
    "video/webm": "webm",
}


async def add_evidence(
    session: AsyncSession,
    user: UserAccount,
    report_id: uuid.UUID,
    filename: str,
    declared_mime: str,
    data: bytes,
) -> EvidenceFile:
    report = await get_for_owner_by_id(session, report_id, user)
    if report.status == ReportStatus.CLOSED.value:
        raise AppError("closed", "Карточка закрыта, файл добавить нельзя.", 409)
    if len(report.evidence_files) >= MAX_FILES:
        raise AppError("too_many_files", "К одной карточке можно приложить не больше 5 файлов.", 422)
    file_type, mime = scan_upload(data, declared_mime, filename)
    checksum = hashlib.sha256(data).hexdigest()
    if any(item.checksum == checksum for item in report.evidence_files):
        raise AppError("duplicate_file", "Такой файл уже приложен.", 409)
    key = f"{uuid.uuid4().hex}.{_EXTENSIONS[mime]}"
    storage = get_storage()
    await storage.save(key, data, mime)
    evidence = EvidenceFile(
        incident_report_id=report.id,
        file_type=file_type,
        storage_key=key,
        mime_type=mime,
        size_bytes=len(data),
        checksum=checksum,
        uploaded_at=datetime.now(timezone.utc),
    )
    session.add(evidence)
    report.updated_at = datetime.now(timezone.utc)
    try:
        await session.commit()
    except Exception:
        await session.rollback()
        await storage.delete(key)
        raise
    await session.refresh(evidence)
    logger.info("evidence_stored", extra={"public_id": report.public_id, "file_type": file_type, "size_bytes": len(data)})
    return evidence

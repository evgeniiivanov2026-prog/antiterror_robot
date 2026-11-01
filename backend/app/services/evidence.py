from __future__ import annotations

import hashlib
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.models.evidence import EvidenceFile
from app.schemas.report import EvidenceOut
from app.services.errors import DomainError
from app.services.reports import get_owned
from app.services.scanner import FileRejected, inspect_bytes, scan_clamav
from app.services.storage import ObjectStorage


async def add_evidence(
    session: AsyncSession,
    settings: Settings,
    storage: ObjectStorage,
    telegram_id: int,
    report_id: uuid.UUID,
    data: bytes,
    declared_type: str | None,
) -> EvidenceOut:
    _user, report = await get_owned(session, settings, telegram_id, report_id)
    if report.status not in {"new", "under_review"}:
        raise DomainError("locked", "К этой карточке уже нельзя добавить файл.", 409)
    if len(report.evidence_files) >= 8:
        raise DomainError("too_many_files", "Можно приложить не больше 8 файлов.", 400)
    try:
        mime, file_type = inspect_bytes(data, declared_type, settings)
        await scan_clamav(data, settings)
    except FileRejected as exc:
        raise DomainError(_file_code(exc.code), _file_message(exc.code), 400) from exc
    key = f"evidence/{report.id}/{uuid.uuid4()}"
    await storage.put(key, data, mime)
    evidence = EvidenceFile(
        incident_report_id=report.id,
        file_type=file_type,
        storage_key=key,
        mime_type=mime,
        size_bytes=len(data),
        checksum=hashlib.sha256(data).hexdigest(),
    )
    session.add(evidence)
    try:
        await session.commit()
    except Exception:
        await storage.delete(key)
        raise
    await session.refresh(evidence)
    return EvidenceOut(
        id=evidence.id,
        file_type=evidence.file_type,
        mime_type=evidence.mime_type,
        size_bytes=evidence.size_bytes,
        checksum=evidence.checksum,
        uploaded_at=evidence.uploaded_at,
    )


def _file_code(code: str) -> str:
    if code == "too_large":
        return "file_too_large"
    if code == "malware":
        return "file_rejected"
    if code == "scanner_unavailable":
        return "scanner_unavailable"
    return "file_rejected"


def _file_message(code: str) -> str:
    if code == "too_large":
        return "Файл больше допустимого размера."
    if code == "malware":
        return "Файл не прошёл проверку и не сохранён."
    if code == "scanner_unavailable":
        return "Проверка файла сейчас недоступна. Попробуйте позже."
    if code == "empty":
        return "Файл пустой."
    return (
        "Этот файл нельзя сохранить. Подойдут фото, видео, аудио, PDF или текст. "
        "Не загружайте программы, архивы и интимные материалы."
    )

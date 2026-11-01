"""Accept a file only after type, size, and content checks."""

import hashlib
import uuid

from fastapi import UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.errors import AppError
from app.models.evidence import EvidenceFile
from app.models.incident import IncidentReport
from app.services.malware import assert_safe, scan_clamav, sniff
from app.services.storage import ObjectStorage

_CHUNK = 1024 * 1024
_ABSOLUTE_MAX = 50 * 1024 * 1024


async def read_upload(upload: UploadFile) -> bytes:
    chunks: list[bytes] = []
    total = 0
    while True:
        piece = await upload.read(_CHUNK)
        if not piece:
            break
        total += len(piece)
        if total > _ABSOLUTE_MAX:
            raise AppError("file_too_large", "Файл больше допустимого размера", 413)
        chunks.append(piece)
    data = b"".join(chunks)
    if not data:
        raise AppError("validation_error", "Файл пустой", 422)
    return data


async def save_evidence(
    session: AsyncSession,
    report: IncidentReport,
    data: bytes,
    storage: ObjectStorage,
    settings: Settings,
) -> EvidenceFile:
    if len(report.evidence_files) >= settings.max_files_per_report:
        raise AppError("file_limit", "К одной карточке можно приложить не больше 8 файлов", 422)
    sniffed = sniff(data)
    if sniffed is None:
        raise AppError(
            "file_rejected",
            "Поддерживаются изображения, PDF, аудио и видео. Архивы и программы не принимаются.",
            415,
        )
    assert_safe(data, sniffed)
    if settings.clamav_host:
        await scan_clamav(data, settings.clamav_host, settings.clamav_port)
    file_type, mime = sniffed
    checksum = hashlib.sha256(data).hexdigest()
    key = f"evidence/{report.id}/{uuid.uuid4()}"
    await storage.put(key, data, mime)
    row = EvidenceFile(
        incident_report_id=report.id,
        file_type=file_type,
        storage_key=key,
        mime_type=mime,
        size_bytes=len(data),
        checksum=checksum,
    )
    session.add(row)
    await session.flush()
    report.evidence_files.append(row)
    return row

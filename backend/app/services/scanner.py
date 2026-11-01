from __future__ import annotations

import asyncio
import struct

from app.core.config import Settings

ALLOWED_TYPES = {
    "image/jpeg": "image",
    "image/png": "image",
    "image/webp": "image",
    "video/mp4": "video",
    "video/webm": "video",
    "audio/mpeg": "audio",
    "audio/ogg": "audio",
    "audio/wav": "audio",
    "application/pdf": "document",
    "text/plain": "document",
}

_ACTIVE = (b"<script", b"<?php", b"<html", b"<svg", b"javascript:", b"<iframe")


class FileRejected(Exception):
    def __init__(self, code: str) -> None:
        self.code = code
        super().__init__(code)


def sniff(data: bytes) -> str | None:
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if len(data) >= 12 and data.startswith(b"RIFF") and data[8:12] == b"WEBP":
        return "image/webp"
    if data.startswith(b"%PDF-"):
        return "application/pdf"
    if len(data) >= 12 and data[4:8] == b"ftyp":
        return "video/mp4"
    if data.startswith(b"\x1a\x45\xdf\xa3"):
        return "video/webm"
    if data.startswith(b"OggS"):
        return "audio/ogg"
    if len(data) >= 12 and data.startswith(b"RIFF") and data[8:12] == b"WAVE":
        return "audio/wav"
    if data.startswith(b"ID3"):
        return "audio/mpeg"
    if _is_plain_text(data):
        return "text/plain"
    return None


def _is_plain_text(data: bytes) -> bool:
    if not data or data.startswith((b"MZ", b"\x7fELF", b"PK\x03\x04", b"Rar!")):
        return False
    if b"\x00" in data:
        return False
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError:
        return False
    lowered = text.lower()
    if any(token.decode() in lowered for token in _ACTIVE):
        return False
    printable = sum(char.isprintable() or char in "\n\t" for char in text)
    return printable / max(len(text), 1) > 0.9


def limits_for(settings: Settings) -> dict[str, int]:
    return {
        "image": settings.max_image_bytes,
        "video": settings.max_video_bytes,
        "audio": settings.max_audio_bytes,
        "document": settings.max_document_bytes,
    }


def inspect_bytes(data: bytes, declared: str | None, settings: Settings) -> tuple[str, str]:
    if not data:
        raise FileRejected("empty")
    if data.startswith((b"MZ", b"\x7fELF", b"PK\x03\x04")):
        raise FileRejected("forbidden_type")
    sniffed = sniff(data)
    if sniffed is None or sniffed not in ALLOWED_TYPES:
        raise FileRejected("forbidden_type")
    normalized = (declared or "").split(";", 1)[0].strip().lower()
    if normalized in {"", "application/octet-stream"}:
        normalized = sniffed
    if normalized != sniffed:
        raise FileRejected("type_mismatch")
    file_type = ALLOWED_TYPES[sniffed]
    if len(data) > limits_for(settings)[file_type]:
        raise FileRejected("too_large")
    return sniffed, file_type


def interpret_clam_response(raw: bytes) -> None:
    text = raw.decode("utf-8", errors="replace")
    if "FOUND" in text:
        raise FileRejected("malware")
    if "OK" not in text:
        raise FileRejected("scanner_unavailable")


async def scan_clamav(data: bytes, settings: Settings) -> None:
    if not settings.clamav_host:
        return
    try:
        reader, writer = await asyncio.wait_for(
            asyncio.open_connection(settings.clamav_host, settings.clamav_port),
            timeout=5,
        )
    except (TimeoutError, OSError) as exc:
        raise FileRejected("scanner_unavailable") from exc
    try:
        writer.write(b"nINSTREAM\n")
        view = memoryview(data)
        chunk_size = 8192
        for offset in range(0, len(view), chunk_size):
            chunk = view[offset : offset + chunk_size]
            writer.write(struct.pack(">I", len(chunk)))
            writer.write(chunk)
        writer.write(struct.pack(">I", 0))
        await writer.drain()
        response = await asyncio.wait_for(reader.read(4096), timeout=30)
        interpret_clam_response(response)
    except FileRejected:
        raise
    except (TimeoutError, OSError) as exc:
        raise FileRejected("scanner_unavailable") from exc
    finally:
        writer.close()
        try:
            await writer.wait_closed()
        except Exception:
            pass

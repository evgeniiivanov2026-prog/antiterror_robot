"""Policy scan for uploads. This is not a claim that a file is harmless."""

import socket

from app.core.config import get_settings
from app.core.errors import AppError

MAX_BYTES = {
    "image": 10 * 1024 * 1024,
    "audio": 20 * 1024 * 1024,
    "video": 50 * 1024 * 1024,
    "document": 10 * 1024 * 1024,
}

_PDF_DENY = (b"/JavaScript", b"/JS", b"/Launch", b"/EmbeddedFile", b"/OpenAction")


def scan_upload(data: bytes, declared_mime: str, filename: str) -> tuple[str, str]:
    """Return (file_type, sniffed_mime)."""
    _reject_filename(filename)
    if not data:
        raise AppError("empty_file", "Файл пустой.", 422)
    sniffed = sniff_mime(data)
    if sniffed is None or sniffed != declared_mime:
        raise AppError(
            "unsupported_file",
            "Принимаются только JPEG, PNG, WEBP, PDF, MP3, OGG, MP4 и WEBM.",
            422,
        )
    file_type = _file_type(sniffed)
    if len(data) > MAX_BYTES[file_type]:
        raise AppError("file_too_large", "Файл больше допустимого размера.", 422)
    _reject_active_content(data, sniffed)
    settings = get_settings()
    if settings.clamav_host:
        _clamav_instream(data, settings.clamav_host, settings.clamav_port)
    return file_type, sniffed


def sniff_mime(data: bytes) -> str | None:
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith(b"RIFF") and len(data) >= 12 and data[8:12] == b"WEBP":
        return "image/webp"
    if data.startswith(b"%PDF"):
        return "application/pdf"
    if data.startswith(b"OggS"):
        return "audio/ogg"
    if data.startswith(b"ID3") or (len(data) > 2 and data[0] == 0xFF and data[1] & 0xE0 == 0xE0):
        return "audio/mpeg"
    if len(data) > 12 and data[4:8] == b"ftyp":
        return "video/mp4"
    if data.startswith(b"\x1a\x45\xdf\xa3"):
        return "video/webm"
    return None


def _file_type(mime: str) -> str:
    if mime.startswith("image/"):
        return "image"
    if mime.startswith("audio/"):
        return "audio"
    if mime.startswith("video/"):
        return "video"
    return "document"


def _reject_filename(filename: str) -> None:
    lowered = filename.lower().rsplit("/", 1)[-1].rsplit("\\", 1)[-1]
    parts = [part for part in lowered.split(".") if part]
    if len(parts) >= 3:
        raise AppError("unsupported_file", "Имя файла выглядит подозрительно. Переименуйте его и попробуйте снова.", 422)
    dangerous = {"exe", "js", "html", "htm", "svg", "bat", "cmd", "sh", "php", "dll", "apk"}
    if any(part in dangerous for part in parts[1:]):
        raise AppError("unsupported_file", "Такой тип файла сохранить нельзя.", 422)


def _reject_active_content(data: bytes, mime: str) -> None:
    if data.startswith(b"MZ") or data.startswith(b"\x7fELF") or data.startswith(b"#!"):
        raise AppError("unsupported_file", "Такой тип файла сохранить нельзя.", 422)
    sample = data[:4096].lower()
    if b"<script" in sample or b"<?php" in sample or sample.lstrip().startswith(b"<html"):
        raise AppError("unsupported_file", "Такой тип файла сохранить нельзя.", 422)
    if mime == "application/pdf" and any(token.lower() in data.lower() for token in _PDF_DENY):
        raise AppError("unsupported_file", "Этот PDF содержит активное содержимое и не сохранён.", 422)


def _clamav_instream(data: bytes, host: str, port: int) -> None:
    try:
        with socket.create_connection((host, port), timeout=5) as sock:
            sock.sendall(b"zINSTREAM\0")
            view = memoryview(data)
            chunk_size = 64 * 1024
            for offset in range(0, len(data), chunk_size):
                chunk = view[offset : offset + chunk_size]
                sock.sendall(len(chunk).to_bytes(4, "big") + chunk.tobytes())
            sock.sendall((0).to_bytes(4, "big"))
            response = b""
            while len(response) < 1024:
                part = sock.recv(4096)
                if not part:
                    break
                response += part
                if b"\0" in response:
                    break
    except OSError as exc:
        raise AppError("scan_unavailable", "Проверка файла недоступна. Попробуйте позже.", 503) from exc
    text = response.decode("utf-8", "replace").strip("\0").strip()
    if text.endswith("OK"):
        return
    if "FOUND" in text:
        raise AppError("infected_file", "Файл не прошёл проверку и не сохранён.", 422)
    raise AppError("scan_unavailable", "Проверка файла недоступна. Попробуйте позже.", 503)

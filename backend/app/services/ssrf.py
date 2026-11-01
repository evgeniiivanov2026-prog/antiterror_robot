"""Reject links that would point at local or metadata hosts if a fetcher is added later."""

import ipaddress
from urllib.parse import urlparse

from app.core.errors import AppError

_BLOCKED_HOSTS = {"localhost", "metadata.google.internal", "metadata.internal"}
_BLOCKED_SUFFIXES = (".local", ".localhost", ".internal", ".localdomain")


def normalize_http_url(value: str | None) -> str | None:
    if value is None:
        return None
    raw = value.strip()
    if not raw:
        return None
    if any(char.isspace() for char in raw) or raw.startswith("@") or raw.startswith("//"):
        raise AppError("validation_error", "Ссылка выглядит некорректно", 422)
    if "://" not in raw:
        if ":" in raw:
            raise AppError("validation_error", "Разрешены только ссылки http и https", 422)
        raw = f"https://{raw}"
    return _validate(raw)


def _validate(url: str) -> str:
    if len(url) > 500:
        raise AppError("validation_error", "Ссылка слишком длинная", 422)
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        raise AppError("validation_error", "Разрешены только ссылки http и https", 422)
    if parsed.username or parsed.password:
        raise AppError("validation_error", "Ссылка не должна содержать логин или пароль", 422)
    host = (parsed.hostname or "").lower().rstrip(".")
    if not host or host in _BLOCKED_HOSTS or host.endswith(_BLOCKED_SUFFIXES) or host.isdigit():
        raise AppError("validation_error", "Эта ссылка не может быть сохранена", 422)
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        return url
    if not address.is_global:
        raise AppError("validation_error", "Эта ссылка не может быть сохранена", 422)
    return url

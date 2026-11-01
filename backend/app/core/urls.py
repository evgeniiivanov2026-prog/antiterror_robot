from __future__ import annotations

import ipaddress
from urllib.parse import urlparse

_BLOCKED_HOSTS = {
    "localhost",
    "localhost.localdomain",
    "metadata.google.internal",
    "metadata.google.com",
}


def validate_public_url(value: str) -> str:
    """Accept a public http(s) URL. The server never requests it."""
    raw = value.strip()
    if len(raw) > 500:
        raise ValueError("Ссылка слишком длинная")
    parsed = urlparse(raw)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("Укажите ссылку http или https")
    if parsed.username or parsed.password:
        raise ValueError("Уберите логин и пароль из ссылки")
    host = (parsed.hostname or "").lower().rstrip(".")
    if not host:
        raise ValueError("В ссылке нет адреса")
    if host in _BLOCKED_HOSTS or host.endswith((".local", ".internal", ".localhost")):
        raise ValueError("Такая ссылка не сохраняется")
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        address = None
    if address is not None and (
        address.is_private
        or address.is_loopback
        or address.is_link_local
        or address.is_reserved
        or address.is_multicast
        or address.is_unspecified
    ):
        raise ValueError("Такая ссылка не сохраняется")
    return raw

"""Accept only public http(s) links. The server never fetches them."""

import ipaddress
from urllib.parse import urlsplit, urlunsplit

_BLOCKED_HOSTS = {
    "localhost",
    "localhost.localdomain",
    "metadata.google.internal",
    "metadata.google",
    "instance-data",
}
_BLOCKED_SUFFIXES = (".local", ".localhost", ".internal", ".localdomain")
_BAD_URL = "Эта ссылка не подходит. Укажите публичный адрес страницы."


def validate_public_http_url(value: str | None) -> str | None:
    if value is None:
        return None
    candidate = value.strip()
    if not candidate:
        return None
    if len(candidate) > 500:
        raise ValueError("Ссылка слишком длинная.")
    parsed = urlsplit(candidate)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("Укажите ссылку, которая начинается с http:// или https://.")
    if parsed.username or parsed.password:
        raise ValueError("Уберите логин и пароль из ссылки.")
    try:
        port = parsed.port
    except ValueError as exc:
        raise ValueError("Ссылка содержит некорректный порт.") from exc
    if port is not None and not (1 <= port <= 65535):
        raise ValueError("Ссылка содержит некорректный порт.")
    host = (parsed.hostname or "").lower().rstrip(".")
    if not host or host in _BLOCKED_HOSTS or host.endswith(_BLOCKED_SUFFIXES):
        raise ValueError(_BAD_URL)
    if host.replace(".", "").isdigit() and not _is_public_ip(host):
        raise ValueError(_BAD_URL)
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        cleaned = urlunsplit((parsed.scheme, parsed.netloc, parsed.path, parsed.query, ""))
        return cleaned
    if not _is_public_ip(str(ip)):
        raise ValueError(_BAD_URL)
    return urlunsplit((parsed.scheme, parsed.netloc, parsed.path, parsed.query, ""))


def _is_public_ip(value: str) -> bool:
    try:
        ip = ipaddress.ip_address(value)
    except ValueError:
        return False
    return bool(ip.is_global)

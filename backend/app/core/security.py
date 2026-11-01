from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from dataclasses import dataclass
from urllib.parse import parse_qsl

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import Settings


class AuthError(Exception):
    pass


class ConfigurationError(Exception):
    pass


@dataclass(frozen=True)
class TelegramIdentity:
    telegram_id: int
    auth_date: int


def actor_hash(telegram_id: int, salt: str) -> str:
    digest = hashlib.sha256(f"{salt}:{telegram_id}".encode()).hexdigest()
    return digest[:16]


def _fernet(secret: str) -> Fernet:
    if len(secret) < 16:
        raise ConfigurationError("CONTACT_ENCRYPTION_KEY is not configured")
    key = base64.urlsafe_b64encode(hashlib.sha256(secret.encode()).digest())
    return Fernet(key)


def encrypt_text(value: str, secret: str) -> str:
    return _fernet(secret).encrypt(value.encode()).decode()


def decrypt_text(value: str, secret: str) -> str:
    try:
        return _fernet(secret).decrypt(value.encode()).decode()
    except InvalidToken as exc:
        raise ConfigurationError("stored contact could not be decrypted") from exc


def parse_init_data(
    init_data: str,
    bot_token: str,
    max_age_seconds: int,
    now: int | None = None,
) -> TelegramIdentity:
    if not init_data or not bot_token or len(init_data) > 4096:
        raise AuthError("invalid init data")
    try:
        pairs = parse_qsl(init_data, strict_parsing=True, keep_blank_values=True)
    except ValueError as exc:
        raise AuthError("invalid init data") from exc
    data = dict(pairs)
    received = data.pop("hash", None)
    if not received or len(received) != 64:
        raise AuthError("invalid init data")
    check = "\n".join(f"{key}={value}" for key, value in sorted(data.items()))
    secret = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
    calculated = hmac.new(secret, check.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(calculated, received):
        raise AuthError("invalid init data")
    try:
        auth_date = int(data.get("auth_date", "0"))
        user = json.loads(data["user"])
        telegram_id = int(user["id"])
    except (KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
        raise AuthError("invalid init data") from exc
    if telegram_id <= 0:
        raise AuthError("invalid init data")
    current = int(time.time()) if now is None else now
    if auth_date > current + 60 or current - auth_date > max_age_seconds:
        raise AuthError("expired init data")
    return TelegramIdentity(telegram_id=telegram_id, auth_date=auth_date)


def role_for(telegram_id: int, settings: Settings) -> str:
    if telegram_id in settings.admins:
        return "admin"
    if telegram_id in settings.moderators:
        return "moderator"
    return "user"


def sign_init_data(telegram_id: int, bot_token: str, auth_date: int | None = None) -> str:
    """Test helper that builds a valid Authorization value."""
    from urllib.parse import urlencode

    stamp = int(time.time()) if auth_date is None else auth_date
    user = json.dumps({"id": telegram_id}, separators=(",", ":"))
    fields = {"auth_date": str(stamp), "query_id": "test-query", "user": user}
    check = "\n".join(f"{key}={value}" for key, value in sorted(fields.items()))
    secret = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
    digest = hmac.new(secret, check.encode(), hashlib.sha256).hexdigest()
    return "tma " + urlencode({**fields, "hash": digest})

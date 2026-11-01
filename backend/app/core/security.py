"""Telegram initData checks and transport guards."""

import hashlib
import hmac
import json
import time
from urllib.parse import parse_qsl

from app.core.errors import AppError

_MAX_INIT_DATA_LENGTH = 8192


def request_is_secure(environment: str, path: str, forwarded_proto: str) -> bool:
    if environment != "production":
        return True
    if path == "/api/v1/health":
        return True
    return forwarded_proto == "https"


def validate_init_data(init_data: str, bot_token: str, max_age_seconds: int) -> dict:
    if not bot_token or not init_data or len(init_data) > _MAX_INIT_DATA_LENGTH:
        raise _unauthorized("Не удалось подтвердить Telegram-сессию.")
    try:
        parsed = dict(parse_qsl(init_data, strict_parsing=True, keep_blank_values=True))
    except ValueError as exc:
        raise _unauthorized("Не удалось подтвердить Telegram-сессию.") from exc
    received_hash = parsed.pop("hash", "")
    if len(received_hash) != 64:
        raise _unauthorized("Не удалось подтвердить Telegram-сессию.")
    data_check = "\n".join(f"{key}={value}" for key, value in sorted(parsed.items()))
    secret = hmac.new(b"WebAppData", bot_token.encode("utf-8"), hashlib.sha256).digest()
    calculated = hmac.new(secret, data_check.encode("utf-8"), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(calculated, received_hash):
        raise _unauthorized("Не удалось подтвердить Telegram-сессию.")
    try:
        auth_date = int(parsed.get("auth_date", "0"))
    except ValueError as exc:
        raise _unauthorized("Сессия Telegram устарела. Откройте мини-приложение заново.") from exc
    now = int(time.time())
    if auth_date > now + 30 or now - auth_date > max_age_seconds:
        raise _unauthorized("Сессия Telegram устарела. Откройте мини-приложение заново.")
    try:
        user = json.loads(parsed.get("user", ""))
    except json.JSONDecodeError as exc:
        raise _unauthorized("Не удалось подтвердить Telegram-сессию.") from exc
    user_id = user.get("id") if isinstance(user, dict) else None
    if not isinstance(user_id, int) or user_id <= 0:
        raise _unauthorized("Не удалось подтвердить Telegram-сессию.")
    return user


def webhook_secret_matches(provided: str, expected: str) -> bool:
    if not expected or not provided:
        return False
    return hmac.compare_digest(provided, expected)


def _unauthorized(message: str) -> AppError:
    return AppError("unauthorized", message, 401)

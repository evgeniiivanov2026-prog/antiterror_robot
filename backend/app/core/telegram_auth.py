"""Validate Telegram Mini App initData on the server."""

import hashlib
import hmac
import json
import time
from typing import Any
from urllib.parse import parse_qsl

from app.core.errors import AppError


def validate_init_data(init_data: str, bot_token: str, max_age_seconds: int) -> dict[str, Any]:
    if not init_data or not bot_token:
        raise AppError("unauthorized", "Нужна авторизация Telegram", 401)

    pairs = dict(parse_qsl(init_data, keep_blank_values=True, strict_parsing=False))
    received_hash = pairs.pop("hash", "")
    if not received_hash:
        raise AppError("unauthorized", "Нужна авторизация Telegram", 401)

    data_check_string = "\n".join(f"{key}={value}" for key, value in sorted(pairs.items()))
    secret = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
    calculated = hmac.new(secret, data_check_string.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(calculated, received_hash):
        raise AppError("unauthorized", "Не удалось подтвердить данные Telegram", 401)

    try:
        auth_date = int(pairs.get("auth_date", "0"))
    except ValueError as exc:
        raise AppError("unauthorized", "Не удалось подтвердить данные Telegram", 401) from exc
    if auth_date <= 0 or time.time() - auth_date > max_age_seconds:
        raise AppError("unauthorized", "Сессия Telegram устарела. Откройте мини-приложение снова", 401)

    raw_user = pairs.get("user")
    if not raw_user:
        raise AppError("unauthorized", "Нужна авторизация Telegram", 401)
    try:
        user = json.loads(raw_user)
    except json.JSONDecodeError as exc:
        raise AppError("unauthorized", "Нужна авторизация Telegram", 401) from exc
    telegram_id = user.get("id")
    if not isinstance(telegram_id, int):
        raise AppError("unauthorized", "Нужна авторизация Telegram", 401)
    # Only the numeric id is trusted. Name and username from initData are ignored.
    return {"telegram_id": telegram_id, "auth_date": auth_date}

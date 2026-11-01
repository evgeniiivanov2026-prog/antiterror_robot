"""Build Telegram WebApp initData the same way the server checks it."""

import hashlib
import hmac
import json
import time
from urllib.parse import urlencode

BOT_TOKEN = "123456789:TEST_token_value_for_hmac_only"


def make_init_data(telegram_id: int, auth_date: int | None = None, bot_token: str = BOT_TOKEN) -> str:
    stamp = int(time.time()) if auth_date is None else auth_date
    pairs = {
        "auth_date": str(stamp),
        "query_id": "test-query",
        "user": json.dumps({"id": telegram_id, "first_name": "Test"}, separators=(",", ":"), ensure_ascii=False),
    }
    data_check = "\n".join(f"{key}={value}" for key, value in sorted(pairs.items()))
    secret = hmac.new(b"WebAppData", bot_token.encode("utf-8"), hashlib.sha256).digest()
    pairs["hash"] = hmac.new(secret, data_check.encode("utf-8"), hashlib.sha256).hexdigest()
    return urlencode(pairs)


def auth_header(telegram_id: int, auth_date: int | None = None) -> dict[str, str]:
    return {"Authorization": f"tma {make_init_data(telegram_id, auth_date)}"}


def report_payload(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "category": "fraud",
        "description": "Мне написали в личные сообщения и просили перейти по ссылке для оплаты несуществующего штрафа.",
        "platform": "Telegram",
        "demands": {
            "summary": "Просили перейти по ссылке",
            "asked_for_money": True,
            "asked_for_meeting": False,
            "asked_for_secrecy": False,
            "asked_to_click_link": True,
        },
        "contact_consent": False,
    }
    payload.update(overrides)
    return payload

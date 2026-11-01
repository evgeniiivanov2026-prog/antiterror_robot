import hashlib
import hmac
import json
import time
from urllib.parse import urlencode

import pytest
from cryptography.fernet import Fernet
from pydantic import ValidationError

from app.bot.factory import build_dispatcher
from app.bot.texts import EMERGENCY, START
from app.core.config import Settings
from app.core.copy import DISCLAIMER
from app.core.telegram_auth import validate_init_data
from app.core.errors import AppError
from app.models.incident import Category
from app.models.user import User
from app.schemas.incident import Demands
from app.services.encryption import ContactCipher, mask_contact
from app.services.malware import assert_safe, sniff
from app.services.safety import assess_threat, has_emergency_signal
from app.services.sanitize import contains_forbidden_secret
from app.services.ssrf import normalize_http_url
from app.models.incident import ThreatLevel


def _init_data(bot_token: str, user_id: int, auth_date: int | None = None) -> str:
    payload = {
        "auth_date": str(auth_date or int(time.time())),
        "query_id": "query",
        "user": json.dumps({"id": user_id, "first_name": "Ada"}, separators=(",", ":")),
    }
    check = "\n".join(f"{key}={value}" for key, value in sorted(payload.items()))
    secret = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
    payload["hash"] = hmac.new(secret, check.encode(), hashlib.sha256).hexdigest()
    return urlencode(payload)


def test_init_data_accepts_a_valid_signature() -> None:
    raw = _init_data("123456:TESTTOKEN", 77)
    assert validate_init_data(raw, "123456:TESTTOKEN", 3600)["telegram_id"] == 77


def test_init_data_rejects_a_forged_hash() -> None:
    raw = _init_data("123456:TESTTOKEN", 77) + "ff"
    with pytest.raises(AppError) as exc:
        validate_init_data(raw, "123456:TESTTOKEN", 3600)
    assert exc.value.status_code == 401


def test_init_data_rejects_expired_session() -> None:
    raw = _init_data("123456:TESTTOKEN", 77, auth_date=int(time.time()) - 100_000)
    with pytest.raises(AppError):
        validate_init_data(raw, "123456:TESTTOKEN", 3600)


def test_secrets_and_cards_are_rejected() -> None:
    assert contains_forbidden_secret("пароль: winter2024")
    assert contains_forbidden_secret("код из смс 548231")
    assert contains_forbidden_secret("карта 4111111111111111")
    assert not contains_forbidden_secret("мошенник просил назвать пароль, я отказался")


def test_private_urls_are_rejected() -> None:
    assert normalize_http_url("https://example.com/path") == "https://example.com/path"
    assert normalize_http_url("t.me/example") == "https://t.me/example"
    for blocked in ("http://127.0.0.1/admin", "http://169.254.169.254/", "http://10.0.0.8/", "javascript:alert(1)"):
        with pytest.raises(AppError):
            normalize_http_url(blocked)


def test_contact_encryption_roundtrip_and_mask() -> None:
    cipher = ContactCipher(Fernet.generate_key().decode())
    token = cipher.encrypt("user@example.com")
    assert token != "user@example.com"
    assert cipher.decrypt(token) == "user@example.com"
    assert mask_contact("email", "user@example.com") == "u***@example.com"
    assert mask_contact("phone", "+79991234567") == "+******67"


def test_emergency_language_raises_threat_level() -> None:
    assert has_emergency_signal("Мне срочно угрожают")
    assert assess_threat(Category.fraud, "обычный спор о заказе", None) == ThreatLevel.low
    assert assess_threat(Category.fraud, "Он написал, что это шантаж", None) == ThreatLevel.high
    assert assess_threat(Category.witness, "Ребёнку угрожают", Demands(summary="срочно")) == ThreatLevel.immediate


def test_executable_and_scripted_pdf_are_rejected() -> None:
    assert sniff(b"\x89PNG\r\n\x1a\n" + b"rest")[1] == "image/png"
    with pytest.raises(AppError):
        assert_safe(b"%PDF-1.4\n/JavaScript (bad)", sniff(b"%PDF-1.4\n/JavaScript (bad)"))
    assert sniff(b"MZ" + b"\x00" * 20) is None


def test_production_refuses_insecure_settings() -> None:
    key = Fernet.generate_key().decode()
    with pytest.raises(ValidationError):
        Settings(
            app_env="production",
            force_https=False,
            contact_encryption_key=key,
            database_url="postgresql+asyncpg://user:secret@db/app",
            bot_mode="disabled",
        )
    with pytest.raises(ValidationError):
        Settings(
            app_env="production",
            force_https=True,
            allow_dev_auth_bypass=True,
            contact_encryption_key=key,
            database_url="postgresql+asyncpg://user:secret@db/app",
            bot_mode="disabled",
        )


def test_user_model_does_not_store_profile_fields() -> None:
    columns = set(User.__table__.columns.keys())
    assert columns == {"id", "telegram_id", "role", "created_at", "updated_at"}


def test_bot_registers_required_commands() -> None:
    settings = Settings(app_env="test", bot_mode="disabled", bot_token="", redis_url="", webapp_url="https://app.example")
    dispatcher = build_dispatcher(settings, None)
    names = {
        handler.callback.__name__
        for router in dispatcher.sub_routers
        for handler in router.message.handlers
    }
    assert {"cmd_start", "cmd_report", "cmd_emergency", "cmd_evidence", "cmd_privacy"} <= names
    assert "112" in EMERGENCY and "102" in EMERGENCY
    assert "не является правоохранительным" in START
    assert "не является правоохранительным" in DISCLAIMER

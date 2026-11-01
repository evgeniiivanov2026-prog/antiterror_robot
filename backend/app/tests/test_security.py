from __future__ import annotations

import time

import pytest

from app.core.config import assert_runtime_safe
from app.core.security import AuthError, decrypt_text, encrypt_text, parse_init_data, sign_init_data
from app.core.sensitive import find_sensitive, luhn_ok
from app.core.threats import assess_threat, has_danger_signal
from app.core.urls import validate_public_url
from app.services.identifiers import new_public_id
from app.services.scanner import FileRejected, inspect_bytes, interpret_clam_response
from app.tests.conftest import make_settings

TOKEN = "123456:TESTTOKEN"
PAN = "4111111111111111"


def test_luhn_known_pan() -> None:
    assert luhn_ok(PAN)
    assert not luhn_ok("4111111111111112")


def test_sensitive_detects_secrets_and_allows_narrative() -> None:
    assert "card_number" in find_sensitive(f"Вот номер {PAN}")
    assert "password" in find_sensitive("пароль: qwerty123")
    assert "cvv" in find_sensitive("cvv 123")
    assert "otp" in find_sensitive("код из смс 482193")
    narrative = "Он попросил код из смс и пароль, но я ничего не отправлял."
    assert find_sensitive(narrative) == []


def test_urls_block_internal_targets() -> None:
    assert validate_public_url("https://example.com/channel") == "https://example.com/channel"
    for blocked in (
        "http://127.0.0.1/latest",
        "http://169.254.169.254/latest/meta-data",
        "http://10.1.1.1/",
        "http://192.168.0.5/",
        "http://[::1]/",
        "https://localhost/admin",
        "https://user:secret@example.com/a",
        "file:///etc/passwd",
        "http://metadata.google.internal/",
    ):
        with pytest.raises(ValueError):
            validate_public_url(blocked)


def test_init_data_accepts_and_rejects() -> None:
    header = sign_init_data(42, TOKEN)
    identity = parse_init_data(header.removeprefix("tma "), TOKEN, 86400)
    assert identity.telegram_id == 42
    with pytest.raises(AuthError):
        parse_init_data(header.removeprefix("tma ") + "tampered", TOKEN, 86400)
    expired = sign_init_data(42, TOKEN, auth_date=int(time.time()) - 100000)
    with pytest.raises(AuthError):
        parse_init_data(expired.removeprefix("tma "), TOKEN, 60)


def test_contact_encryption_roundtrip() -> None:
    secret = "test-contact-key-32-characters-min"
    encrypted = encrypt_text("@neighbor", secret)
    assert encrypted != "@neighbor"
    assert decrypt_text(encrypted, secret) == "@neighbor"


def test_threat_keywords() -> None:
    assert has_danger_signal("Мне срочно угрожают")
    assert has_danger_signal("Ребёнок получил сообщение")
    assert assess_threat("fraud", "обычная история про перевод", False) == "low"
    assert assess_threat("recruitment", "звали в чат", False) == "elevated"
    assert assess_threat("fraud", "это шантаж", False) == "immediate"
    assert assess_threat("witness", "спокойный рассказ", True) == "immediate"


def test_public_id_is_short_and_unambiguous() -> None:
    value = new_public_id()
    assert value.startswith("ATR-")
    assert len(value) == 10
    assert "0" not in value and "O" not in value and "1" not in value and "I" not in value


def test_scanner_accepts_png_and_rejects_active_content() -> None:
    import base64

    png = base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
    )
    settings = make_settings()
    mime, file_type = inspect_bytes(png, "image/png", settings)
    assert mime == "image/png"
    assert file_type == "image"
    with pytest.raises(FileRejected):
        inspect_bytes(b"MZ" + b"\x00" * 32, "image/png", settings)
    with pytest.raises(FileRejected):
        inspect_bytes(b"<html><script>alert(1)</script></html>", "text/html", settings)
    with pytest.raises(FileRejected):
        inspect_bytes(b"hello", "image/png", settings)


def test_scanner_size_limit() -> None:
    import base64

    png = base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
    )
    settings = make_settings(max_image_bytes=20)
    with pytest.raises(FileRejected) as caught:
        inspect_bytes(png, "image/png", settings)
    assert caught.value.code == "too_large"


def test_clam_response_parser() -> None:
    interpret_clam_response(b"stream: OK\n")
    with pytest.raises(FileRejected):
        interpret_clam_response(b"stream: Eicar-Test-Signature FOUND\n")


def test_production_configuration_is_strict() -> None:
    settings = make_settings(
        environment="production",
        allow_dev_auth=True,
        enforce_https=True,
        redis_url="redis://redis:6379/0",
        s3_endpoint="https://s3.example.com",
        s3_access_key="access",
        s3_secret_key="secret-value-not-local",
        contact_encryption_key="x" * 32,
        log_hash_salt="y" * 16,
        bot_token="123456:TESTTOKEN",
    )
    with pytest.raises(RuntimeError, match="ALLOW_DEV_AUTH"):
        assert_runtime_safe(settings)

import pytest

from app.core.errors import AppError
from app.core.security import request_is_secure, validate_init_data
from app.services.storage import LocalStorage
from app.services.text_safety import SECRET_MESSAGE, find_forbidden_secret, luhn_valid
from app.services.urls import validate_public_http_url
from app.tests.telegram_init import BOT_TOKEN, make_init_data


def test_luhn_accepts_known_test_card() -> None:
    assert luhn_valid("4111111111111111")
    assert not luhn_valid("4111111111111112")


def test_secret_detector_ignores_a_mention_without_a_value() -> None:
    assert find_forbidden_secret("Он просил пароль, но я его не отправлял и не записывал.") is None


def test_secret_detector_blocks_card_password_cvv_and_sms() -> None:
    assert find_forbidden_secret("Номер карты 4111 1111 1111 1111") == SECRET_MESSAGE
    assert find_forbidden_secret("пароль: qwerty12345") == SECRET_MESSAGE
    assert find_forbidden_secret("CVV 123") == SECRET_MESSAGE
    assert find_forbidden_secret("код из смс 482193") == SECRET_MESSAGE


def test_public_url_rejects_local_and_credentials() -> None:
    assert validate_public_http_url("https://example.com/path?q=1") == "https://example.com/path?q=1"
    for bad in (
        "http://127.0.0.1/admin",
        "http://169.254.169.254/latest",
        "file:///etc/passwd",
        "http://user:pass@example.com/a",
        "https://localhost/secret",
        "http://10.1.1.1/internal",
    ):
        with pytest.raises(ValueError):
            validate_public_http_url(bad)


def test_init_data_roundtrip_and_expiry() -> None:
    import time

    raw = make_init_data(42)
    assert validate_init_data(raw, BOT_TOKEN, 86400)["id"] == 42
    tampered = raw[:-1] + ("0" if raw[-1] != "0" else "1")
    with pytest.raises(Exception):
        validate_init_data(tampered, BOT_TOKEN, 86400)
    expired = make_init_data(42, auth_date=int(time.time()) - 90_000)
    with pytest.raises(Exception):
        validate_init_data(expired, BOT_TOKEN, 86400)


def test_https_is_required_only_in_production() -> None:
    assert request_is_secure("test", "/api/v1/reports", "")
    assert request_is_secure("production", "/api/v1/health", "")
    assert not request_is_secure("production", "/api/v1/reports", "http")
    assert request_is_secure("production", "/api/v1/reports", "https")


@pytest.mark.asyncio
async def test_storage_rejects_path_traversal(tmp_path) -> None:
    storage = LocalStorage(str(tmp_path))
    with pytest.raises(AppError):
        await storage.save("../secrets.txt", b"nope", "text/plain")

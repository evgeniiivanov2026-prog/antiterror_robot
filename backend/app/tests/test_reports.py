import time

import pytest
from sqlalchemy import select

from app.core.config import Settings, get_settings
from app.core.database import get_sessionmaker
from app.models.incident import IncidentReport
from app.services.delivery import get_copy_sender
from app.tests.telegram_init import auth_header, report_payload


@pytest.mark.asyncio
async def test_health_and_unknown_route(client) -> None:
    health = await client.get("/api/v1/health")
    assert health.status_code == 200
    assert health.json() == {"status": "ok"}
    missing = await client.get("/api/v1/missing")
    assert missing.status_code == 404
    assert missing.json()["error"]["code"] == "http_error"


@pytest.mark.asyncio
async def test_create_and_read_own_card(client) -> None:
    created = await client.post("/api/v1/reports", headers=auth_header(10), json=report_payload())
    assert created.status_code == 201
    body = created.json()
    assert body["public_id"].startswith("ATR-")
    assert body["threat_level"] == "medium"
    assert body["status"] == "new"
    assert "не является правоохранительным" in body["disclaimer"]
    assert "112" in body["safety_notice"]
    fetched = await client.get(f"/api/v1/reports/{body['public_id']}", headers=auth_header(10))
    assert fetched.status_code == 200
    assert fetched.json()["id"] == body["id"]


@pytest.mark.asyncio
async def test_other_user_cannot_read_card(client) -> None:
    created = await client.post("/api/v1/reports", headers=auth_header(11), json=report_payload())
    public_id = created.json()["public_id"]
    hidden = await client.get(f"/api/v1/reports/{public_id}", headers=auth_header(12))
    assert hidden.status_code == 404
    assert hidden.json()["error"]["code"] == "not_found"


@pytest.mark.asyncio
async def test_rejects_secrets_without_echoing_them(client) -> None:
    card = "4111111111111111"
    response = await client.post(
        "/api/v1/reports",
        headers=auth_header(13),
        json=report_payload(description=f"Мне прислали номер {card} и просили перевести деньги сегодня."),
    )
    assert response.status_code == 422
    assert card not in response.text
    assert response.json()["error"]["code"] == "validation_error"


@pytest.mark.asyncio
async def test_rejects_private_urls(client) -> None:
    response = await client.post(
        "/api/v1/reports",
        headers=auth_header(14),
        json=report_payload(source_url="http://169.254.169.254/latest/meta-data"),
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_critical_words_raise_threat_level(client) -> None:
    response = await client.post(
        "/api/v1/reports",
        headers=auth_header(15),
        json=report_payload(description="Мне срочно угрожают и требуют встретиться сегодня вечером."),
    )
    assert response.status_code == 201
    assert response.json()["threat_level"] == "critical"


@pytest.mark.asyncio
async def test_contact_is_encrypted_and_masked(client) -> None:
    phone = "+79991234567"
    response = await client.post(
        "/api/v1/reports",
        headers=auth_header(16),
        json=report_payload(
            contact_consent=True,
            contact_channel="phone",
            contact_value=phone,
        ),
    )
    assert response.status_code == 201
    body = response.json()
    assert body["contact_masked"] == "***67"
    assert phone not in response.text
    async with get_sessionmaker()() as session:
        row = await session.scalar(select(IncidentReport).where(IncidentReport.public_id == body["public_id"]))
    assert row is not None
    assert row.contact_value is not None
    assert phone not in row.contact_value


@pytest.mark.asyncio
async def test_owner_can_mark_card_for_police_and_delete_it(client) -> None:
    created = await client.post("/api/v1/reports", headers=auth_header(17), json=report_payload())
    report_id = created.json()["id"]
    public_id = created.json()["public_id"]
    forwarded = await client.patch(
        f"/api/v1/reports/{report_id}/status",
        headers=auth_header(17),
        json={"status": "forwarded"},
    )
    assert forwarded.status_code == 200
    assert forwarded.json()["status"] == "forwarded"
    denied = await client.patch(
        f"/api/v1/reports/{report_id}/status",
        headers=auth_header(17),
        json={"status": "under_review"},
    )
    assert denied.status_code == 403
    deleted = await client.delete(f"/api/v1/reports/{report_id}", headers=auth_header(17))
    assert deleted.status_code == 204
    missing = await client.get(f"/api/v1/reports/{public_id}", headers=auth_header(17))
    assert missing.status_code == 404


@pytest.mark.asyncio
async def test_rate_limit(client, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(get_settings(), "rate_limit_reports", 2)
    headers = auth_header(18)
    assert (await client.post("/api/v1/reports", headers=headers, json=report_payload())).status_code == 201
    assert (await client.post("/api/v1/reports", headers=headers, json=report_payload())).status_code == 201
    blocked = await client.post("/api/v1/reports", headers=headers, json=report_payload())
    assert blocked.status_code == 429
    assert blocked.json()["error"]["code"] == "rate_limited"
    assert blocked.headers["retry-after"]


@pytest.mark.asyncio
async def test_auth_required_and_dev_header_is_off(client, monkeypatch: pytest.MonkeyPatch) -> None:
    anonymous = await client.get("/api/v1/meta/categories")
    assert anonymous.status_code == 401
    dev = await client.get("/api/v1/meta/categories", headers={"X-Dev-Telegram-Id": "5"})
    assert dev.status_code == 401
    monkeypatch.setattr(get_settings(), "allow_dev_auth", True)
    allowed = await client.get("/api/v1/meta/categories", headers={"X-Dev-Telegram-Id": "5"})
    assert allowed.status_code == 200
    assert allowed.json()[0]["title"] == "Вербовка"


@pytest.mark.asyncio
async def test_expired_init_data(client) -> None:
    headers = auth_header(19, auth_date=int(time.time()) - 90_000)
    response = await client.post("/api/v1/reports", headers=headers, json=report_payload())
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_send_copy_uses_short_caption(client) -> None:
    created = await client.post("/api/v1/reports", headers=auth_header(20), json=report_payload())
    body = created.json()

    class FakeSender:
        def __init__(self) -> None:
            self.calls: list[dict[str, object]] = []

        async def send_pdf(self, telegram_id: int, filename: str, payload: bytes, caption: str) -> None:
            self.calls.append(
                {"telegram_id": telegram_id, "filename": filename, "payload": payload, "caption": caption}
            )

    fake = FakeSender()
    client.app.dependency_overrides[get_copy_sender] = lambda: fake
    response = await client.post(f"/api/v1/reports/{body['id']}/send-copy", headers=auth_header(20))
    assert response.status_code == 204
    assert fake.calls[0]["payload"].startswith(b"%PDF")
    assert "несуществующего" not in str(fake.calls[0]["caption"])
    assert body["public_id"] in str(fake.calls[0]["caption"])


def test_production_settings_reject_dev_auth(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("ALLOW_DEV_AUTH", "true")
    monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://user:pass@db/app")
    monkeypatch.setenv("BOT_TOKEN", "1:token")
    monkeypatch.setenv("WEBAPP_URL", "https://example.com")
    monkeypatch.setenv("RATE_LIMIT_BACKEND", "redis")
    with pytest.raises(ValueError, match="ALLOW_DEV_AUTH"):
        Settings()

from datetime import datetime, timedelta, timezone

import pytest

from app.models.incident import IncidentReport
from app.services.retention import purge_expired
from sqlalchemy import select

PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de"
    "0000000c4944415408d763f8cfc000000301010018dd8db40000000049454e44ae426082"
)

REPORT = {
    "category": "fraud",
    "description": "Незнакомец просил перевести деньги за несуществующий заказ и торопил с ответом.",
    "platform": "Telegram",
    "source_url": "https://t.me/example",
    "suspect_identifiers": {"username": "example_user", "platform": "Telegram"},
    "demands": {"summary": "Просил перевести деньги", "money_requested": True},
    "contact_consent": True,
    "contact_channel": "email",
    "contact_value": "person@example.com",
}


@pytest.mark.asyncio
async def test_reports_require_a_telegram_user(api) -> None:
    response = await api["client"].post("/api/v1/reports", json=REPORT)
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "unauthorized"


@pytest.mark.asyncio
async def test_categories_and_health(api) -> None:
    client = api["client"]
    health = await client.get("/api/v1/health")
    assert health.status_code == 200
    assert health.json() == {"status": "ok"}
    categories = await client.get("/api/v1/meta/categories")
    body = categories.json()
    assert categories.status_code == 200
    assert any(item["id"] == "recruitment" for item in body["categories"])
    assert "не является правоохранительным" in body["disclaimer"]


@pytest.mark.asyncio
async def test_create_read_and_hide_contact(api, auth_header) -> None:
    client = api["client"]
    created = await client.post("/api/v1/reports", json=REPORT, headers=auth_header(42))
    assert created.status_code == 201, created.text
    card = created.json()
    assert card["public_id"].startswith("ATR-")
    assert card["contact_hint"] == "p***@example.com"
    assert "contact_value" not in card
    assert card["threat_level"] in {"low", "elevated", "high", "immediate"}
    assert "МВД" in card["mvd_recommendation"]

    own = await client.get(f"/api/v1/reports/{card['public_id']}", headers=auth_header(42))
    assert own.status_code == 200
    foreign = await client.get(f"/api/v1/reports/{card['public_id']}", headers=auth_header(43))
    assert foreign.status_code == 404
    assert foreign.json()["error"]["code"] == "not_found"


@pytest.mark.asyncio
async def test_sensitive_payload_and_private_url_are_rejected(api, auth_header) -> None:
    client = api["client"]
    leaked = dict(REPORT)
    leaked["description"] = "Вот номер карты 4111111111111111 и cvv: 123"
    response = await client.post("/api/v1/reports", json=leaked, headers=auth_header(7))
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "sensitive_data"

    local = dict(REPORT)
    local["description"] = "Незнакомец прислал ссылку на внутренний адрес и просил открыть её сегодня."
    local["source_url"] = "http://127.0.0.1/secret"
    blocked = await client.post("/api/v1/reports", json=local, headers=auth_header(7))
    assert blocked.status_code == 422


@pytest.mark.asyncio
async def test_emergency_screen_data(api, auth_header) -> None:
    response = await api["client"].post("/api/v1/emergency", json={"source": "miniapp"}, headers=auth_header(11))
    assert response.status_code == 201, response.text
    body = response.json()
    numbers = {item["number"] for item in body["phones"]}
    assert numbers == {"112", "102"}
    support = {item["number"] for item in body["support_contacts"]}
    assert "8-800-2000-122" in support
    assert "8-800-224-22-22" in support
    assert "18" in body["minor_guidance"]
    assert "мессенджер" in body["minor_guidance"]
    assert "не вызывает" in body["immediate_danger"] or "Не ждите" in body["immediate_danger"]


@pytest.mark.asyncio
async def test_evidence_pdf_chat_and_deletion(api, auth_header) -> None:
    client = api["client"]
    created = await client.post("/api/v1/reports", json=REPORT, headers=auth_header(15))
    card = created.json()
    uploaded = await client.post(
        f"/api/v1/reports/{card['id']}/evidence",
        headers=auth_header(15),
        files={"file": ("shot.png", PNG, "image/png")},
    )
    assert uploaded.status_code == 201, uploaded.text
    assert uploaded.json()["file_type"] == "image"
    assert "storage_key" not in uploaded.json()

    rejected = await client.post(
        f"/api/v1/reports/{card['id']}/evidence",
        headers=auth_header(15),
        files={"file": ("run.exe", b"MZ" + b"\x00" * 32, "application/octet-stream")},
    )
    assert rejected.status_code == 415

    pdf = await client.post(f"/api/v1/reports/{card['id']}/export", headers=auth_header(15))
    assert pdf.status_code == 200
    assert pdf.headers["content-type"] == "application/pdf"
    assert card["public_id"] in pdf.headers["content-disposition"]
    assert pdf.content.startswith(b"%PDF")
    assert len(pdf.content) > 2000

    sent = await client.post(f"/api/v1/reports/{card['id']}/send-to-chat", headers=auth_header(15))
    assert sent.status_code == 200
    telegram_id, text = api["app"].state.notifier.messages[-1]
    assert telegram_id == 15
    assert card["public_id"] in text
    assert "person@example.com" not in text

    removed = await client.delete(f"/api/v1/reports/{card['id']}", headers=auth_header(15))
    assert removed.status_code == 204
    missing = await client.get(f"/api/v1/reports/{card['public_id']}", headers=auth_header(15))
    assert missing.status_code == 404


@pytest.mark.asyncio
async def test_session_role(api, auth_header) -> None:
    client = api["client"]
    admin = await client.get("/api/v1/me", headers=auth_header(9001))
    user = await client.get("/api/v1/me", headers=auth_header(21))
    assert admin.status_code == 200
    assert admin.json() == {"role": "admin", "telegram_id": 9001}
    assert user.json()["role"] == "user"
    assert "username" not in user.json()


@pytest.mark.asyncio
async def test_moderator_cannot_see_contact_and_user_cannot_moderate(api, auth_header) -> None:
    client = api["client"]
    created = await client.post("/api/v1/reports", json=REPORT, headers=auth_header(21))
    report_id = created.json()["id"]
    forbidden = await client.get("/api/v1/moderation/reports", headers=auth_header(21))
    assert forbidden.status_code == 403

    listing = await client.get("/api/v1/moderation/reports", headers=auth_header(9002))
    assert listing.status_code == 200
    assert listing.json()[0]["public_id"].startswith("ATR-")
    assert "description" not in listing.json()[0]

    detail = await client.get(f"/api/v1/moderation/reports/{report_id}", headers=auth_header(9001))
    assert detail.status_code == 200
    assert detail.json()["contact_hint"] is None
    assert "contact_value" not in detail.json()

    closed = await client.post(
        f"/api/v1/moderation/reports/{report_id}/close",
        json={"status": "closed", "reason": "spam"},
        headers=auth_header(9001),
    )
    assert closed.status_code == 200
    assert closed.json()["status"] == "closed"


@pytest.mark.asyncio
async def test_rate_limit_and_account_deletion(api, auth_header) -> None:
    client = api["client"]
    api["app"].state.settings.rate_limit_reports = 2
    first = await client.post("/api/v1/reports", json=REPORT, headers=auth_header(33))
    second = await client.post("/api/v1/reports", json=REPORT, headers=auth_header(33))
    third = await client.post("/api/v1/reports", json=REPORT, headers=auth_header(33))
    assert first.status_code == 201
    assert second.status_code == 201
    assert third.status_code == 429
    assert third.json()["error"]["code"] == "rate_limited"

    deleted = await client.delete("/api/v1/me", headers=auth_header(33))
    assert deleted.status_code == 200
    assert deleted.json()["deleted_reports"] == 2


@pytest.mark.asyncio
async def test_retention_removes_old_cards(api, auth_header) -> None:
    client = api["client"]
    created = await client.post("/api/v1/reports", json=REPORT, headers=auth_header(44))
    assert created.status_code == 201
    maker = api["app"].state.sessionmaker
    async with maker() as session:
        report = (await session.execute(select(IncidentReport))).scalar_one()
        report.created_at = datetime.now(timezone.utc) - timedelta(days=400)
        await session.commit()
        removed = await purge_expired(session, api["app"].state.storage, 180)
        await session.commit()
    assert removed == 1
    missing = await client.get(f"/api/v1/reports/{created.json()['public_id']}", headers=auth_header(44))
    assert missing.status_code == 404


@pytest.mark.asyncio
async def test_https_and_webhook_guards(tmp_path) -> None:
    from cryptography.fernet import Fernet
    from httpx import ASGITransport, AsyncClient
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from app.core.config import Settings
    from app.core.rate_limit import MemoryRateLimiter
    from app.main import create_app
    from app.models import Base
    from app.services.encryption import ContactCipher
    from app.services.storage import LocalStorage

    settings = Settings(
        app_env="test",
        bot_mode="webhook",
        bot_token="123456:TESTTOKEN",
        bot_webhook_secret="hook-secret",
        force_https=True,
        allow_dev_auth_bypass=False,
        contact_encryption_key=Fernet.generate_key().decode(),
        redis_url="",
        database_url="sqlite+aiosqlite://",
        rate_limit_requests=100,
    )
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'hook.db'}")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    application = create_app(settings)
    application.state.sessionmaker = async_sessionmaker(engine, expire_on_commit=False)
    application.state.limiter = MemoryRateLimiter()
    application.state.storage = LocalStorage(str(tmp_path / "files"))
    application.state.cipher = ContactCipher(settings.contact_encryption_key)

    class Recorder:
        def __init__(self) -> None:
            self.fed = 0

        async def feed_update(self, bot, update) -> None:
            self.fed += 1

    application.state.bot = object()
    application.state.dispatcher = Recorder()
    transport = ASGITransport(app=application)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        blocked = await client.get("/api/v1/meta/categories")
        assert blocked.status_code == 400
        assert blocked.json()["error"]["code"] == "https_required"
        health = await client.get("/api/v1/health")
        assert health.status_code == 200
        denied = await client.post(
            "/api/v1/telegram/webhook",
            json={"update_id": 1},
            headers={"X-Forwarded-Proto": "https"},
        )
        assert denied.status_code == 401
        accepted = await client.post(
            "/api/v1/telegram/webhook",
            json={"update_id": 1},
            headers={"X-Telegram-Bot-Api-Secret-Token": "hook-secret", "X-Forwarded-Proto": "https"},
        )
        assert accepted.status_code == 200
        assert application.state.dispatcher.fed == 1
    await engine.dispose()

from __future__ import annotations

import base64
import logging
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from app.core.security import sign_init_data
from app.models.audit import AuditLog
from app.models.incident import IncidentReport
from app.services.export import find_font, render_card_text
from app.services.notify import chat_copy
from app.services.reports import purge_expired
from app.tests.conftest import make_settings
from app.main import create_app, shutdown, startup

TOKEN = "123456:TESTTOKEN"
PAN = "4111111111111111"
PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)


def auth(telegram_id: int = 1001) -> dict[str, str]:
    return {"Authorization": sign_init_data(telegram_id, TOKEN)}


def body(**overrides) -> dict:
    payload = {
        "category": "fraud",
        "description": "Незнакомец просил перейти в другой чат и перевести деньги за работу.",
        "platform": "telegram",
        "demands": {"asked_for": "money", "summary": "Просил перевод на карту", "user_complied": False},
        "contact_consent": False,
    }
    payload.update(overrides)
    return payload


@pytest.fixture
async def client(api):
    http, _application = api
    return http


async def test_create_and_read_own_card(client) -> None:
    created = await client.post("/api/v1/reports", headers=auth(), json=body())
    assert created.status_code == 201, created.text
    card = created.json()
    assert card["public_id"].startswith("ATR-")
    assert card["status"] == "new"
    assert card["threat_level"] == "low"
    assert "112" in card["safety_notice"]
    assert card["contact_value"] is None
    fetched = await client.get(f"/api/v1/reports/{card['public_id']}", headers=auth())
    assert fetched.status_code == 200
    assert fetched.json()["description"] == body()["description"]
    assert fetched.headers["x-content-type-options"] == "nosniff"


async def test_other_user_cannot_read_card(client) -> None:
    created = await client.post("/api/v1/reports", headers=auth(1001), json=body())
    public_id = created.json()["public_id"]
    foreign = await client.get(f"/api/v1/reports/{public_id}", headers=auth(1002))
    assert foreign.status_code == 404
    assert foreign.json()["error"]["code"] == "not_found"


async def test_rejects_card_number_without_echoing_it(client) -> None:
    response = await client.post(
        "/api/v1/reports",
        headers=auth(),
        json=body(description=f"Он прислал номер {PAN} и просил перевод."),
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"
    assert PAN not in response.text


async def test_private_url_rejected(client) -> None:
    response = await client.post(
        "/api/v1/reports",
        headers=auth(),
        json=body(source_url="http://169.254.169.254/latest/meta-data"),
    )
    assert response.status_code == 422


async def test_contact_is_encrypted_at_rest_and_hidden_from_staff(api) -> None:
    client, application = api
    created = await client.post(
        "/api/v1/reports",
        headers=auth(1001),
        json=body(contact_consent=True, contact_channel="telegram", contact_value="@safe_user"),
    )
    assert created.status_code == 201, created.text
    assert created.json()["contact_value"] == "@safe_user"
    async with application.state.sessionmaker() as session:
        stored = (await session.execute(select(IncidentReport))).scalar_one()
        assert stored.contact_value != "@safe_user"
        assert "safe_user" not in (stored.contact_value or "")
    staff_app = create_app(make_settings(moderator_ids="3003"))
    original_engine = staff_app.state.engine
    staff_app.state.engine = application.state.engine
    staff_app.state.sessionmaker = application.state.sessionmaker
    try:
        from httpx import ASGITransport, AsyncClient

        transport = ASGITransport(app=staff_app)
        async with AsyncClient(transport=transport, base_url="https://test.local") as staff:
            viewed = await staff.get(
                f"/api/v1/reports/{created.json()['public_id']}",
                headers=auth(3003),
            )
        assert viewed.status_code == 200
        assert viewed.json()["contact_value"] is None
        assert viewed.json()["description"]
    finally:
        await original_engine.dispose()


async def test_moderator_status_is_audited(api) -> None:
    client, application = api
    created = await client.post("/api/v1/reports", headers=auth(1001), json=body())
    public_id = created.json()["public_id"]
    denied = await client.patch(
        f"/api/v1/reports/{public_id}/status",
        headers=auth(1001),
        json={"status": "closed", "note": ""},
    )
    assert denied.status_code == 403
    application.state.settings.moderator_ids = "3003"
    changed = await client.patch(
        f"/api/v1/reports/{public_id}/status",
        headers=auth(3003),
        json={"status": "forwarded", "note": "подсказали обратиться в МВД"},
    )
    assert changed.status_code == 200, changed.text
    assert changed.json()["status"] == "forwarded"
    assert "112" in changed.json()["safety_notice"]
    async with application.state.sessionmaker() as session:
        audits = (await session.execute(select(AuditLog))).scalars().all()
    assert any(item.action == "status_changed" and item.target_id == public_id for item in audits)


async def test_owner_can_delete_report_and_file(client, api) -> None:
    _client, application = api
    created = await client.post("/api/v1/reports", headers=auth(), json=body())
    report_id = created.json()["id"]
    public_id = created.json()["public_id"]
    uploaded = await client.post(
        f"/api/v1/reports/{report_id}/evidence",
        headers=auth(),
        files={"file": ("shot.png", PNG, "image/png")},
    )
    assert uploaded.status_code == 201, uploaded.text
    assert application.state.storage.objects
    deleted = await client.delete(f"/api/v1/reports/{public_id}", headers=auth())
    assert deleted.status_code == 204
    missing = await client.get(f"/api/v1/reports/{public_id}", headers=auth())
    assert missing.status_code == 404
    assert application.state.storage.objects == {}


async def test_evidence_rejects_executable(client) -> None:
    created = await client.post("/api/v1/reports", headers=auth(), json=body())
    report_id = created.json()["id"]
    rejected = await client.post(
        f"/api/v1/reports/{report_id}/evidence",
        headers=auth(),
        files={"file": ("run.exe", b"MZ" + b"\x00" * 64, "application/octet-stream")},
    )
    assert rejected.status_code == 400
    assert rejected.json()["error"]["code"] == "file_rejected"


async def test_emergency_and_categories(client) -> None:
    categories = await client.get("/api/v1/meta/categories")
    ids = {item["id"] for item in categories.json()["categories"]}
    assert {"recruitment", "fraud", "blackmail", "suspicious_account", "witness", "emergency"} <= ids
    recorded = await client.post("/api/v1/emergency", headers=auth(), json={"trigger": "manual"})
    assert recorded.status_code == 201
    assert "112" in recorded.json()["message"]
    assert "102" in recorded.json()["message"]


async def test_rate_limit(api) -> None:
    _client, application = api
    application.state.settings.rate_limit_reports = 2
    from httpx import ASGITransport, AsyncClient

    transport = ASGITransport(app=application)
    async with AsyncClient(transport=transport, base_url="https://test.local") as client:
        assert (await client.post("/api/v1/reports", headers=auth(), json=body())).status_code == 201
        assert (await client.post("/api/v1/reports", headers=auth(), json=body())).status_code == 201
        blocked = await client.post("/api/v1/reports", headers=auth(), json=body())
    assert blocked.status_code == 429
    assert blocked.json()["error"]["code"] == "rate_limited"


async def test_https_required_except_health() -> None:
    application = create_app(make_settings(enforce_https=True))
    await startup(application)
    from httpx import ASGITransport, AsyncClient

    transport = ASGITransport(app=application)
    async with AsyncClient(transport=transport, base_url="http://test.local") as client:
        blocked = await client.get("/api/v1/meta/categories")
        health = await client.get("/api/v1/health")
    await shutdown(application)
    assert blocked.status_code == 403
    assert blocked.json()["error"]["code"] == "https_required"
    assert health.status_code == 200


async def test_internal_error_hides_details(client) -> None:
    response = await client.get("/api/v1/_boom")
    assert response.status_code == 500
    assert response.json()["error"]["code"] == "internal_error"
    assert "secret detail" not in response.text


async def test_missing_auth(client) -> None:
    response = await client.post("/api/v1/reports", json=body())
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "unauthorized"


async def test_logs_omit_description(api) -> None:
    client, _application = api
    records: list[str] = []

    class Grab(logging.Handler):
        def emit(self, record: logging.LogRecord) -> None:
            fields = getattr(record, "fields", {})
            records.append(f"{record.getMessage()} {fields}")

    handler = Grab()
    logging.getLogger().addHandler(handler)
    phrase = "уникальнаяфразабезпробела"
    try:
        response = await client.post(
            "/api/v1/reports",
            headers=auth(),
            json=body(description=f"Незнакомец написал {phrase} и просил перевод."),
        )
    finally:
        logging.getLogger().removeHandler(handler)
    assert response.status_code == 201
    blob = "\n".join(records)
    assert phrase not in blob
    assert "report_created" in blob


async def test_retention_deletes_old_cards(api) -> None:
    client, application = api
    created = await client.post("/api/v1/reports", headers=auth(), json=body())
    uploaded = await client.post(
        f"/api/v1/reports/{created.json()['id']}/evidence",
        headers=auth(),
        files={"file": ("shot.png", PNG, "image/png")},
    )
    assert uploaded.status_code == 201
    async with application.state.sessionmaker() as session:
        stored = (await session.execute(select(IncidentReport))).scalar_one()
        stored.created_at = datetime.now(timezone.utc) - timedelta(days=120)
        await session.commit()
    async with application.state.sessionmaker() as worker:
        count = await purge_expired(worker, application.state.storage, 90)
    assert count == 1
    assert application.state.storage.objects == {}


async def test_chat_copy_omits_third_party_phone() -> None:
    report = IncidentReport(
        public_id="ATR-TEST01",
        owner_id=uuid.uuid4(),
        category="blackmail",
        description="Человек требовал деньги и угрожал рассказать родителям.",
        platform="telegram",
        demands={"asked_for": "money", "summary": "перевод", "user_complied": False},
        threat_level="immediate",
        suspect_identifiers={"phone": "+79990001122"},
        contact_consent=False,
        status="new",
    )
    report.evidence_files = []
    text = chat_copy(report)
    assert "ATR-TEST01" in text
    assert "+79990001122" not in text
    assert "112" in text
    rendered = render_card_text(report, None)
    assert "не заявление" in rendered.lower() or "Это не заявление" in rendered


async def test_pdf_when_font_present() -> None:
    from app.services.export import render_pdf

    settings = make_settings()
    if find_font(settings) is None:
        pytest.skip("Cyrillic font is not installed")
    report = IncidentReport(
        public_id="ATR-PDF001",
        owner_id=uuid.uuid4(),
        category="fraud",
        description="Короткое описание ситуации для проверки PDF файла.",
        platform="telegram",
        demands={"asked_for": "none", "summary": "", "user_complied": False},
        threat_level="low",
        contact_consent=False,
        status="new",
    )
    report.evidence_files = []
    report.suspect_identifiers = None
    report.occurred_at = None
    report.source_url = None
    report.contact_value = None
    report.contact_channel = None
    pdf = render_pdf(report, None, settings)
    assert pdf.startswith(b"%PDF")


async def test_danger_word_marks_immediate(client) -> None:
    created = await client.post(
        "/api/v1/reports",
        headers=auth(),
        json=body(description="Мне срочно пишут и требуют встретиться сегодня вечером."),
    )
    assert created.status_code == 201
    assert created.json()["threat_level"] == "immediate"
    assert created.json()["emergency_recommended"] is True

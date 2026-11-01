from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.config import get_settings
from app.core.database import get_sessionmaker
from app.models.audit import AuditLog
from app.models.incident import IncidentReport
from app.services.content_scan import scan_upload
from app.services.pdf_export import build_pdf_lines, render_report_pdf
from app.services.retention import purge_expired
from app.tests.telegram_init import auth_header, report_payload

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
CLEAN_PDF = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF"
ACTIVE_PDF = b"%PDF-1.4\n/JavaScript (alert)\n%%EOF"


def test_scanner_accepts_png_and_rejects_active_content() -> None:
    file_type, mime = scan_upload(PNG, "image/png", "screen.png")
    assert file_type == "image"
    assert mime == "image/png"
    with pytest.raises(Exception):
        scan_upload(b"MZ" + b"\x00" * 20, "image/png", "app.png")
    with pytest.raises(Exception):
        scan_upload(ACTIVE_PDF, "application/pdf", "note.pdf")
    with pytest.raises(Exception):
        scan_upload(PNG, "image/png", "screen.png.exe")


@pytest.mark.asyncio
async def test_upload_evidence_and_export_pdf(client, tmp_path) -> None:
    created = await client.post(
        "/api/v1/reports",
        headers=auth_header(30),
        json=report_payload(
            contact_consent=True,
            contact_channel="telegram",
            contact_value="@quiet_user",
        ),
    )
    body = created.json()
    uploaded = await client.post(
        f"/api/v1/reports/{body['id']}/evidence",
        headers=auth_header(30),
        files={"file": ("screen.png", PNG, "image/png")},
    )
    assert uploaded.status_code == 201
    assert uploaded.json()["file_type"] == "image"
    assert list(tmp_path.iterdir())
    stolen = await client.post(
        f"/api/v1/reports/{body['id']}/evidence",
        headers=auth_header(31),
        files={"file": ("screen.png", PNG, "image/png")},
    )
    assert stolen.status_code == 404
    exported = await client.post(f"/api/v1/reports/{body['id']}/export", headers=auth_header(30))
    assert exported.status_code == 200
    assert exported.content.startswith(b"%PDF")
    assert "quiet_user" not in exported.content.decode("latin-1", "ignore")
    deleted = await client.delete(f"/api/v1/reports/{body['id']}", headers=auth_header(30))
    assert deleted.status_code == 204
    assert list(tmp_path.iterdir()) == []


@pytest.mark.asyncio
async def test_emergency_returns_numbers(client) -> None:
    response = await client.post("/api/v1/emergency", headers=auth_header(32), json={"source": "mini_app"})
    assert response.status_code == 200
    phones = {item["phone"] for item in response.json()["contacts"]}
    assert {"112", "102", "88002000122"} <= phones
    assert response.json()["recorded"] is True
    assert "несовершеннолет" in response.json()["notice"].lower()


@pytest.mark.asyncio
async def test_admin_can_assign_moderator(client, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(get_settings(), "admin_telegram_ids", "40")
    assigned = await client.post(
        "/api/v1/admin/roles",
        headers=auth_header(40),
        json={"telegram_id": 41, "role": "moderator"},
    )
    assert assigned.status_code == 200
    created = await client.post("/api/v1/reports", headers=auth_header(42), json=report_payload(category="witness"))
    report_id = created.json()["id"]
    reviewed = await client.patch(
        f"/api/v1/reports/{report_id}/status",
        headers=auth_header(41),
        json={"status": "under_review"},
    )
    assert reviewed.status_code == 200
    assert reviewed.json()["threat_level"] == "low"
    forbidden = await client.post(
        "/api/v1/admin/roles",
        headers=auth_header(41),
        json={"telegram_id": 43, "role": "admin"},
    )
    assert forbidden.status_code == 403
    async with get_sessionmaker()() as session:
        audit = await session.scalar(select(AuditLog).where(AuditLog.action == "role_changed"))
    assert audit is not None
    assert audit.meta["to"] == "moderator"


@pytest.mark.asyncio
async def test_retention_purges_old_reports(client) -> None:
    created = await client.post("/api/v1/reports", headers=auth_header(44), json=report_payload())
    public_id = created.json()["public_id"]
    async with get_sessionmaker()() as session:
        row = await session.scalar(select(IncidentReport).where(IncidentReport.public_id == public_id))
        assert row is not None
        row.created_at = datetime.now(timezone.utc) - timedelta(days=181)
        await session.commit()
        result = await purge_expired(session)
    assert result["reports"] == 1
    missing = await client.get(f"/api/v1/reports/{public_id}", headers=auth_header(44))
    assert missing.status_code == 404


@pytest.mark.asyncio
async def test_pdf_lines_include_disclaimer(client) -> None:
    created = await client.post("/api/v1/reports", headers=auth_header(45), json=report_payload())
    async with get_sessionmaker()() as session:
        row = await session.scalar(
            select(IncidentReport)
            .options(selectinload(IncidentReport.evidence_files))
            .where(IncidentReport.public_id == created.json()["public_id"])
        )
    assert row is not None
    lines = "\n".join(build_pdf_lines(row))
    assert "не является правоохранительным" in lines
    assert row.description in lines
    pdf = render_report_pdf(row)
    assert pdf.startswith(b"%PDF")

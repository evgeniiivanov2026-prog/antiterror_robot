from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.config import Settings
from app.main import create_app, shutdown, startup


def make_settings(**overrides) -> Settings:
    values = {
        "environment": "test",
        "bot_token": "123456:TESTTOKEN",
        "contact_encryption_key": "test-contact-key-32-characters-min",
        "database_url": "sqlite+aiosqlite://",
        "log_hash_salt": "test-log-hash-salt",
        "allow_dev_auth": False,
        "enforce_https": False,
        "bot_mode": "disabled",
        "redis_url": "",
        "s3_endpoint": "",
        "cors_origins": "",
        "rate_limit_reports": 100,
        "rate_limit_evidence": 100,
        "rate_limit_reads": 100,
        "rate_limit_emergency": 100,
        "moderator_ids": "",
        "admin_ids": "",
    }
    values.update(overrides)
    return Settings(**values)


@pytest.fixture
async def api():
    application = create_app(make_settings())
    await startup(application)
    transport = ASGITransport(app=application, raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="https://test.local") as client:
        yield client, application
    await shutdown(application)

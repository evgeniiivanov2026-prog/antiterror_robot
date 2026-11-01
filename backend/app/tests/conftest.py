from collections.abc import AsyncIterator

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.config import get_settings
from app.core.database import dispose_engine, get_engine
from app.core.rate_limit import MemoryRateLimiter, get_limiter
from app.main import create_app
from app.models import Base


class ClientBundle:
    def __init__(self, app: object, client: AsyncClient) -> None:
        self.app = app
        self.http = client

    def __getattr__(self, name: str) -> object:
        return getattr(self.http, name)


@pytest.fixture
async def client(tmp_path: object, monkeypatch: pytest.MonkeyPatch) -> AsyncIterator[ClientBundle]:
    monkeypatch.setattr(get_settings(), "storage_path", str(tmp_path))
    limiter = get_limiter()
    if isinstance(limiter, MemoryRateLimiter):
        limiter.reset()
    await dispose_engine()
    application = create_app()
    engine = get_engine()
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.drop_all)
        await connection.run_sync(Base.metadata.create_all)
    transport = ASGITransport(app=application)
    async with AsyncClient(transport=transport, base_url="http://test") as async_client:
        yield ClientBundle(application, async_client)
    await dispose_engine()

import pytest
from cryptography.fernet import Fernet
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import Settings
from app.main import create_app
from app.models import Base
from app.services.encryption import ContactCipher
from app.services.storage import LocalStorage


class FakeNotifier:
    def __init__(self) -> None:
        self.messages: list[tuple[int, str]] = []

    async def send_message(self, telegram_id: int, text: str) -> None:
        self.messages.append((telegram_id, text))


@pytest.fixture
def settings(tmp_path) -> Settings:
    return Settings(
        app_env="test",
        bot_token="123456:TESTTOKEN",
        bot_mode="disabled",
        allow_dev_auth_bypass=True,
        contact_encryption_key=Fernet.generate_key().decode(),
        force_https=False,
        redis_url="",
        database_url=f"sqlite+aiosqlite:///{tmp_path / 'unused.db'}",
        rate_limit_requests=1000,
        rate_limit_reports=1000,
        admin_telegram_ids="9001",
        moderator_telegram_ids="9002",
        local_storage_path=str(tmp_path / "evidence"),
        webapp_url="https://localhost/app",
        auto_create_db=False,
    )


@pytest.fixture
async def api(settings: Settings, tmp_path):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'test.db'}")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    maker = async_sessionmaker(engine, expire_on_commit=False)
    application = create_app(settings)
    application.state.sessionmaker = maker
    application.state.limiter = __import__("app.core.rate_limit", fromlist=["MemoryRateLimiter"]).MemoryRateLimiter()
    application.state.storage = LocalStorage(str(tmp_path / "evidence"))
    application.state.cipher = ContactCipher(settings.contact_encryption_key)
    application.state.notifier = FakeNotifier()
    transport = ASGITransport(app=application)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield {"client": client, "app": application, "settings": settings}
    await engine.dispose()


@pytest.fixture
def auth_header():
    def _build(user_id: int = 42) -> dict[str, str]:
        return {"X-Dev-User-Id": str(user_id)}

    return _build

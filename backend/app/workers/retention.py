from __future__ import annotations

import asyncio

from app.core.config import get_settings
from app.core.db import make_engine, make_sessionmaker
from app.core.logging import configure_logging, log_event
from app.services.reports import purge_expired
from app.services.storage import make_storage


async def run() -> int:
    settings = get_settings()
    configure_logging(settings)
    engine = make_engine(settings.database_url)
    maker = make_sessionmaker(engine)
    storage = make_storage(settings)
    try:
        async with maker() as session:
            deleted = await purge_expired(session, storage, settings.retention_days)
    finally:
        await engine.dispose()
    log_event("retention_complete", deleted=deleted)
    return deleted


def main() -> None:
    asyncio.run(run())


if __name__ == "__main__":
    main()

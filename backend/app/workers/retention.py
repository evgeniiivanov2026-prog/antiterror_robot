"""Delete incident cards older than RETENTION_DAYS. Run from cron, not on each request."""

import asyncio
import json
import logging

from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import get_settings
from app.core.logging import configure_logging
from app.services.retention import purge_expired
from app.services.storage import build_storage

logger = logging.getLogger(__name__)


async def run() -> int:
    settings = get_settings()
    configure_logging(settings.log_level)
    engine = create_async_engine(settings.database_url, pool_pre_ping=True)
    maker = async_sessionmaker(engine, expire_on_commit=False)
    storage = build_storage(settings)
    try:
        async with maker() as session:
            removed = await purge_expired(session, storage, settings.retention_days)
            await session.commit()
    finally:
        await engine.dispose()
    logger.info("retention finished", extra={"event": "retention_complete"})
    print(json.dumps({"event": "retention_complete", "removed_reports": removed}, ensure_ascii=False))
    return removed


def main() -> None:
    asyncio.run(run())


if __name__ == "__main__":
    main()

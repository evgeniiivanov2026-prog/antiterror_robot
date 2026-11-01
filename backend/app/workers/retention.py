"""Delete expired incident cards and emergency markers."""

import asyncio
import logging

from app.core.database import get_sessionmaker
from app.core.logging import setup_logging
from app.services.retention import purge_expired

logger = logging.getLogger(__name__)


async def run() -> None:
    setup_logging()
    async with get_sessionmaker()() as session:
        result = await purge_expired(session)
    logger.info(
        "retention_done",
        extra={"reports": result["reports"], "emergency_events": result["emergency_events"]},
    )


def main() -> None:
    asyncio.run(run())


if __name__ == "__main__":
    main()

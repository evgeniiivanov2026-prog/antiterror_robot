#!/bin/sh
set -eu

python - <<'PY'
import asyncio
import sys
import time

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from app.core.config import get_settings

async def wait_for_database() -> None:
    settings = get_settings()
    if settings.database_url.startswith("sqlite"):
        return
    engine = create_async_engine(settings.database_url, pool_pre_ping=True)
    last_error: Exception | None = None
    for _ in range(30):
        try:
            async with engine.connect() as connection:
                await connection.execute(text("SELECT 1"))
            await engine.dispose()
            return
        except Exception as exc:  # noqa: BLE001 - startup retry
            last_error = exc
            await engine.dispose()
            engine = create_async_engine(settings.database_url, pool_pre_ping=True)
            time.sleep(1)
    await engine.dispose()
    print(f"database is not ready: {last_error}", file=sys.stderr)
    sys.exit(1)

asyncio.run(wait_for_database())
PY

if [ "${AUTO_CREATE_DB:-false}" != "true" ]; then
  alembic upgrade head
fi

exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --no-access-log

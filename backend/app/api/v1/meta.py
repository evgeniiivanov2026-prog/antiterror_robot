from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import client_key, enforce_rate_limit
from app.core.db import get_session
from app.core.labels import CATEGORIES

router = APIRouter()


@router.get("/health")
async def health(session: AsyncSession = Depends(get_session)) -> dict:
    await session.execute(text("SELECT 1"))
    return {"status": "ok"}


@router.get("/meta/categories")
async def categories(request: Request) -> dict:
    settings = request.app.state.settings
    await enforce_rate_limit(
        request,
        f"meta:{client_key(request)}",
        settings.rate_limit_reads,
        settings.read_window_seconds,
    )
    return {"categories": CATEGORIES}

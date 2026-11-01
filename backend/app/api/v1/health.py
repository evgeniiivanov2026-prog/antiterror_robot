import logging

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.errors import AppError

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/health")
async def health(session: AsyncSession = Depends(get_session)) -> dict[str, str]:
    try:
        await session.execute(text("SELECT 1"))
    except Exception as exc:
        logger.error("health_failed", extra={"error_type": type(exc).__name__})
        raise AppError("unavailable", "Сервис временно недоступен.", 503) from exc
    return {"status": "ok"}

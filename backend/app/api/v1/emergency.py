from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import enforce_rate_limit, get_identity
from app.core.db import get_session
from app.core.logging import log_event
from app.core.security import TelegramIdentity, actor_hash
from app.schemas.emergency import EmergencyIn, EmergencyOut
from app.services.emergency import record_emergency

router = APIRouter()


@router.post("/emergency", response_model=EmergencyOut, status_code=201)
async def create_emergency(
    payload: EmergencyIn,
    request: Request,
    identity: TelegramIdentity = Depends(get_identity),
    session: AsyncSession = Depends(get_session),
) -> EmergencyOut:
    settings = request.app.state.settings
    await enforce_rate_limit(
        request,
        f"emergency:{identity.telegram_id}",
        settings.rate_limit_emergency,
        settings.rate_limit_window_seconds,
    )
    event = await record_emergency(session, identity.telegram_id, payload)
    log_event(
        "emergency_recorded",
        actor=actor_hash(identity.telegram_id, settings.log_hash_salt),
        trigger=payload.trigger,
    )
    return event

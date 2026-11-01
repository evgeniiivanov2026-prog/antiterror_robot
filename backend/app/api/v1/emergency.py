from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_session
from app.core.copy import DISCLAIMER, EMERGENCY_PHONES, IMMEDIATE_DANGER, MINOR_GUIDANCE, SUPPORT_CONTACTS
from app.models.emergency import EmergencyEvent
from app.models.user import User
from app.schemas.emergency import EmergencyCreate, EmergencyResponse, PhoneContact

router = APIRouter(tags=["emergency"])


@router.post("/emergency", response_model=EmergencyResponse, status_code=201)
async def create_emergency(
    payload: EmergencyCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> EmergencyResponse:
    event = EmergencyEvent(user_id=user.id, source=payload.source)
    session.add(event)
    await session.flush()
    return EmergencyResponse(
        id=event.id,
        created_at=event.created_at,
        phones=[PhoneContact.model_validate(item) for item in EMERGENCY_PHONES],
        support_contacts=[PhoneContact.model_validate(item) for item in SUPPORT_CONTACTS],
        minor_guidance=MINOR_GUIDANCE,
        disclaimer=DISCLAIMER,
        immediate_danger=IMMEDIATE_DANGER,
    )

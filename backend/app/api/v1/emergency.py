from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_session
from app.models.user import UserAccount
from app.schemas.report import EmergencyContact, EmergencyCreate, EmergencyResponse
from app.services.emergency import EMERGENCY_CONTACTS, EMERGENCY_NOTICE, register_emergency

router = APIRouter()


@router.post("/emergency", response_model=EmergencyResponse)
async def emergency(
    payload: EmergencyCreate,
    user: UserAccount = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> EmergencyResponse:
    recorded = await register_emergency(session, user.telegram_id, payload.source)
    return EmergencyResponse(
        contacts=[EmergencyContact.model_validate(item) for item in EMERGENCY_CONTACTS],
        recorded=recorded,
        notice=EMERGENCY_NOTICE,
    )

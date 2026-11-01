from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_session
from app.models.user import UserAccount
from app.schemas.report import RoleResponse, RoleUpdate
from app.services.roles import set_role

router = APIRouter()


@router.post("/admin/roles", response_model=RoleResponse)
async def update_role(
    payload: RoleUpdate,
    user: UserAccount = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> RoleResponse:
    updated = await set_role(session, user, payload.telegram_id, payload.role)
    return RoleResponse(telegram_id=updated.telegram_id, role=updated.role)

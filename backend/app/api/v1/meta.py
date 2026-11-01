from fastapi import APIRouter, Depends

from app.api.deps import get_current_user
from app.models.user import UserAccount
from app.schemas.report import CategoryItem
from app.services.catalog import categories_payload

router = APIRouter()


@router.get("/meta/categories", response_model=list[CategoryItem])
async def list_categories(_user: UserAccount = Depends(get_current_user)) -> list[dict[str, object]]:
    return categories_payload()

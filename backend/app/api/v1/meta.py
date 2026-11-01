from fastapi import APIRouter

from app.core.copy import CATEGORIES, DISCLAIMER
from app.schemas.meta import CategoryList, CategoryMeta

router = APIRouter(prefix="/meta", tags=["meta"])


@router.get("/categories", response_model=CategoryList)
async def categories() -> CategoryList:
    return CategoryList(
        categories=[CategoryMeta.model_validate(item) for item in CATEGORIES],
        disclaimer=DISCLAIMER,
    )

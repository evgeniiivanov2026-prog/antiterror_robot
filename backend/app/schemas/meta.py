from pydantic import BaseModel


class CategoryMeta(BaseModel):
    id: str
    title: str
    description: str
    emergency: bool


class CategoryList(BaseModel):
    categories: list[CategoryMeta]
    disclaimer: str


class SessionProfile(BaseModel):
    role: str
    telegram_id: int

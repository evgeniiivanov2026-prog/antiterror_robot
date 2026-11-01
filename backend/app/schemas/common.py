from typing import Any

from pydantic import BaseModel, ConfigDict


class ErrorDetail(BaseModel):
    field: str
    message: str


class ErrorBody(BaseModel):
    code: str
    message: str
    details: list[ErrorDetail] = []


class ErrorResponse(BaseModel):
    error: ErrorBody


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid")


def empty_dict() -> dict[str, Any]:
    return {}

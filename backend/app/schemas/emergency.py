from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class EmergencyCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source: Literal["miniapp", "bot"] = "miniapp"


class PhoneContact(BaseModel):
    number: str
    tel: str
    title: str
    description: str


class EmergencyResponse(BaseModel):
    id: UUID
    created_at: datetime
    phones: list[PhoneContact]
    support_contacts: list[PhoneContact]
    minor_guidance: str
    disclaimer: str
    immediate_danger: str


class HealthResponse(BaseModel):
    status: str = Field(examples=["ok"])

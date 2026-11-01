from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class EmergencyIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    trigger: Literal["manual", "keyword", "category"]


class EmergencyOut(BaseModel):
    id: UUID
    trigger: str
    created_at: datetime
    message: str

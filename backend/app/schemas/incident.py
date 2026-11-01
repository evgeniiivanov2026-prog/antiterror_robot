"""Input and output shapes for an incident card."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.incident import Category, ContactChannel, ReportStatus, ThreatLevel


class SuspectIdentifiers(BaseModel):
    model_config = ConfigDict(extra="forbid")

    platform: str | None = Field(default=None, max_length=80)
    username: str | None = Field(default=None, max_length=64)
    display_name: str | None = Field(default=None, max_length=80)
    url: str | None = Field(default=None, max_length=500)
    phone: str | None = Field(default=None, max_length=20)
    note: str | None = Field(default=None, max_length=300)


class Demands(BaseModel):
    model_config = ConfigDict(extra="forbid")

    summary: str | None = Field(default=None, max_length=1000)
    money_requested: bool = False
    meeting_requested: bool = False
    intimate_material_requested: bool = False
    secrecy_requested: bool = False
    other: str | None = Field(default=None, max_length=300)


class ReportCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    category: Category
    description: str = Field(min_length=10, max_length=4000)
    occurred_at: datetime | None = None
    platform: str = Field(default="", max_length=80)
    source_url: str | None = Field(default=None, max_length=500)
    suspect_identifiers: SuspectIdentifiers | None = None
    demands: Demands | None = None
    contact_consent: bool = False
    contact_channel: ContactChannel | None = None
    contact_value: str | None = Field(default=None, max_length=254)

    @field_validator("description", "platform")
    @classmethod
    def _strip(cls, value: str) -> str:
        return value.strip()


class EvidenceOut(BaseModel):
    id: UUID
    file_type: str
    mime_type: str
    size_bytes: int
    checksum_prefix: str
    uploaded_at: datetime


class IncidentCard(BaseModel):
    id: UUID
    public_id: str
    category: Category
    description: str
    occurred_at: datetime | None
    platform: str
    source_url: str | None
    suspect_identifiers: SuspectIdentifiers | None
    demands: Demands | None
    threat_level: ThreatLevel
    contact_consent: bool
    contact_channel: ContactChannel | None
    contact_hint: str | None
    status: ReportStatus
    created_at: datetime
    updated_at: datetime
    evidence: list[EvidenceOut]
    disclaimer: str
    mvd_recommendation: str
    urgency_note: str


class ModerationReport(BaseModel):
    id: UUID
    public_id: str
    category: Category
    threat_level: ThreatLevel
    status: ReportStatus
    created_at: datetime


class CloseReport(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["under_review", "closed"]
    reason: Literal["spam", "duplicate", "user_request", "completeness", "other"]

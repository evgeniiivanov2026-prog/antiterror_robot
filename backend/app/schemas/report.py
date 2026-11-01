from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.core.labels import COMPLIED_NOTICE, SAFETY_NOTICE
from app.core.sensitive import ensure_no_secrets
from app.core.text import clean_text
from app.core.urls import validate_public_url

Platform = Literal["telegram", "vk", "whatsapp", "phone", "email", "website", "other"]
Category = Literal[
    "recruitment",
    "fraud",
    "blackmail",
    "suspicious_account",
    "witness",
    "emergency",
]
DemandKind = Literal["none", "money", "personal_data", "meeting", "actions", "other"]
ContactChannel = Literal["telegram", "phone", "email"]
ReportStatus = Literal["new", "under_review", "forwarded", "closed"]


def _secret_free(value: str) -> str:
    ensure_no_secrets(value)
    return value


class SuspectIdentifiers(BaseModel):
    model_config = ConfigDict(extra="forbid")

    display_name: str = ""
    username: str = ""
    platform_id: str = ""
    phone: str = ""
    channel: str = ""
    note: str = ""

    @field_validator("display_name", "username", "platform_id", "phone", "channel", "note")
    @classmethod
    def _clean(cls, value: str) -> str:
        cleaned = clean_text(value, 200)
        return _secret_free(cleaned)


class Demands(BaseModel):
    model_config = ConfigDict(extra="forbid")

    asked_for: DemandKind = "none"
    summary: str = ""
    user_complied: bool = False

    @field_validator("summary")
    @classmethod
    def _summary(cls, value: str) -> str:
        return _secret_free(clean_text(value, 1000))


class ReportCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    category: Category
    description: str
    occurred_at: datetime | None = None
    platform: Platform
    source_url: str | None = None
    suspect_identifiers: SuspectIdentifiers | None = None
    demands: Demands = Field(default_factory=Demands)
    contact_consent: bool = False
    contact_channel: ContactChannel | None = None
    contact_value: str | None = None
    immediate_danger: bool = False

    @field_validator("description")
    @classmethod
    def _description(cls, value: str) -> str:
        cleaned = _secret_free(clean_text(value, 4000))
        if len(cleaned) < 20:
            raise ValueError("Опишите ситуацию хотя бы в нескольких словах")
        return cleaned

    @field_validator("source_url")
    @classmethod
    def _url(cls, value: str | None) -> str | None:
        if value is None or not value.strip():
            return None
        return validate_public_url(value)

    @field_validator("occurred_at")
    @classmethod
    def _when(cls, value: datetime | None) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        now = datetime.now(timezone.utc)
        if value > now + timedelta(days=1):
            raise ValueError("Время события не может быть в будущем")
        if value.year < 2000:
            raise ValueError("Проверьте дату события")
        return value

    @field_validator("contact_value")
    @classmethod
    def _contact(cls, value: str | None) -> str | None:
        if value is None or not value.strip():
            return None
        cleaned = _secret_free(clean_text(value, 120))
        return cleaned

    @model_validator(mode="after")
    def _consent(self) -> ReportCreate:
        if not self.contact_consent:
            self.contact_channel = None
            self.contact_value = None
            return self
        if self.contact_channel is None or not self.contact_value:
            raise ValueError("Укажите канал и контакт или отключите сохранение контакта")
        self.contact_value = _validate_channel(self.contact_channel, self.contact_value)
        return self


def _validate_channel(channel: str, value: str) -> str:
    if channel == "email":
        if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", value):
            raise ValueError("Проверьте адрес почты")
    elif channel == "phone":
        digits = re.sub(r"\D", "", value)
        if not 10 <= len(digits) <= 15:
            raise ValueError("Проверьте номер телефона")
    elif channel == "telegram":
        if not re.fullmatch(r"@?[A-Za-z0-9_]{5,32}", value):
            raise ValueError("Укажите Telegram-имя без лишних символов")
    return value


class EvidenceOut(BaseModel):
    id: UUID
    file_type: str
    mime_type: str
    size_bytes: int
    checksum: str
    uploaded_at: datetime


class ReportOut(BaseModel):
    id: UUID
    public_id: str
    category: str
    description: str
    occurred_at: datetime | None
    platform: str
    source_url: str | None
    suspect_identifiers: dict | None
    demands: dict
    threat_level: str
    status: str
    contact_consent: bool
    contact_channel: str | None
    contact_value: str | None
    created_at: datetime
    updated_at: datetime
    evidence: list[EvidenceOut]
    emergency_recommended: bool
    safety_notice: str


class StatusUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: ReportStatus
    note: str = ""

    @field_validator("note")
    @classmethod
    def _note(cls, value: str) -> str:
        return _secret_free(clean_text(value, 300))


def safety_notice_for(demands: dict | None) -> str:
    if demands and demands.get("user_complied"):
        return f"{SAFETY_NOTICE} {COMPLIED_NOTICE}"
    return SAFETY_NOTICE

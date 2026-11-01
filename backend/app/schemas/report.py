from datetime import datetime, timedelta, timezone
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.enums import ContactChannel, IncidentCategory, ReportStatus, ThreatLevel
from app.services.contacts import normalize_contact
from app.services.text_safety import find_forbidden_secret, is_low_entropy, sanitize_text
from app.services.urls import validate_public_http_url


class SuspectInfo(BaseModel):
    model_config = ConfigDict(extra="forbid")

    display_name: str | None = Field(default=None, max_length=120)
    username: str | None = Field(default=None, max_length=64)
    platform_id: str | None = Field(default=None, max_length=64)
    channel: str | None = Field(default=None, max_length=120)
    phone: str | None = Field(default=None, max_length=32)
    note: str | None = Field(default=None, max_length=300)

    @model_validator(mode="after")
    def clean(self) -> "SuspectInfo":
        for field_name in ("display_name", "username", "platform_id", "channel", "phone", "note"):
            raw = getattr(self, field_name)
            if raw is None:
                continue
            text = sanitize_text(raw)
            secret = find_forbidden_secret(text) if text else None
            if secret:
                raise ValueError(secret)
            setattr(self, field_name, text or None)
        return self

    def is_empty(self) -> bool:
        return not any(
            getattr(self, field_name)
            for field_name in ("display_name", "username", "platform_id", "channel", "phone", "note")
        )

    def as_dict(self) -> dict[str, str]:
        return {
            field_name: value
            for field_name in ("display_name", "username", "platform_id", "channel", "phone", "note")
            if (value := getattr(self, field_name))
        }


class DemandsInfo(BaseModel):
    model_config = ConfigDict(extra="forbid")

    summary: str = Field(default="", max_length=1000)
    asked_for_money: bool = False
    asked_for_meeting: bool = False
    asked_for_secrecy: bool = False
    asked_to_click_link: bool = False

    @field_validator("summary")
    @classmethod
    def clean_summary(cls, value: str) -> str:
        text = sanitize_text(value)
        secret = find_forbidden_secret(text) if text else None
        if secret:
            raise ValueError(secret)
        return text


class ReportCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    category: IncidentCategory
    description: str = Field(min_length=1, max_length=5000)
    occurred_at: datetime | None = None
    platform: str = Field(min_length=1, max_length=80)
    source_url: str | None = None
    suspect: SuspectInfo | None = None
    demands: DemandsInfo = Field(default_factory=DemandsInfo)
    contact_consent: bool = False
    contact_channel: ContactChannel | None = None
    contact_value: str | None = Field(default=None, max_length=120)

    @field_validator("description")
    @classmethod
    def clean_description(cls, value: str) -> str:
        text = sanitize_text(value)
        if len(text) < 20:
            raise ValueError("Опишите ситуацию чуть подробнее — хотя бы несколько предложений.")
        if len(text) > 4000:
            raise ValueError("Сократите текст до 4000 символов.")
        secret = find_forbidden_secret(text)
        if secret:
            raise ValueError(secret)
        if is_low_entropy(text):
            raise ValueError("Похоже на случайный набор символов. Опишите ситуацию обычными словами.")
        return text

    @field_validator("platform")
    @classmethod
    def clean_platform(cls, value: str) -> str:
        text = sanitize_text(value)
        if len(text) < 2:
            raise ValueError("Укажите, где это произошло: Telegram, сайт, звонок или другое.")
        return text

    @field_validator("source_url")
    @classmethod
    def clean_url(cls, value: str | None) -> str | None:
        return validate_public_http_url(value)

    @field_validator("occurred_at")
    @classmethod
    def clean_time(cls, value: datetime | None) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        now = datetime.now(timezone.utc)
        if value > now + timedelta(days=1):
            raise ValueError("Дата не может быть в будущем.")
        if value < now - timedelta(days=3650):
            raise ValueError("Дата слишком далеко в прошлом.")
        return value

    @model_validator(mode="after")
    def clean_contact(self) -> "ReportCreate":
        if not self.contact_consent:
            self.contact_channel = None
            self.contact_value = None
            return self
        if self.contact_channel is None or not self.contact_value:
            raise ValueError("Если нужна обратная связь, укажите способ и контакт.")
        normalized = normalize_contact(self.contact_channel.value, self.contact_value)
        secret = find_forbidden_secret(normalized)
        if secret:
            raise ValueError(secret)
        self.contact_value = normalized
        return self


class StatusUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: ReportStatus


class EvidenceResponse(BaseModel):
    id: UUID
    file_type: str
    mime_type: str
    size_bytes: int
    checksum: str
    uploaded_at: datetime


class ReportResponse(BaseModel):
    id: UUID
    public_id: str
    category: IncidentCategory
    description: str
    occurred_at: datetime | None
    platform: str
    source_url: str | None
    suspect: SuspectInfo | None
    demands: DemandsInfo
    threat_level: ThreatLevel
    contact_consent: bool
    contact_channel: ContactChannel | None
    contact_masked: str | None
    status: ReportStatus
    evidence: list[EvidenceResponse]
    created_at: datetime
    updated_at: datetime
    disclaimer: str
    safety_notice: str


class CategoryItem(BaseModel):
    id: IncidentCategory
    title: str
    description: str
    suggests_emergency: bool


class EmergencyCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source: str = "mini_app"

    @field_validator("source")
    @classmethod
    def known_source(cls, value: str) -> str:
        if value not in {"mini_app", "bot"}:
            raise ValueError("Неизвестный источник.")
        return value


class EmergencyContact(BaseModel):
    label: str
    phone: str
    note: str


class EmergencyResponse(BaseModel):
    contacts: list[EmergencyContact]
    recorded: bool
    notice: str


class RoleUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    telegram_id: int = Field(gt=0)
    role: str

    @field_validator("role")
    @classmethod
    def known_role(cls, value: str) -> str:
        if value not in {"user", "moderator", "admin"}:
            raise ValueError("Неизвестная роль.")
        return value


class RoleResponse(BaseModel):
    telegram_id: int
    role: str

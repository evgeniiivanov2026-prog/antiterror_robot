"""Incident card. This is a user record, not a police case."""

import enum
import uuid
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Enum, ForeignKey, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

if TYPE_CHECKING:
    from app.models.evidence import EvidenceFile

from app.models.base import Base, json_type, timestamp_column, utcnow


class Category(str, enum.Enum):
    recruitment = "recruitment"
    fraud = "fraud"
    blackmail = "blackmail"
    suspicious_account = "suspicious_account"
    witness = "witness"
    emergency = "emergency"


class ThreatLevel(str, enum.Enum):
    low = "low"
    elevated = "elevated"
    high = "high"
    immediate = "immediate"


class ReportStatus(str, enum.Enum):
    new = "new"
    under_review = "under_review"
    forwarded = "forwarded"
    closed = "closed"


class ContactChannel(str, enum.Enum):
    telegram = "telegram"
    email = "email"
    phone = "phone"


def _enum(enum_cls: type[enum.Enum], length: int = 32):
    return Enum(
        enum_cls,
        native_enum=False,
        length=length,
        values_callable=lambda items: [item.value for item in items],
    )


class IncidentReport(Base):
    __tablename__ = "incident_reports"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    public_id: Mapped[str] = mapped_column(String(16), unique=True, index=True)
    owner_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id"), index=True)
    category: Mapped[Category] = mapped_column(_enum(Category))
    description: Mapped[str] = mapped_column(Text)
    occurred_at: Mapped[object | None] = mapped_column(timestamp_column(), nullable=True)
    platform: Mapped[str] = mapped_column(String(80), default="")
    source_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    suspect_identifiers: Mapped[dict | None] = mapped_column(json_type(), nullable=True)
    demands: Mapped[dict | None] = mapped_column(json_type(), nullable=True)
    threat_level: Mapped[ThreatLevel] = mapped_column(_enum(ThreatLevel))
    contact_consent: Mapped[bool] = mapped_column(Boolean, default=False)
    contact_channel: Mapped[ContactChannel | None] = mapped_column(_enum(ContactChannel), nullable=True)
    contact_value_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[ReportStatus] = mapped_column(_enum(ReportStatus), default=ReportStatus.new)
    created_at: Mapped[object] = mapped_column(timestamp_column(), default=utcnow, index=True)
    updated_at: Mapped[object] = mapped_column(timestamp_column(), default=utcnow)

    evidence_files: Mapped[list["EvidenceFile"]] = relationship(
        back_populates="report",
        cascade="all, delete-orphan",
        order_by="EvidenceFile.uploaded_at",
    )

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, String, Text, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from app.models.time import utcnow

JSONType = JSON().with_variant(JSONB(), "postgresql")


class IncidentReport(Base):
    __tablename__ = "incident_reports"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    public_id: Mapped[str] = mapped_column(String(16), unique=True, index=True)
    owner_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("app_users.id"))
    category: Mapped[str] = mapped_column(String(32), index=True)
    description: Mapped[str] = mapped_column(Text)
    occurred_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    platform: Mapped[str] = mapped_column(String(32))
    source_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    suspect_identifiers: Mapped[dict | None] = mapped_column(JSONType, nullable=True)
    demands: Mapped[dict] = mapped_column(JSONType)
    threat_level: Mapped[str] = mapped_column(String(32), default="low")
    contact_consent: Mapped[bool] = mapped_column(Boolean, default=False)
    contact_channel: Mapped[str | None] = mapped_column(String(32), nullable=True)
    contact_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="new", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    evidence_files: Mapped[list["EvidenceFile"]] = relationship(
        "EvidenceFile",
        back_populates="incident_report",
        cascade="all, delete-orphan",
    )

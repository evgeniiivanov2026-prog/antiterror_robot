import uuid
from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from app.models.enums import ReportStatus
from app.models.types import JSONType


class IncidentReport(Base):
    __tablename__ = "incident_reports"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    public_id: Mapped[str] = mapped_column(String(16), unique=True, index=True)
    owner_telegram_id: Mapped[int] = mapped_column(BigInteger, index=True)
    category: Mapped[str] = mapped_column(String(32))
    description: Mapped[str] = mapped_column(Text)
    occurred_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    platform: Mapped[str] = mapped_column(String(80))
    source_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    suspect_identifiers: Mapped[dict | None] = mapped_column(JSONType, nullable=True)
    demands: Mapped[dict] = mapped_column(JSONType)
    threat_level: Mapped[str] = mapped_column(String(16))
    contact_consent: Mapped[bool] = mapped_column(Boolean, default=False)
    contact_channel: Mapped[str | None] = mapped_column(String(16), nullable=True)
    contact_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(32), default=ReportStatus.NEW.value, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    evidence_files: Mapped[list["EvidenceFile"]] = relationship(
        back_populates="report",
        cascade="all, delete-orphan",
    )

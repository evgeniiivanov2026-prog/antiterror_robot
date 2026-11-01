"""Stored evidence metadata. The object key is never derived from the original filename."""

import enum
import uuid
from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, Enum, ForeignKey, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

if TYPE_CHECKING:
    from app.models.incident import IncidentReport

from app.models.base import Base, timestamp_column, utcnow


class EvidenceType(str, enum.Enum):
    image = "image"
    video = "video"
    audio = "audio"
    document = "document"


class EvidenceFile(Base):
    __tablename__ = "evidence_files"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    incident_report_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("incident_reports.id", ondelete="CASCADE"),
        index=True,
    )
    file_type: Mapped[EvidenceType] = mapped_column(
        Enum(
            EvidenceType,
            native_enum=False,
            length=16,
            values_callable=lambda items: [item.value for item in items],
        )
    )
    storage_key: Mapped[str] = mapped_column(String(255), unique=True)
    mime_type: Mapped[str] = mapped_column(String(80))
    size_bytes: Mapped[int] = mapped_column(BigInteger)
    checksum: Mapped[str] = mapped_column(String(64))
    uploaded_at: Mapped[object] = mapped_column(timestamp_column(), default=utcnow)

    report: Mapped["IncidentReport"] = relationship(back_populates="evidence_files")

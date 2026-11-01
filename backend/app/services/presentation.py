"""Map stored rows to API responses. Contact values leave the process only masked."""

from app.models.incident import IncidentReport
from app.schemas.report import DemandsInfo, EvidenceResponse, ReportResponse, SuspectInfo
from app.services.catalog import DISCLAIMER, SAFETY_NOTICE
from app.services.contacts import mask_contact
from app.services.crypto import decrypt_text


def to_report_response(report: IncidentReport) -> ReportResponse:
    contact_masked = None
    if report.contact_consent and report.contact_value and report.contact_channel:
        try:
            contact_masked = mask_contact(report.contact_channel, decrypt_text(report.contact_value))
        except ValueError:
            contact_masked = "***"
    suspect = SuspectInfo.model_validate(report.suspect_identifiers) if report.suspect_identifiers else None
    evidence = [
        EvidenceResponse(
            id=item.id,
            file_type=item.file_type,
            mime_type=item.mime_type,
            size_bytes=item.size_bytes,
            checksum=item.checksum,
            uploaded_at=item.uploaded_at,
        )
        for item in sorted(report.evidence_files, key=lambda row: row.uploaded_at)
    ]
    return ReportResponse(
        id=report.id,
        public_id=report.public_id,
        category=report.category,
        description=report.description,
        occurred_at=report.occurred_at,
        platform=report.platform,
        source_url=report.source_url,
        suspect=suspect,
        demands=DemandsInfo.model_validate(report.demands),
        threat_level=report.threat_level,
        contact_consent=report.contact_consent,
        contact_channel=report.contact_channel,
        contact_masked=contact_masked,
        status=report.status,
        evidence=evidence,
        created_at=report.created_at,
        updated_at=report.updated_at,
        disclaimer=DISCLAIMER,
        safety_notice=SAFETY_NOTICE,
    )

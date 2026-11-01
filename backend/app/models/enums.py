from enum import Enum


class IncidentCategory(str, Enum):
    RECRUITMENT = "recruitment"
    FRAUD = "fraud"
    BLACKMAIL = "blackmail"
    SUSPICIOUS_ACCOUNT = "suspicious_account"
    WITNESS = "witness"
    EMERGENCY = "emergency"


class ThreatLevel(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class ReportStatus(str, Enum):
    NEW = "new"
    UNDER_REVIEW = "under_review"
    FORWARDED = "forwarded"
    CLOSED = "closed"


class ContactChannel(str, Enum):
    TELEGRAM = "telegram"
    PHONE = "phone"
    EMAIL = "email"


class UserRole(str, Enum):
    USER = "user"
    MODERATOR = "moderator"
    ADMIN = "admin"


class EvidenceType(str, Enum):
    IMAGE = "image"
    VIDEO = "video"
    AUDIO = "audio"
    DOCUMENT = "document"

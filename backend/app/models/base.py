"""Shared SQLAlchemy types that work on PostgreSQL and the SQLite test database."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, DateTime
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


def json_type():
    return JSON().with_variant(JSONB, "postgresql")


def timestamp_column():
    return DateTime(timezone=True)


def new_uuid() -> uuid.UUID:
    return uuid.uuid4()

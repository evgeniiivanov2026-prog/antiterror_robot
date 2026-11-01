"""Initial schema for incident cards, evidence, and audit.

Revision ID: 001_initial
Revises:
Create Date: 2026-11-01
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("telegram_id", sa.BigInteger(), nullable=False),
        sa.Column("role", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_users_telegram_id", "users", ["telegram_id"], unique=True)

    op.create_table(
        "incident_reports",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("public_id", sa.String(length=16), nullable=False),
        sa.Column("owner_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("category", sa.String(length=32), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("platform", sa.String(length=80), nullable=False),
        sa.Column("source_url", sa.String(length=500), nullable=True),
        sa.Column("suspect_identifiers", postgresql.JSONB(), nullable=True),
        sa.Column("demands", postgresql.JSONB(), nullable=True),
        sa.Column("threat_level", sa.String(length=32), nullable=False),
        sa.Column("contact_consent", sa.Boolean(), nullable=False),
        sa.Column("contact_channel", sa.String(length=32), nullable=True),
        sa.Column("contact_value_encrypted", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_incident_reports_public_id", "incident_reports", ["public_id"], unique=True)
    op.create_index("ix_incident_reports_owner_id", "incident_reports", ["owner_id"])
    op.create_index("ix_incident_reports_created_at", "incident_reports", ["created_at"])

    op.create_table(
        "evidence_files",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "incident_report_id",
            sa.Uuid(),
            sa.ForeignKey("incident_reports.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("file_type", sa.String(length=16), nullable=False),
        sa.Column("storage_key", sa.String(length=255), nullable=False),
        sa.Column("mime_type", sa.String(length=80), nullable=False),
        sa.Column("size_bytes", sa.BigInteger(), nullable=False),
        sa.Column("checksum", sa.String(length=64), nullable=False),
        sa.Column("uploaded_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_evidence_files_incident_report_id", "evidence_files", ["incident_report_id"])
    op.create_index("ix_evidence_files_storage_key", "evidence_files", ["storage_key"], unique=True)

    op.create_table(
        "emergency_events",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("source", sa.String(length=16), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_emergency_events_user_id", "emergency_events", ["user_id"])

    op.create_table(
        "audit_logs",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("actor_user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("action", sa.String(length=64), nullable=False),
        sa.Column("target_type", sa.String(length=32), nullable=False),
        sa.Column("target_id", sa.String(length=64), nullable=True),
        sa.Column("meta", postgresql.JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("audit_logs")
    op.drop_table("emergency_events")
    op.drop_table("evidence_files")
    op.drop_table("incident_reports")
    op.drop_table("users")

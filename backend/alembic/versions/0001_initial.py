"""Initial schema.

Revision ID: 0001_initial
Revises:
Create Date: 2026-11-01
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "app_users",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("telegram_id", sa.BigInteger(), nullable=False),
        sa.Column("role", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_app_users_telegram_id", "app_users", ["telegram_id"], unique=True)

    op.create_table(
        "incident_reports",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("public_id", sa.String(length=16), nullable=False),
        sa.Column("owner_id", sa.Uuid(), sa.ForeignKey("app_users.id"), nullable=False),
        sa.Column("category", sa.String(length=32), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("platform", sa.String(length=32), nullable=False),
        sa.Column("source_url", sa.String(length=500), nullable=True),
        sa.Column("suspect_identifiers", postgresql.JSONB(), nullable=True),
        sa.Column("demands", postgresql.JSONB(), nullable=False),
        sa.Column("threat_level", sa.String(length=32), nullable=False),
        sa.Column("contact_consent", sa.Boolean(), nullable=False),
        sa.Column("contact_channel", sa.String(length=32), nullable=True),
        sa.Column("contact_value", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_incident_reports_public_id", "incident_reports", ["public_id"], unique=True)
    op.create_index("ix_incident_reports_category", "incident_reports", ["category"])
    op.create_index("ix_incident_reports_status", "incident_reports", ["status"])
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
        sa.Column("file_type", sa.String(length=32), nullable=False),
        sa.Column("storage_key", sa.String(length=255), nullable=False),
        sa.Column("mime_type", sa.String(length=128), nullable=False),
        sa.Column("size_bytes", sa.BigInteger(), nullable=False),
        sa.Column("checksum", sa.String(length=64), nullable=False),
        sa.Column("uploaded_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_evidence_files_incident_report_id", "evidence_files", ["incident_report_id"])
    op.create_index("ix_evidence_files_storage_key", "evidence_files", ["storage_key"], unique=True)

    op.create_table(
        "emergency_events",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("actor_telegram_id", sa.BigInteger(), nullable=False),
        sa.Column("trigger", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_emergency_events_actor_telegram_id", "emergency_events", ["actor_telegram_id"])
    op.create_index("ix_emergency_events_created_at", "emergency_events", ["created_at"])

    op.create_table(
        "audit_logs",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("actor_telegram_id", sa.BigInteger(), nullable=False),
        sa.Column("action", sa.String(length=64), nullable=False),
        sa.Column("target_type", sa.String(length=64), nullable=False),
        sa.Column("target_id", sa.String(length=64), nullable=False),
        sa.Column("meta", postgresql.JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_audit_logs_actor_telegram_id", "audit_logs", ["actor_telegram_id"])
    op.create_index("ix_audit_logs_created_at", "audit_logs", ["created_at"])


def downgrade() -> None:
    op.drop_table("audit_logs")
    op.drop_table("emergency_events")
    op.drop_table("evidence_files")
    op.drop_table("incident_reports")
    op.drop_table("app_users")

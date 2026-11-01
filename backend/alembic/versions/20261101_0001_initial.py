"""Initial incident, evidence, user, emergency, and audit tables."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20261101_0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "user_accounts",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("telegram_id", sa.BigInteger(), nullable=False),
        sa.Column("role", sa.String(length=16), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_user_accounts_telegram_id", "user_accounts", ["telegram_id"], unique=True)

    op.create_table(
        "incident_reports",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("public_id", sa.String(length=16), nullable=False),
        sa.Column("owner_telegram_id", sa.BigInteger(), nullable=False),
        sa.Column("category", sa.String(length=32), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("platform", sa.String(length=80), nullable=False),
        sa.Column("source_url", sa.String(length=500), nullable=True),
        sa.Column("suspect_identifiers", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("demands", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("threat_level", sa.String(length=16), nullable=False),
        sa.Column("contact_consent", sa.Boolean(), nullable=False),
        sa.Column("contact_channel", sa.String(length=16), nullable=True),
        sa.Column("contact_value", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_incident_reports_public_id", "incident_reports", ["public_id"], unique=True)
    op.create_index("ix_incident_reports_owner_telegram_id", "incident_reports", ["owner_telegram_id"])
    op.create_index("ix_incident_reports_status", "incident_reports", ["status"])
    op.create_index("ix_incident_reports_created_at", "incident_reports", ["created_at"])

    op.create_table(
        "evidence_files",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("incident_report_id", sa.Uuid(), nullable=False),
        sa.Column("file_type", sa.String(length=16), nullable=False),
        sa.Column("storage_key", sa.String(length=64), nullable=False),
        sa.Column("mime_type", sa.String(length=64), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("checksum", sa.String(length=64), nullable=False),
        sa.Column("uploaded_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["incident_report_id"], ["incident_reports.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_evidence_files_incident_report_id", "evidence_files", ["incident_report_id"])

    op.create_table(
        "emergency_events",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("telegram_id", sa.BigInteger(), nullable=False),
        sa.Column("source", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_emergency_events_telegram_id", "emergency_events", ["telegram_id"])
    op.create_index("ix_emergency_events_created_at", "emergency_events", ["created_at"])

    op.create_table(
        "audit_logs",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("actor_telegram_id", sa.BigInteger(), nullable=False),
        sa.Column("action", sa.String(length=64), nullable=False),
        sa.Column("entity_type", sa.String(length=64), nullable=False),
        sa.Column("entity_id", sa.String(length=64), nullable=False),
        sa.Column("meta", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_audit_logs_actor_telegram_id", "audit_logs", ["actor_telegram_id"])


def downgrade() -> None:
    op.drop_table("audit_logs")
    op.drop_table("emergency_events")
    op.drop_table("evidence_files")
    op.drop_table("incident_reports")
    op.drop_table("user_accounts")

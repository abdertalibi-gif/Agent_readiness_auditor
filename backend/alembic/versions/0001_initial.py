"""initial schema

Revision ID: 0001_initial
Revises:
Create Date: 2026-01-01
"""
from alembic import op
import sqlalchemy as sa

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("name", sa.String(120), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "websites",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("owner_id", sa.String(32), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("domain", sa.String(255), nullable=False),
        sa.Column("base_url", sa.String(2048), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_websites_domain", "websites", ["domain"])
    op.create_index("ix_websites_owner_id", "websites", ["owner_id"])

    op.create_table(
        "audits",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("website_id", sa.String(32), sa.ForeignKey("websites.id", ondelete="CASCADE"), nullable=False),
        sa.Column("target_url", sa.String(2048), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("progress_json", sa.JSON(), nullable=True),
        sa.Column("summary_json", sa.JSON(), nullable=True),
        sa.Column("score", sa.Float(), nullable=True),
        sa.Column("rating", sa.String(16), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_audits_website_id", "audits", ["website_id"])
    op.create_index("ix_audits_status", "audits", ["status"])

    op.create_table(
        "pages",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("audit_id", sa.String(32), sa.ForeignKey("audits.id", ondelete="CASCADE"), nullable=False),
        sa.Column("url", sa.String(2048), nullable=False),
        sa.Column("final_url", sa.String(2048), nullable=True),
        sa.Column("status_code", sa.Integer(), nullable=True),
        sa.Column("depth", sa.Integer(), nullable=False),
        sa.Column("is_same_domain", sa.Boolean(), nullable=False),
        sa.Column("content_type", sa.String(120), nullable=True),
        sa.Column("response_time_ms", sa.Integer(), nullable=True),
        sa.Column("title", sa.Text(), nullable=True),
        sa.Column("meta_description", sa.Text(), nullable=True),
        sa.Column("canonical", sa.String(2048), nullable=True),
        sa.Column("robots_meta", sa.JSON(), nullable=True),
        sa.Column("headings", sa.JSON(), nullable=True),
        sa.Column("links_count", sa.Integer(), nullable=False),
        sa.Column("broken_links", sa.JSON(), nullable=True),
        sa.Column("images", sa.JSON(), nullable=True),
        sa.Column("structured_data", sa.JSON(), nullable=True),
        sa.Column("open_graph", sa.JSON(), nullable=True),
        sa.Column("text_preview", sa.Text(), nullable=True),
        sa.Column("word_count", sa.Integer(), nullable=False),
        sa.Column("lang", sa.String(16), nullable=True),
        sa.Column("has_forms", sa.Boolean(), nullable=False),
        sa.Column("has_buttons", sa.Boolean(), nullable=False),
        sa.Column("js_dependency_count", sa.Integer(), nullable=False),
        sa.Column("crawled_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_pages_audit_id", "pages", ["audit_id"])

    op.create_table(
        "audit_checks",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("audit_id", sa.String(32), sa.ForeignKey("audits.id", ondelete="CASCADE"), nullable=False),
        sa.Column("check_id", sa.String(80), nullable=False),
        sa.Column("category", sa.String(80), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("severity", sa.String(16), nullable=False),
        sa.Column("score", sa.Float(), nullable=False),
        sa.Column("weight", sa.Float(), nullable=False),
        sa.Column("evidence", sa.JSON(), nullable=True),
        sa.Column("recommendation", sa.Text(), nullable=True),
        sa.Column("why_matters", sa.Text(), nullable=True),
        sa.Column("ai_explanation", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_audit_checks_audit_id", "audit_checks", ["audit_id"])
    op.create_index("ix_audit_checks_status", "audit_checks", ["status"])
    op.create_index("ix_audit_checks_category", "audit_checks", ["category"])

    op.create_table(
        "recommendations",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("audit_id", sa.String(32), sa.ForeignKey("audits.id", ondelete="CASCADE"), nullable=False),
        sa.Column("check_id", sa.String(80), nullable=True),
        sa.Column("priority", sa.String(16), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("how_to_fix", sa.Text(), nullable=True),
        sa.Column("effort", sa.String(16), nullable=True),
        sa.Column("impact", sa.String(16), nullable=True),
        sa.Column("source", sa.String(16), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_recommendations_audit_id", "recommendations", ["audit_id"])

    op.create_table(
        "reports",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("audit_id", sa.String(32), sa.ForeignKey("audits.id", ondelete="CASCADE"), nullable=False),
        sa.Column("format", sa.String(16), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_reports_audit_id", "reports", ["audit_id"])


def downgrade() -> None:
    op.drop_table("reports")
    op.drop_table("recommendations")
    op.drop_table("audit_checks")
    op.drop_table("pages")
    op.drop_table("audits")
    op.drop_table("websites")
    op.drop_table("users")

"""add auth: password/company columns, audit ownership, auth_sessions

Revision ID: 0003_auth
Revises: 0002_max_pages
Create Date: 2026-01-01
"""
from alembic import op
import sqlalchemy as sa

revision = "0003_auth"
down_revision = "0002_max_pages"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("password_hash", sa.String(length=255), nullable=True))
    op.add_column("users", sa.Column("company_name", sa.String(length=255), nullable=True))

    op.add_column("audits", sa.Column("user_id", sa.String(length=32), nullable=True))
    op.create_index("ix_audits_user_id", "audits", ["user_id"])

    op.create_table(
        "auth_sessions",
        sa.Column("id", sa.String(length=32), primary_key=True),
        sa.Column("user_id", sa.String(length=32), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_auth_sessions_user_id", "auth_sessions", ["user_id"])
    op.create_index("ix_auth_sessions_token_hash", "auth_sessions", ["token_hash"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_auth_sessions_token_hash", table_name="auth_sessions")
    op.drop_index("ix_auth_sessions_user_id", table_name="auth_sessions")
    op.drop_table("auth_sessions")

    op.drop_index("ix_audits_user_id", table_name="audits")
    op.drop_column("audits", "user_id")

    op.drop_column("users", "company_name")
    op.drop_column("users", "password_hash")
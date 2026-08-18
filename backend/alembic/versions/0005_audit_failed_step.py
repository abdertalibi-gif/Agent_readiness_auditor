"""add failed_step column to audits

Revision ID: 0005_audit_failed_step
Revises: 0004_password_reset
Create Date: 2026-08-13
"""
from alembic import op
import sqlalchemy as sa

revision = "0005_audit_failed_step"
down_revision = "0004_password_reset"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("audits", sa.Column("failed_step", sa.String(length=32), nullable=True))


def downgrade() -> None:
    op.drop_column("audits", "failed_step")
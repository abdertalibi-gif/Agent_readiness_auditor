"""add preferred_language column to users

Revision ID: 0008_user_preferred_language
Revises: 0007_invitation_cancelled_at
Create Date: 2026-08-15
"""
from alembic import op
import sqlalchemy as sa

revision = "0008_user_preferred_language"
down_revision = "0007_invitation_cancelled_at"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "preferred_language",
            sa.String(length=4),
            nullable=False,
            server_default=sa.text("'en'"),
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "preferred_language")

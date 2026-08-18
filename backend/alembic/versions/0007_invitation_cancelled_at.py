"""add cancelled_at to workspace_invitations

Revision ID: 0007_invitation_cancelled_at
Revises: 0006_workspace_invitations
Create Date: 2026-08-15
"""
from alembic import op
import sqlalchemy as sa

revision = "0007_invitation_cancelled_at"
down_revision = "0006_workspace_invitations"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "workspace_invitations",
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("workspace_invitations", "cancelled_at")

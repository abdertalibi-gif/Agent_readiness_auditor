"""add workspaces, workspace_members, workspace_invitations tables

Revision ID: 0006_workspace_invitations
Revises: 0005_audit_failed_step
Create Date: 2026-08-13
"""
from alembic import op
import sqlalchemy as sa

revision = "0006_workspace_invitations"
down_revision = "0005_audit_failed_step"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "workspaces",
        sa.Column("id", sa.String(length=32), primary_key=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "workspace_members",
        sa.Column("id", sa.String(length=32), primary_key=True),
        sa.Column(
            "workspace_id",
            sa.String(length=32),
            sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            sa.String(length=32),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("role", sa.String(length=16), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("workspace_id", "user_id", name="uq_workspace_member"),
    )
    op.create_index("ix_workspace_members_workspace_id", "workspace_members", ["workspace_id"])
    op.create_index("ix_workspace_members_user_id", "workspace_members", ["user_id"])

    op.create_table(
        "workspace_invitations",
        sa.Column("id", sa.String(length=32), primary_key=True),
        sa.Column(
            "workspace_id",
            sa.String(length=32),
            sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "inviter_id",
            sa.String(length=32),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("role", sa.String(length=16), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rejected_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_workspace_invitations_workspace_id", "workspace_invitations", ["workspace_id"])
    op.create_index("ix_workspace_invitations_inviter_id", "workspace_invitations", ["inviter_id"])
    op.create_index("ix_workspace_invitations_email", "workspace_invitations", ["email"])
    op.create_index("ix_workspace_invitations_token_hash", "workspace_invitations", ["token_hash"], unique=True)
    op.create_index("ix_workspace_invitations_status", "workspace_invitations", ["status"])
    # DB-level guard against duplicate *pending* invitations (SQLite 3.8+ and
    # PostgreSQL both support partial indexes). Re-inviting after the invitation
    # was acted on remains allowed.
    op.execute(
        "CREATE UNIQUE INDEX ix_workspace_invitations_pending_email "
        "ON workspace_invitations (workspace_id, email) WHERE status = 'PENDING'"
    )


def downgrade() -> None:
    op.drop_index("ix_workspace_invitations_pending_email", table_name="workspace_invitations")
    op.drop_index("ix_workspace_invitations_status", table_name="workspace_invitations")
    op.drop_index("ix_workspace_invitations_token_hash", table_name="workspace_invitations")
    op.drop_index("ix_workspace_invitations_email", table_name="workspace_invitations")
    op.drop_index("ix_workspace_invitations_inviter_id", table_name="workspace_invitations")
    op.drop_index("ix_workspace_invitations_workspace_id", table_name="workspace_invitations")
    op.drop_table("workspace_invitations")
    op.drop_index("ix_workspace_members_user_id", table_name="workspace_members")
    op.drop_index("ix_workspace_members_workspace_id", table_name="workspace_members")
    op.drop_table("workspace_members")
    op.drop_table("workspaces")

"""merge admin branch and preferred_language branch

Revision ID: 0009_merge_admin_preferred_language
Revises: 0008_super_admin, 0008_user_preferred_language
Create Date: 2026-08-15
"""

revision = "0009_merge_admin_preferred_language"
down_revision = ("0008_super_admin", "0008_user_preferred_language")
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass

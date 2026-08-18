"""SQLAlchemy entities.

Relationships:

    User 1---n Website 1---n Audit 1---n Page / AuditCheck / Recommendation / Report
    User n---n Workspace  (via WorkspaceMember)
    Workspace 1---n WorkspaceInvitation 1---n inviter (User)

`AuditCheck` is the single source of truth for all findings. Issues shown in the
dashboard are FAIL/WARNING checks (derived, not duplicated).
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def _uuid() -> str:
    return uuid.uuid4().hex


def _utcnow() -> datetime:
    return datetime.now(UTC)


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    company_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Platform role: SUPER_ADMIN | OWNER | ADMIN | MEMBER. The workspace-level
    # role lives on WorkspaceMember.role; this field designates the platform
    # role for admin authorization.
    role: Mapped[str] = mapped_column(String(24), default="MEMBER", index=True)
    # Account status: ACTIVE | SUSPENDED | DELETED (soft delete).
    status: Mapped[str] = mapped_column(String(16), default="ACTIVE", index=True)
    # UI language preference: en | fr | ar | es. Defaults to English.
    preferred_language: Mapped[str] = mapped_column(String(4), default="en", server_default="en")
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    suspended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    websites: Mapped[list["Website"]] = relationship(back_populates="owner", lazy="selectin")
    sessions: Mapped[list["AuthSession"]] = relationship(back_populates="user", lazy="selectin")
    password_resets: Mapped[list["PasswordResetToken"]] = relationship(back_populates="user", lazy="selectin")
    memberships: Mapped[list["WorkspaceMember"]] = relationship(
        back_populates="user", lazy="selectin", cascade="all, delete-orphan"
    )
    sent_invitations: Mapped[list["WorkspaceInvitation"]] = relationship(
        back_populates="inviter", lazy="selectin"
    )


class Workspace(Base):
    """A team/workspace that can contain multiple members with roles.

    Every user is provisioned a personal workspace on registration (named from
    ``company_name`` when provided). Owners can invite other users, who become
    members with an explicit role (OWNER | ADMIN | MEMBER | VIEWER).
    """

    __tablename__ = "workspaces"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    members: Mapped[list["WorkspaceMember"]] = relationship(
        back_populates="workspace", lazy="selectin", cascade="all, delete-orphan"
    )
    invitations: Mapped[list["WorkspaceInvitation"]] = relationship(
        back_populates="workspace", lazy="selectin", cascade="all, delete-orphan"
    )


class WorkspaceMember(Base):
    """Membership of a user in a workspace with an assigned role.

    ``role`` is one of OWNER | ADMIN | MEMBER | VIEWER. Only OWNER/ADMIN
    members may invite, resend, cancel, change roles or remove members.
    """

    __tablename__ = "workspace_members"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    workspace_id: Mapped[str] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(16), default="MEMBER")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    __table_args__ = (UniqueConstraint("workspace_id", "user_id", name="uq_workspace_member"),)

    workspace: Mapped["Workspace"] = relationship(back_populates="members")
    user: Mapped["User"] = relationship(back_populates="memberships")


class WorkspaceInvitation(Base):
    """A pending/inactive invitation to join a workspace.

    Only the SHA-256 digest of the token is persisted (same scheme as
    ``AuthSession``/``PasswordResetToken``). A leaked database can therefore
    never be used to accept/reject invitations. Tokens are single-use: only
    ``status == "pending"`` invitations can be acted on, and acting on one
    flips the status (accepted/rejected/expired/cancelled), invalidating it.
    """

    __tablename__ = "workspace_invitations"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    workspace_id: Mapped[str] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), index=True
    )
    inviter_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    email: Mapped[str] = mapped_column(String(255), index=True)
    role: Mapped[str] = mapped_column(String(16), default="MEMBER")
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    status: Mapped[str] = mapped_column(String(16), default="PENDING", index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    rejected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    workspace: Mapped["Workspace"] = relationship(back_populates="invitations")
    inviter: Mapped["User | None"] = relationship(back_populates="sent_invitations")


class AuthSession(Base):
    """A login session. Stores only a hash of the bearer token so a leaked
    database can never be replayed into an API call."""

    __tablename__ = "auth_sessions"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped["User"] = relationship(back_populates="sessions")


class PasswordResetToken(Base):
    """A single-use, time-limited password reset token.

    Only the SHA-256 digest of the token is persisted (same scheme as
    ``AuthSession``), so a leaked database cannot be used to reset accounts.
    """

    __tablename__ = "password_reset_tokens"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped["User"] = relationship(back_populates="password_resets")


class Website(Base):
    __tablename__ = "websites"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    owner_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    domain: Mapped[str] = mapped_column(String(255), index=True)
    base_url: Mapped[str] = mapped_column(String(2048))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    owner: Mapped["User | None"] = relationship(back_populates="websites")
    audits: Mapped[list["Audit"]] = relationship(back_populates="website", lazy="selectin")


class Audit(Base):
    __tablename__ = "audits"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    website_id: Mapped[str] = mapped_column(ForeignKey("websites.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), index=True, nullable=True
    )
    target_url: Mapped[str] = mapped_column(String(2048))
    max_pages: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="QUEUED", index=True)
    # progress_json: {"stage": str, "steps": [{label, done}], "pages_crawled": int, "pages_total": int, "message": str}
    progress_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    summary_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    score: Mapped[float | None] = mapped_column(Float, nullable=True)
    rating: Mapped[str | None] = mapped_column(String(16), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    failed_step: Mapped[str | None] = mapped_column(String(32), nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    website: Mapped["Website"] = relationship(back_populates="audits", lazy="selectin")
    pages: Mapped[list["Page"]] = relationship(back_populates="audit", lazy="selectin")
    checks: Mapped[list["AuditCheck"]] = relationship(back_populates="audit", lazy="selectin")
    recommendations: Mapped[list["Recommendation"]] = relationship(back_populates="audit", lazy="selectin")
    reports: Mapped[list["Report"]] = relationship(back_populates="audit", lazy="selectin")


class Page(Base):
    __tablename__ = "pages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    audit_id: Mapped[str] = mapped_column(ForeignKey("audits.id", ondelete="CASCADE"), index=True)
    url: Mapped[str] = mapped_column(String(2048))
    final_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    status_code: Mapped[int | None] = mapped_column(Integer, nullable=True)
    depth: Mapped[int] = mapped_column(Integer, default=0)
    is_same_domain: Mapped[bool] = mapped_column(Boolean, default=True)
    content_type: Mapped[str | None] = mapped_column(String(120), nullable=True)
    response_time_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    title: Mapped[str | None] = mapped_column(Text, nullable=True)
    meta_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    canonical: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    robots_meta: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    headings: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # {"h1": [...], "h2": [...]}
    links_count: Mapped[int] = mapped_column(Integer, default=0)
    broken_links: Mapped[list | None] = mapped_column(JSON, nullable=True)
    images: Mapped[list | None] = mapped_column(JSON, nullable=True)
    structured_data: Mapped[list | None] = mapped_column(JSON, nullable=True)
    open_graph: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    text_preview: Mapped[str | None] = mapped_column(Text, nullable=True)
    word_count: Mapped[int] = mapped_column(Integer, default=0)
    lang: Mapped[str | None] = mapped_column(String(16), nullable=True)
    has_forms: Mapped[bool] = mapped_column(Boolean, default=False)
    has_buttons: Mapped[bool] = mapped_column(Boolean, default=False)
    js_dependency_count: Mapped[int] = mapped_column(Integer, default=0)
    crawled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    audit: Mapped["Audit"] = relationship(back_populates="pages")


class AuditCheck(Base):
    __tablename__ = "audit_checks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    audit_id: Mapped[str] = mapped_column(ForeignKey("audits.id", ondelete="CASCADE"), index=True)
    check_id: Mapped[str] = mapped_column(String(80))
    category: Mapped[str] = mapped_column(String(80), index=True)
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(16), index=True)  # PASS|WARNING|FAIL|NOT_APPLICABLE
    severity: Mapped[str] = mapped_column(String(16), default="INFO")  # CRITICAL|HIGH|MEDIUM|LOW|INFO
    score: Mapped[float] = mapped_column(Float, default=0.0)
    weight: Mapped[float] = mapped_column(Float, default=1.0)
    evidence: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    recommendation: Mapped[str | None] = mapped_column(Text, nullable=True)
    why_matters: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_explanation: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    audit: Mapped["Audit"] = relationship(back_populates="checks")


class Recommendation(Base):
    __tablename__ = "recommendations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    audit_id: Mapped[str] = mapped_column(ForeignKey("audits.id", ondelete="CASCADE"), index=True)
    check_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    priority: Mapped[str] = mapped_column(String(16), default="MEDIUM")
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    how_to_fix: Mapped[str | None] = mapped_column(Text, nullable=True)
    effort: Mapped[str | None] = mapped_column(String(16), nullable=True)
    impact: Mapped[str | None] = mapped_column(String(16), nullable=True)
    source: Mapped[str] = mapped_column(String(16), default="engine")  # engine | ai
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    audit: Mapped["Audit"] = relationship(back_populates="recommendations")


class Report(Base):
    __tablename__ = "reports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    audit_id: Mapped[str] = mapped_column(ForeignKey("audits.id", ondelete="CASCADE"), index=True)
    format: Mapped[str] = mapped_column(String(16), default="pdf")
    size_bytes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    audit: Mapped["Audit"] = relationship(back_populates="reports")


class Review(Base):
    """A customer rating/review left on a completed audit.

    Ratings are 1..5; comments are plain text (sanitized on write). New
    reviews start as PENDING and only appear publicly (landing page, stats)
    once a SUPER_ADMIN approves them. A user may review a given audit at most
    once (enforced by ``uq_review_user_audit``).
    """

    __tablename__ = "reviews"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    audit_id: Mapped[str] = mapped_column(
        ForeignKey("audits.id", ondelete="CASCADE"), index=True
    )
    rating: Mapped[int] = mapped_column(Integer)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Status: PENDING | APPROVED | HIDDEN
    status: Mapped[str] = mapped_column(String(16), default="PENDING", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

    __table_args__ = (UniqueConstraint("user_id", "audit_id", name="uq_review_user_audit"),)

    # One-way relationships (no back_populates) so loading a User or Audit never
    # eagerly pulls in its reviews. Reviews are only ever loaded deliberately.
    user: Mapped["User"] = relationship(lazy="selectin")
    audit: Mapped["Audit"] = relationship(lazy="selectin")


class UserFeedback(Base):
    """A user's rating of the Agent-Readiness Auditor application itself.

    Distinct from ``Review`` (which rates a single completed audit). Exactly one
    active feedback record is allowed per user (enforced by the unique
    ``user_id`` column). The rating targets the *application*, never a specific
    audited website, and is completely independent of any audit score.
    """

    __tablename__ = "user_feedback"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), unique=True, index=True
    )
    # Rating of the application: 1..5.
    rating: Mapped[int] = mapped_column(Integer)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

    __table_args__ = (CheckConstraint("rating >= 1 AND rating <= 5", name="ck_user_feedback_rating"),)

    # One-way relationship (no back_populates) so loading a User never eagerly
    # pulls in its feedback. Feedback is only ever loaded deliberately.
    user: Mapped["User"] = relationship(lazy="selectin")


class AuditLogEntry(Base):
    """Platform audit trail for privileged (super admin) security actions.

    Every account/workspace/unactivity action taken by a SUPER_ADMIN is
    recorded here so there is always an immutable, queryable record of who did
    what, to whom, when.
    """

    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    actor_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    action: Mapped[str] = mapped_column(String(64), index=True)  # e.g. user.suspend
    target_user_id: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    target_workspace_id: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    # Free-form details about what changed (before/after values, reasons, etc.).
    data: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, index=True)

    actor: Mapped["User | None"] = relationship()


BaseModel = Base

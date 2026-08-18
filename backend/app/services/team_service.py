"""Workspace / team invitation service.

Responsibilities:
- Provisioning a personal workspace per user.
- Inviting users (email validation, duplicate checks, token generation, email).
- Accepting / rejecting invitations via single-use, expiring tokens.
- Membership and role management.

The invitation token is generated with ``secrets.token_urlsafe(32)`` (256 bits)
and only its SHA-256 digest is stored, so a leaked database can never be used
to act on an invitation. Only ``PENDING`` invitations can be acted on; acting
on one (or cancelling) flips the status and invalidates the token.
"""

import logging
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.auth import generate_invitation_token, hash_token, invitation_expiry
from app.models import User, Workspace, WorkspaceInvitation, WorkspaceMember
from app.services.email_service import (
    EmailConfigurationError,
    EmailDeliveryError,
    send_invitation_email,
)

logger = logging.getLogger("auditor.team")

# Roles.
ROLE_OWNER = "OWNER"
ROLE_ADMIN = "ADMIN"
ROLE_MEMBER = "MEMBER"
ROLE_VIEWER = "VIEWER"
VALID_ROLES = {ROLE_OWNER, ROLE_ADMIN, ROLE_MEMBER, ROLE_VIEWER}
MANAGER_ROLES = {ROLE_OWNER, ROLE_ADMIN}

# Invitation statuses.
STATUS_PENDING = "PENDING"
STATUS_ACCEPTED = "ACCEPTED"
STATUS_REJECTED = "REJECTED"
STATUS_EXPIRED = "EXPIRED"
STATUS_CANCELLED = "CANCELLED"


class InvitationError(Exception):
    """Base class for invitation domain errors (mapped to HTTP by the router)."""

    def __init__(self, detail: str, *, status_code: int = 400) -> None:
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code


class NotAuthorizedError(InvitationError):
    def __init__(self, detail: str = "You do not have permission to manage this workspace.") -> None:
        super().__init__(detail, status_code=403)


class EmailAlreadyMemberError(InvitationError):
    def __init__(self, detail: str = "This user is already a member of the workspace.") -> None:
        super().__init__(detail, status_code=409)


class InvitationPendingExistsError(InvitationError):
    def __init__(self, detail: str = "An invitation to this email is already pending.") -> None:
        super().__init__(detail, status_code=409)


class InvitationInvalidError(InvitationError):
    def __init__(self, detail: str = "This invitation link is invalid or has already been used.") -> None:
        super().__init__(detail, status_code=400)


def _as_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC)


def _normalize_email(email: str) -> str:
    return email.lower().strip()


# ---------- Workspace provisioning ----------

async def get_or_create_personal_workspace(session: AsyncSession, user: User) -> Workspace:
    """Return the workspace the user owns (their personal workspace), creating
    it on first access if missing (e.g. legacy accounts)."""
    membership = await session.scalar(
        select(WorkspaceMember)
        .join(Workspace, Workspace.id == WorkspaceMember.workspace_id)
        .where(WorkspaceMember.user_id == user.id, WorkspaceMember.role == ROLE_OWNER)
    )
    if membership is not None:
        return await session.get(Workspace, membership.workspace_id)  # type: ignore[return-value]

    name = (user.company_name or "").strip() or (user.name or "My").strip() or "My"
    if not name.lower().endswith("workspace"):
        name = f"{name} Workspace"
    workspace = Workspace(name=name)
    session.add(workspace)
    await session.flush()
    session.add(
        WorkspaceMember(workspace_id=workspace.id, user_id=user.id, role=ROLE_OWNER)
    )
    await session.commit()
    await session.refresh(workspace)
    logger.info("created personal workspace", extra={"user_id": user.id, "workspace_id": workspace.id})
    return workspace


async def get_membership(
    session: AsyncSession, workspace_id: str, user_id: str
) -> WorkspaceMember | None:
    return await session.scalar(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.user_id == user_id,
        )
    )


async def require_manager(session: AsyncSession, workspace_id: str, user_id: str) -> WorkspaceMember:
    """Enforce that the user is an OWNER/ADMIN of the workspace."""
    membership = await get_membership(session, workspace_id, user_id)
    if membership is None or membership.role not in MANAGER_ROLES:
        raise NotAuthorizedError()
    return membership


async def ensure_membership(
    session: AsyncSession, workspace_id: str, user_id: str, role: str
) -> WorkspaceMember:
    """Add a user to a workspace if not already a member. Prevents duplicate
    membership: an existing membership's role is left untouched."""
    existing = await get_membership(session, workspace_id, user_id)
    if existing is not None:
        return existing
    member = WorkspaceMember(workspace_id=workspace_id, user_id=user_id, role=role)
    session.add(member)
    await session.flush()
    return member


# ---------- Invitations ----------

async def create_invitation(
    session: AsyncSession,
    workspace: Workspace,
    inviter: User,
    email: str,
    role: str,
) -> tuple[WorkspaceInvitation, bool]:
    """Create a PENDING invitation for ``email`` with the given ``role``.

    Returns ``(invitation, email_sent)``. The invitation is always persisted;
    when the email cannot be delivered (SMTP unconfigured/failed) the flag is
    ``False`` so the owner can retry via the resend action.
    """
    email = _normalize_email(email)
    if role not in VALID_ROLES:
        raise InvitationError("Invalid role.")

    invitee = await session.scalar(select(User).where(User.email == email))
    if invitee is not None:
        existing = await get_membership(session, workspace.id, invitee.id)
        if existing is not None:
            raise EmailAlreadyMemberError()

    pending = await session.scalar(
        select(WorkspaceInvitation).where(
            WorkspaceInvitation.workspace_id == workspace.id,
            WorkspaceInvitation.email == email,
            WorkspaceInvitation.status == STATUS_PENDING,
        )
    )
    if pending is not None:
        raise InvitationPendingExistsError()

    token = generate_invitation_token()
    invitation = WorkspaceInvitation(
        workspace_id=workspace.id,
        inviter_id=inviter.id,
        email=email,
        role=role,
        token_hash=hash_token(token),
        status=STATUS_PENDING,
        expires_at=invitation_expiry(),
    )
    session.add(invitation)
    try:
        await session.commit()
    except Exception:  # noqa: BLE001 - concurrent duplicate invitation
        await session.rollback()
        raise InvitationPendingExistsError() from None
    await session.refresh(invitation)

    email_sent = _send_invitation_email(invitation, workspace, inviter, token)
    return invitation, email_sent


async def resend_invitation(
    session: AsyncSession,
    invitation: WorkspaceInvitation,
    inviter: User,
) -> tuple[WorkspaceInvitation, bool]:
    """Rotate the token (invalidate old link), refresh the expiry and re-send
    the email for a still-pending invitation."""
    if invitation.status != STATUS_PENDING:
        raise InvitationError("Only pending invitations can be resent.")
    token = generate_invitation_token()
    invitation.token_hash = hash_token(token)
    invitation.expires_at = invitation_expiry()
    await session.commit()
    await session.refresh(invitation)
    workspace = await session.get(Workspace, invitation.workspace_id)
    email_sent = _send_invitation_email(invitation, workspace, inviter, token)  # type: ignore[arg-type]
    return invitation, email_sent


async def cancel_invitation(session: AsyncSession, invitation: WorkspaceInvitation) -> None:
    """Cancel a pending invitation (owner/admin). Invalidates the token by
    flipping its status away from PENDING."""
    if invitation.status != STATUS_PENDING:
        raise InvitationError("Only pending invitations can be cancelled.")
    invitation.status = STATUS_CANCELLED
    invitation.cancelled_at = datetime.now(UTC)
    await session.commit()
    logger.info("invitation cancelled", extra={"invitation_id": invitation.id})


def _send_invitation_email(
    invitation: WorkspaceInvitation,
    workspace: Workspace,
    inviter: User,
    token: str,
) -> bool:
    accept_url = (
        f"{settings.frontend_url.rstrip('/')}/invite/accept?token={token}"
    )
    reject_url = (
        f"{settings.frontend_url.rstrip('/')}/invite/reject?token={token}"
    )
    inviter_name = inviter.name or inviter.email.split("@")[0]
    try:
        send_invitation_email(
            to_email=invitation.email,
            workspace_name=workspace.name,
            inviter_name=inviter_name,
            role=invitation.role.capitalize(),
            accept_url=accept_url,
            reject_url=reject_url,
            inviter_language=getattr(inviter, "preferred_language", None) or "en",
        )
        return True
    except (EmailConfigurationError, EmailDeliveryError) as exc:
        logger.error(
            "invitation email NOT delivered: %s (SMTP host=%s port=%s user=%s from=%s)",
            exc,
            bool(settings.smtp_host),
            settings.smtp_port,
            bool(settings.smtp_user),
            bool(settings.smtp_from),
            extra={"invitation_id": invitation.id, "to": invitation.email, "workspace_id": workspace.id},
        )
        return False


async def _find_invitation_by_token(session: AsyncSession, token: str) -> WorkspaceInvitation | None:
    return await session.scalar(
        select(WorkspaceInvitation).where(
            WorkspaceInvitation.token_hash == hash_token(token)
        )
    )


async def get_invitation_state(
    session: AsyncSession, token: str
) -> tuple[WorkspaceInvitation | None, Workspace | None, User | None]:
    """Resolve an invitation token to (invitation, workspace, inviter). Lazy
    expiry: a pending invitation past its deadline is flipped to EXPIRED."""
    invitation = await _find_invitation_by_token(session, token)
    if invitation is None:
        return None, None, None
    workspace = await session.get(Workspace, invitation.workspace_id)
    inviter = await session.get(User, invitation.inviter_id) if invitation.inviter_id else None
    if invitation.status == STATUS_PENDING and _as_utc(invitation.expires_at) <= datetime.now(UTC):
        invitation.status = STATUS_EXPIRED
        await session.commit()
        await session.refresh(invitation)
    return invitation, workspace, inviter


async def accept_invitation(
    session: AsyncSession, token: str, responder: User | None = None
) -> dict:
    """Accept a pending invitation.

    When ``responder`` is an authenticated user, they must be the recipient of
    the invitation (email match), otherwise a ``403`` is raised. Anonymous
    callers are authorized by possession of the secret single-use token (the
    magic-link model; required for the no-account flow).

    Returns a dict describing the outcome:
    - ``{"ok": True, "workspace_name", "workspace_id", "role"}`` when the
      invitee already has an account and is now a member.
    - ``{"ok": False, "needs_registration": True, "email", ...}`` when the
      invitee does not have an account yet (they must register with the same
      email; the pending invitation is then auto-accepted at registration).
    - ``{"ok": False, "reason": "accepted|rejected|expired|cancelled"}`` when
      the token is no longer usable.
    """
    invitation, workspace, _inviter = await get_invitation_state(session, token)
    if invitation is None or workspace is None:
        raise InvitationInvalidError()
    _ensure_recipient_authorized(invitation, responder)

    if invitation.status != STATUS_PENDING:
        return {"ok": False, "reason": invitation.status.lower()}

    invitee = await session.scalar(select(User).where(User.email == _normalize_email(invitation.email)))
    if invitee is None:
        return {
            "ok": False,
            "needs_registration": True,
            "email": invitation.email,
            "workspace_id": workspace.id,
            "workspace_name": workspace.name,
            "role": invitation.role,
        }

    await ensure_membership(session, workspace.id, invitee.id, invitation.role)
    invitation.status = STATUS_ACCEPTED
    invitation.accepted_at = datetime.now(UTC)
    await session.commit()
    logger.info(
        "invitation accepted",
        extra={"invitation_id": invitation.id, "workspace_id": workspace.id, "user_id": invitee.id},
    )
    return {
        "ok": True,
        "workspace_id": workspace.id,
        "workspace_name": workspace.name,
        "role": invitation.role,
    }


async def reject_invitation(
    session: AsyncSession, token: str, responder: User | None = None
) -> dict:
    """Reject a pending invitation. The invitee is NOT added to the workspace.

    Same recipient authorization as :func:`accept_invitation`.
    """
    invitation, workspace, _inviter = await get_invitation_state(session, token)
    if invitation is None or workspace is None:
        raise InvitationInvalidError()
    _ensure_recipient_authorized(invitation, responder)

    if invitation.status != STATUS_PENDING:
        return {"ok": False, "reason": invitation.status.lower()}

    invitation.status = STATUS_REJECTED
    invitation.rejected_at = datetime.now(UTC)
    await session.commit()
    logger.info("invitation rejected", extra={"invitation_id": invitation.id, "workspace_id": workspace.id})
    return {"ok": True, "workspace_name": workspace.name}


def _ensure_recipient_authorized(invitation: WorkspaceInvitation, responder: User | None) -> None:
    """A responder who is authenticated must be the invitee (email match).

    This prevents an authenticated user from accepting/rejecting an
    invitation that was sent to someone else.
    """
    if responder is not None and _normalize_email(responder.email) != _normalize_email(
        invitation.email
    ):
        raise NotAuthorizedError("You are not the recipient of this invitation.")


async def accept_pending_invitations_for_email(session: AsyncSession, user: User) -> int:
    """After registration, connect the new account to any pending invitations
    addressed to the same email. Invitation tokens remain single-use (flipped
    to ACCEPTED), but the user is admitted regardless of which token link they
    follow later, since the invitation email is the source of truth."""
    invitations = (
        await session.scalars(
            select(WorkspaceInvitation).where(
                WorkspaceInvitation.email == _normalize_email(user.email),
                WorkspaceInvitation.status == STATUS_PENDING,
            )
        )
    ).all()
    now = datetime.now(UTC)
    accepted = 0
    changed = False
    for invitation in invitations:
        if _as_utc(invitation.expires_at) <= now:
            invitation.status = STATUS_EXPIRED
            changed = True
            continue
        await ensure_membership(session, invitation.workspace_id, user.id, invitation.role)
        invitation.status = STATUS_ACCEPTED
        invitation.accepted_at = now
        accepted += 1
        changed = True
    if changed:
        await session.commit()
        logger.info(
            "pending invitations auto-accepted after registration",
            extra={"user_id": user.id, "count": accepted},
        )
    return accepted

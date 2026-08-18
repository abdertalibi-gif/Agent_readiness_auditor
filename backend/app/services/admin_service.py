"""Super admin platform management service.

Only SUPER_ADMIN users may perform these operations. Every action is recorded
in the ``audit_log`` table so there is an immutable, queryable trail of who did
what, to whom, when, and from which IP.

Safety invariants enforced here (never rely on the frontend):
- A SUPER_ADMIN cannot delete or suspend themselves.
- Deleting is a SOFT delete (status=DELETED, deleted_at set) - rows are kept.
- Suspending/deleting immediately revokes all live sessions.
- Suspended/deleted accounts cannot log in or use any authenticated API.
"""

import logging
from datetime import UTC, datetime

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.roles import (
    ROLE_OWNER,
    STATUS_ACCEPTED,
    STATUS_ACTIVE,
    STATUS_DELETED,
    STATUS_PENDING,
    STATUS_SUSPENDED,
)
from app.models import (
    AuditLogEntry,
    AuthSession,
    User,
    Workspace,
    WorkspaceInvitation,
    WorkspaceMember,
)

logger = logging.getLogger("auditor.admin")

VALID_USER_ROLES = {"SUPER_ADMIN", "OWNER", "ADMIN", "MEMBER"}
VALID_WORKSPACE_ROLES = {"OWNER", "ADMIN", "MEMBER", "VIEWER"}


class AdminError(Exception):
    def __init__(self, detail: str, *, status_code: int = 400) -> None:
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code


class NotFoundError(AdminError):
    def __init__(self, detail: str = "Not found.") -> None:
        super().__init__(detail, status_code=404)


class ProtectedTargetError(AdminError):
    def __init__(self, detail: str) -> None:
        super().__init__(detail, status_code=400)


async def _record(
    session: AsyncSession,
    *,
    action: str,
    actor: User,
    target_user_id: str | None = None,
    target_workspace_id: str | None = None,
    metadata: dict | None = None,
    ip_address: str | None = None,
) -> None:
    session.add(
        AuditLogEntry(
            actor_id=actor.id,
            action=action,
            target_user_id=target_user_id,
            target_workspace_id=target_workspace_id,
            data=metadata,
            ip_address=ip_address,
            created_at=datetime.now(UTC),
        )
    )


def _assert_not_self(actor: User, target: User, verb: str) -> None:
    if actor.id == target.id:
        raise ProtectedTargetError(
            f"You cannot {verb} your own account."
        )


# ---------- Users ----------

async def list_users(
    session: AsyncSession, *, search: str | None = None, limit: int = 100, offset: int = 0
) -> list[User]:
    """All users (including suspended/deleted) with optional name/email search."""
    stmt = select(User).order_by(User.created_at.desc()).limit(limit).offset(offset)
    if search and search.strip():
        term = f"%{search.strip().lower()}%"
        stmt = (
            select(User)
            .where(
                User.email.ilike(term) | User.name.ilike(term)
            )
            .order_by(User.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
    return (await session.scalars(stmt)).all()


async def get_user(session: AsyncSession, user_id: str) -> User:
    user = await session.get(User, user_id)
    if user is None:
        raise NotFoundError("User not found.")
    return user


async def suspend_user(
    session: AsyncSession,
    user: User,
    actor: User,
    *,
    ip_address: str | None = None,
) -> User:
    _assert_not_self(actor, user, "suspend")
    if user.status == STATUS_SUSPENDED:
        raise AdminError("This account is already suspended.", status_code=409)
    user.status = STATUS_SUSPENDED
    user.suspended_at = datetime.now(UTC)
    await _revoke_all_sessions(session, user.id)
    await _record(
        session,
        action="user.suspend",
        actor=actor,
        target_user_id=user.id,
        metadata={"email": user.email, "status": STATUS_SUSPENDED},
        ip_address=ip_address,
    )
    await session.commit()
    await session.refresh(user)
    logger.info("user suspended", extra={"actor_id": actor.id, "target_user_id": user.id})
    return user


async def unsuspend_user(
    session: AsyncSession,
    user: User,
    actor: User,
    *,
    ip_address: str | None = None,
) -> User:
    if user.status != STATUS_SUSPENDED:
        raise AdminError("This account is not currently suspended.", status_code=409)
    user.status = STATUS_ACTIVE
    user.suspended_at = None
    await _record(
        session,
        action="user.unsuspend",
        actor=actor,
        target_user_id=user.id,
        metadata={"email": user.email, "status": STATUS_ACTIVE},
        ip_address=ip_address,
    )
    await session.commit()
    await session.refresh(user)
    logger.info("user unsuspended", extra={"actor_id": actor.id, "target_user_id": user.id})
    return user


async def delete_user(
    session: AsyncSession,
    user: User,
    actor: User,
    *,
    ip_address: str | None = None,
) -> User:
    """Soft delete: keep the row, mark it DELETED, revoke all sessions."""
    _assert_not_self(actor, user, "delete")
    if user.status == STATUS_DELETED:
        raise AdminError("This account is already deleted.", status_code=409)
    user.status = STATUS_DELETED
    user.deleted_at = datetime.now(UTC)
    await _revoke_all_sessions(session, user.id)
    await _record(
        session,
        action="user.delete",
        actor=actor,
        target_user_id=user.id,
        metadata={"email": user.email, "status": STATUS_DELETED},
        ip_address=ip_address,
    )
    await session.commit()
    await session.refresh(user)
    logger.info("user soft-deleted", extra={"actor_id": actor.id, "target_user_id": user.id})
    return user


async def restore_user(
    session: AsyncSession,
    user: User,
    actor: User,
    *,
    ip_address: str | None = None,
) -> User:
    """Restore a soft-deleted account back to ACTIVE."""
    if user.status != STATUS_DELETED:
        raise AdminError("Only deleted accounts can be restored.", status_code=409)
    user.status = STATUS_ACTIVE
    user.deleted_at = None
    user.suspended_at = None
    await _record(
        session,
        action="user.restore",
        actor=actor,
        target_user_id=user.id,
        metadata={"email": user.email, "status": STATUS_ACTIVE},
        ip_address=ip_address,
    )
    await session.commit()
    await session.refresh(user)
    logger.info("user restored", extra={"actor_id": actor.id, "target_user_id": user.id})
    return user


async def _revoke_all_sessions(session: AsyncSession, user_id: str) -> None:
    await session.execute(
        update(AuthSession)
        .where(
            AuthSession.user_id == user_id,
            AuthSession.revoked_at.is_(None),
        )
        .values(revoked_at=datetime.now(UTC))
    )


# ---------- Workspaces ----------

async def list_workspaces(
    session: AsyncSession, *, limit: int = 100, offset: int = 0
) -> list[Workspace]:
    return (
        await session.scalars(
            select(Workspace).order_by(Workspace.created_at.desc()).limit(limit).offset(offset)
        )
    ).all()


async def get_workspace(session: AsyncSession, workspace_id: str) -> Workspace:
    workspace = await session.get(Workspace, workspace_id)
    if workspace is None:
        raise NotFoundError("Workspace not found.")
    return workspace


async def list_workspace_members(session: AsyncSession, workspace_id: str) -> list[WorkspaceMember]:
    await get_workspace(session, workspace_id)
    return (
        await session.scalars(
            select(WorkspaceMember)
            .where(WorkspaceMember.workspace_id == workspace_id)
            .options(selectinload(WorkspaceMember.user))
            .order_by(WorkspaceMember.created_at)
        )
    ).all()


async def set_workspace_member_role(
    session: AsyncSession,
    workspace_id: str,
    member_id: str,
    role: str,
    actor: User,
    *,
    ip_address: str | None = None,
) -> WorkspaceMember:
    if role not in VALID_WORKSPACE_ROLES:
        raise AdminError("Invalid workspace role.")
    member = await session.get(WorkspaceMember, member_id)
    if member is None or member.workspace_id != workspace_id:
        raise NotFoundError("Workspace member not found.")
    old_role = member.role
    member.role = role
    await _record(
        session,
        action="workspace.member.role",
        actor=actor,
        target_user_id=member.user_id,
        target_workspace_id=workspace_id,
        metadata={"member_id": member_id, "old_role": old_role, "new_role": role},
        ip_address=ip_address,
    )
    await session.commit()
    return await _get_member_eager(session, member.id)


async def _get_member_eager(session: AsyncSession, member_id: str) -> WorkspaceMember:
    member = await session.scalar(
        select(WorkspaceMember)
        .where(WorkspaceMember.id == member_id)
        .options(selectinload(WorkspaceMember.user))
    )
    if member is None:
        raise NotFoundError("Workspace member not found.")
    return member


async def remove_workspace_member(
    session: AsyncSession,
    workspace_id: str,
    member_id: str,
    actor: User,
    *,
    ip_address: str | None = None,
) -> None:
    member = await session.get(WorkspaceMember, member_id)
    if member is None or member.workspace_id != workspace_id:
        raise NotFoundError("Workspace member not found.")
    if member.role == ROLE_OWNER:
        # Prevent removing the only owner from a workspace, mirroring the
        # team management rules and avoiding an ownerless workspace.
        raise AdminError("The workspace owner cannot be removed.", status_code=400)
    await session.delete(member)
    await _record(
        session,
        action="workspace.member.remove",
        actor=actor,
        target_user_id=member.user_id,
        target_workspace_id=workspace_id,
        metadata={"member_id": member_id, "role": member.role},
        ip_address=ip_address,
    )
    await session.commit()


# ---------- Invitations ----------

async def list_pending_invitations(session: AsyncSession) -> list[WorkspaceInvitation]:
    from app.core.roles import STATUS_PENDING

    return (
        await session.scalars(
            select(WorkspaceInvitation)
            .where(WorkspaceInvitation.status == STATUS_PENDING)
            .order_by(WorkspaceInvitation.created_at.desc())
        )
    ).all()


async def cancel_invitation_admin(
    session: AsyncSession,
    invitation_id: str,
    actor: User,
    *,
    ip_address: str | None = None,
) -> WorkspaceInvitation:
    from app.core.roles import STATUS_CANCELLED

    invitation = await session.get(WorkspaceInvitation, invitation_id)
    if invitation is None:
        raise NotFoundError("Invitation not found.")
    if invitation.status != "PENDING":
        raise AdminError("Only pending invitations can be cancelled.", status_code=409)
    invitation.status = STATUS_CANCELLED
    invitation.cancelled_at = datetime.now(UTC)
    await _record(
        session,
        action="invitation.cancel",
        actor=actor,
        target_user_id=None,
        target_workspace_id=invitation.workspace_id,
        metadata={"invitation_id": invitation_id, "email": invitation.email},
        ip_address=ip_address,
    )
    await session.commit()
    await session.refresh(invitation)
    return invitation


def _normalize_email(email: str) -> str:
    return email.lower().strip()


async def accept_invitation_admin(
    session: AsyncSession,
    invitation_id: str,
    actor: User,
    *,
    ip_address: str | None = None,
) -> WorkspaceInvitation:
    """Validate a pending invitation immediately (super admin).

    Adds the invitee to the workspace right now and marks the invitation
    ACCEPTED, without waiting for the recipient to click the email link. The
    invitee must already have an account on the platform.
    """
    from app.services import team_service

    invitation = await session.get(WorkspaceInvitation, invitation_id)
    if invitation is None:
        raise NotFoundError("Invitation not found.")
    if invitation.status != STATUS_PENDING:
        raise AdminError("Only pending invitations can be accepted.", status_code=409)

    invitee_email = _normalize_email(invitation.email)
    invitee = await session.scalar(select(User).where(User.email == invitee_email))
    if invitee is None:
        raise AdminError(
            "The invitee has no account yet; they must register first.",
            status_code=409,
        )

    await team_service.ensure_membership(session, invitation.workspace_id, invitee.id, invitation.role)
    invitation.status = STATUS_ACCEPTED
    invitation.accepted_at = datetime.now(UTC)
    await _record(
        session,
        action="invitation.accept",
        actor=actor,
        target_user_id=invitee.id,
        target_workspace_id=invitation.workspace_id,
        metadata={"invitation_id": invitation_id, "email": invitation.email, "role": invitation.role},
        ip_address=ip_address,
    )
    await session.commit()
    await session.refresh(invitation)
    return invitation


async def update_invitation_admin(
    session: AsyncSession,
    invitation_id: str,
    actor: User,
    *,
    role: str | None = None,
    email: str | None = None,
    ip_address: str | None = None,
) -> WorkspaceInvitation:
    """Modify a pending invitation (role and/or recipient email) and re-send it.

    The token is rotated and the expiry refreshed so the updated invitation
    uses a fresh magic link addressed to the (possibly new) recipient.
    """
    from app.services import team_service

    invitation = await session.get(WorkspaceInvitation, invitation_id)
    if invitation is None:
        raise NotFoundError("Invitation not found.")
    if invitation.status != STATUS_PENDING:
        raise AdminError("Only pending invitations can be modified.", status_code=409)
    if role is not None and role not in team_service.VALID_ROLES:
        raise AdminError("Invalid role.")

    new_email = _normalize_email(email) if email else invitation.email
    if new_email != invitation.email:
        invitee = await session.scalar(select(User).where(User.email == new_email))
        if invitee is not None:
            existing = await team_service.get_membership(session, invitation.workspace_id, invitee.id)
            if existing is not None:
                raise AdminError("That user is already a member of the workspace.", status_code=409)
        duplicate = await session.scalar(
            select(WorkspaceInvitation).where(
                WorkspaceInvitation.workspace_id == invitation.workspace_id,
                WorkspaceInvitation.email == new_email,
                WorkspaceInvitation.status == STATUS_PENDING,
                WorkspaceInvitation.id != invitation.id,
            )
        )
        if duplicate is not None:
            raise AdminError("An invitation to that email is already pending for this workspace.", status_code=409)

    invitation.email = new_email
    if role is not None:
        invitation.role = role
    await _record(
        session,
        action="invitation.update",
        actor=actor,
        target_user_id=None,
        target_workspace_id=invitation.workspace_id,
        metadata={"invitation_id": invitation_id, "email": new_email, "role": invitation.role},
        ip_address=ip_address,
    )

    inviter = await session.get(User, invitation.inviter_id) if invitation.inviter_id else actor
    # Commits session (incl. the audit record above) + rotates token + re-sends.
    await team_service.resend_invitation(session, invitation, inviter)  # type: ignore[arg-type]
    await session.refresh(invitation)
    return invitation


# ---------- Audit log ----------

async def list_audit_log(
    session: AsyncSession, *, limit: int = 100, offset: int = 0, action: str | None = None
) -> list[AuditLogEntry]:
    stmt = select(AuditLogEntry).order_by(AuditLogEntry.created_at.desc()).limit(limit).offset(offset)
    if action and action.strip():
        stmt = (
            select(AuditLogEntry)
            .where(AuditLogEntry.action == action.strip())
            .order_by(AuditLogEntry.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
    return (await session.scalars(stmt)).all()


# ---------- Dashboard stats ----------

async def dashboard_stats(session: AsyncSession) -> dict:
    total_users = await session.scalar(select(func.count(User.id)))
    active_users = await session.scalar(
        select(func.count(User.id)).where(User.status == STATUS_ACTIVE)
    )
    suspended_users = await session.scalar(
        select(func.count(User.id)).where(User.status == STATUS_SUSPENDED)
    )
    deleted_users = await session.scalar(
        select(func.count(User.id)).where(User.status == STATUS_DELETED)
    )
    total_workspaces = await session.scalar(select(func.count(Workspace.id)))
    total_audit_entries = await session.scalar(select(func.count(AuditLogEntry.id)))
    recent_registrations = (
        await session.scalars(
            select(User).order_by(User.created_at.desc()).limit(8)
        )
    ).all()
    recent_actions = (
        await session.scalars(
            select(AuditLogEntry).order_by(AuditLogEntry.created_at.desc()).limit(10)
        )
    ).all()

    return {
        "total_users": total_users or 0,
        "active_users": active_users or 0,
        "suspended_users": suspended_users or 0,
        "deleted_users": deleted_users or 0,
        "total_workspaces": total_workspaces or 0,
        "total_audit_entries": total_audit_entries or 0,
        "recent_registrations": recent_registrations,
        "recent_actions": recent_actions,
    }


async def assign_super_admin(session: AsyncSession, user_id: str) -> User:
    """Set a user as SUPER_ADMIN (used to bootstrap the first admin)."""
    user = await get_user(session, user_id)
    user.role = "SUPER_ADMIN"
    await session.commit()
    await session.refresh(user)
    return user

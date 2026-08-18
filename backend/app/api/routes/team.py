"""Team / workspace invitation endpoints.

Authenticated (workspace members):
    GET    /api/team                       -> members + invitations
    POST   /api/team/invitations           -> create invitation (owner/admin)
    GET    /api/team/invitations           -> list invitations
    POST   /api/team/invitations/{id}/resend -> resend (owner/admin)
    DELETE /api/team/invitations/{id}      -> cancel (owner/admin)
    PATCH  /api/team/members/{id}          -> change role (owner/admin)
    DELETE /api/team/members/{id}          -> remove member (owner/admin)

Public (no auth - accessed by clicking the link in the email):
    GET  /api/invitations/{token}          -> invitation state
    POST /api/invitations/{token}/accept   -> accept invitation
    POST /api/invitations/{token}/reject   -> reject invitation
"""

import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user, get_optional_user
from app.database import get_db_session
from app.models import User, Workspace, WorkspaceInvitation, WorkspaceMember
from app.schemas.team import (
    InvitationAcceptOut,
    InvitationInfoOut,
    InvitationOut,
    InvitationRejectOut,
    InviteRequest,
    TeamOut,
    UpdateMemberRoleRequest,
    WorkspaceMemberOut,
)
from app.services import team_service
from app.services.team_service import InvitationError, ROLE_OWNER

logger = logging.getLogger("auditor.api.team")

team_router = APIRouter(prefix="/team", tags=["team"])
invitations_router = APIRouter(prefix="/invitations", tags=["invitations"])


def _invitation_error(exc: InvitationError):
    return HTTPException(status_code=exc.status_code, detail=exc.detail)


async def _current_workspace(
    session: AsyncSession, user: User, workspace_id: str | None = None
) -> Workspace:
    """Resolve the workspace being acted on.

    Without ``workspace_id``, the caller's personal (owned) workspace is used.
    With it, any workspace the caller belongs to can be targeted, which lets a
    plain member attempt management and be correctly rejected with 403.
    """
    if workspace_id is None:
        return await team_service.get_or_create_personal_workspace(session, user)
    membership = await team_service.get_membership(session, workspace_id, user.id)
    if membership is None:
        raise HTTPException(status_code=404, detail="Workspace not found.")
    workspace = await session.get(Workspace, workspace_id)
    if workspace is None:
        raise HTTPException(status_code=404, detail="Workspace not found.")
    return workspace


async def _require_manager(session: AsyncSession, workspace: Workspace, user: User):
    try:
        await team_service.require_manager(session, workspace.id, user.id)
    except InvitationError as exc:
        raise _invitation_error(exc) from None


async def _load_invitations(session: AsyncSession, workspace_id: str) -> list[WorkspaceInvitation]:
    return (
        await session.scalars(
            select(WorkspaceInvitation)
            .where(WorkspaceInvitation.workspace_id == workspace_id)
            .order_by(WorkspaceInvitation.created_at.desc())
        )
    ).all()


def _member_out(member: WorkspaceMember) -> WorkspaceMemberOut:
    return WorkspaceMemberOut(
        id=member.id,
        user_id=member.user_id,
        name=member.user.name if member.user else None,
        email=member.user.email if member.user else None,
        role=member.role,
        created_at=member.created_at,
    )


async def _invitation_out(
    session: AsyncSession, invitation: WorkspaceInvitation, *, email_sent: bool
) -> InvitationOut:
    inviter = (
        await session.get(User, invitation.inviter_id)
        if invitation.inviter_id is not None
        else None
    )
    return InvitationOut(
        id=invitation.id,
        email=invitation.email,
        role=invitation.role,
        inviter_id=invitation.inviter_id,
        inviter_name=inviter.name if inviter else None,
        status=invitation.status,
        created_at=invitation.created_at,
        expires_at=invitation.expires_at,
        accepted_at=invitation.accepted_at,
        rejected_at=invitation.rejected_at,
        cancelled_at=invitation.cancelled_at,
        email_sent=email_sent,
    )


# ---------- Team ----------
@team_router.get("", response_model=TeamOut)
async def get_team(
    workspace_id: str | None = None,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> TeamOut:
    workspace = await _current_workspace(session, user, workspace_id)
    members = (
        await session.scalars(
            select(WorkspaceMember)
            .where(WorkspaceMember.workspace_id == workspace.id)
            .options(selectinload(WorkspaceMember.user))
            .order_by(WorkspaceMember.created_at)
        )
    ).all()
    invitations = await _load_invitations(session, workspace.id)

    return TeamOut(
        workspace_id=workspace.id,
        workspace_name=workspace.name,
        members=[_member_out(m) for m in members],
        invitations=[await _invitation_out(session, i, email_sent=True) for i in invitations],
    )


# ---------- Invitations (management) ----------
@team_router.post("/invitations", response_model=InvitationOut, status_code=201)
async def create_invitation(
    payload: InviteRequest,
    workspace_id: str | None = None,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> InvitationOut:
    workspace = await _current_workspace(session, user, workspace_id)
    await _require_manager(session, workspace, user)
    try:
        invitation, email_sent = await team_service.create_invitation(
            session, workspace, user, payload.email, payload.role
        )
    except InvitationError as exc:
        raise _invitation_error(exc) from None
    logger.info(
        "invitation created",
        extra={"workspace_id": workspace.id, "inviter_id": user.id, "email": invitation.email, "email_sent": email_sent},
    )
    return await _invitation_out(session, invitation, email_sent=email_sent)


@team_router.get("/invitations", response_model=list[InvitationOut])
async def list_invitations(
    workspace_id: str | None = None,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> list[InvitationOut]:
    workspace = await _current_workspace(session, user, workspace_id)
    invitations = await _load_invitations(session, workspace.id)
    return [await _invitation_out(session, i, email_sent=True) for i in invitations]


@team_router.post("/invitations/{invitation_id}/resend", response_model=InvitationOut)
async def resend_invitation(
    invitation_id: str,
    workspace_id: str | None = None,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> InvitationOut:
    workspace = await _current_workspace(session, user, workspace_id)
    await _require_manager(session, workspace, user)
    invitation = await session.get(WorkspaceInvitation, invitation_id)
    if invitation is None or invitation.workspace_id != workspace.id:
        raise HTTPException(status_code=404, detail="Invitation not found.")
    try:
        invitation, email_sent = await team_service.resend_invitation(session, invitation, user)
    except InvitationError as exc:
        raise _invitation_error(exc) from None
    return await _invitation_out(session, invitation, email_sent=email_sent)


@team_router.delete("/invitations/{invitation_id}", status_code=204)
async def cancel_invitation(
    invitation_id: str,
    workspace_id: str | None = None,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> None:
    workspace = await _current_workspace(session, user, workspace_id)
    await _require_manager(session, workspace, user)
    invitation = await session.get(WorkspaceInvitation, invitation_id)
    if invitation is None or invitation.workspace_id != workspace.id:
        raise HTTPException(status_code=404, detail="Invitation not found.")
    try:
        await team_service.cancel_invitation(session, invitation)
    except InvitationError as exc:
        raise _invitation_error(exc) from None


# ---------- Members (management) ----------
@team_router.patch("/members/{member_id}", response_model=WorkspaceMemberOut)
async def change_member_role(
    member_id: str,
    payload: UpdateMemberRoleRequest,
    workspace_id: str | None = None,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> WorkspaceMemberOut:
    workspace = await _current_workspace(session, user, workspace_id)
    await _require_manager(session, workspace, user)
    member = await session.get(WorkspaceMember, member_id)
    if member is None or member.workspace_id != workspace.id:
        raise HTTPException(status_code=404, detail="Member not found.")
    if member.role == ROLE_OWNER:
        raise HTTPException(status_code=400, detail="The workspace owner's role cannot be changed.")
    member.role = payload.role
    await session.commit()
    member = await session.scalar(
        select(WorkspaceMember)
        .where(WorkspaceMember.id == member_id)
        .options(selectinload(WorkspaceMember.user))
    )
    return _member_out(member)


@team_router.delete("/members/{member_id}", status_code=204)
async def remove_member(
    member_id: str,
    workspace_id: str | None = None,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> None:
    workspace = await _current_workspace(session, user, workspace_id)
    await _require_manager(session, workspace, user)
    member = await session.get(WorkspaceMember, member_id)
    if member is None or member.workspace_id != workspace.id:
        raise HTTPException(status_code=404, detail="Member not found.")
    if member.role == ROLE_OWNER:
        raise HTTPException(status_code=400, detail="The workspace owner cannot be removed.")
    await session.delete(member)
    await session.commit()


# ---------- Public invitation handling ----------
@invitations_router.get("/{token}", response_model=InvitationInfoOut)
async def get_invitation_state(
    token: str,
    session: AsyncSession = Depends(get_db_session),
) -> InvitationInfoOut:
    invitation, workspace, inviter = await team_service.get_invitation_state(session, token)
    if invitation is None or workspace is None:
        raise HTTPException(status_code=404, detail="This invitation link is invalid or has expired.")
    return InvitationInfoOut(
        workspace_id=workspace.id,
        workspace_name=workspace.name,
        inviter_name=inviter.name if inviter else None,
        email=invitation.email,
        role=invitation.role,
        status=invitation.status,
        expires_at=invitation.expires_at,
    )


@invitations_router.post("/{token}/accept", response_model=InvitationAcceptOut)
async def accept_invitation(
    token: str,
    responder: User | None = Depends(get_optional_user),
    session: AsyncSession = Depends(get_db_session),
) -> InvitationAcceptOut:
    try:
        result = await team_service.accept_invitation(session, token, responder=responder)
    except InvitationError as exc:
        raise _invitation_error(exc) from None
    return InvitationAcceptOut(**result)


@invitations_router.post("/{token}/reject", response_model=InvitationRejectOut)
async def reject_invitation(
    token: str,
    responder: User | None = Depends(get_optional_user),
    session: AsyncSession = Depends(get_db_session),
) -> InvitationRejectOut:
    try:
        result = await team_service.reject_invitation(session, token, responder=responder)
    except InvitationError as exc:
        raise _invitation_error(exc) from None
    return InvitationRejectOut(**result)
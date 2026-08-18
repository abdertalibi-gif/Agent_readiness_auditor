"""Super admin platform management endpoints.

Every route here requires ``require_super_admin`` (enforced on the backend,
never trusted to the frontend). All mutating actions are persisted and written
to the audit log.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_super_admin
from app.database import get_db_session
from app.models import Review, User, Workspace, WorkspaceMember
from app.schemas.admin import (
    AdminAuditLogListOut,
    AdminAuditLogOut,
    AdminDashboardOut,
    AdminInvitationListOut,
    AdminInvitationOut,
    AdminInvitationUpdateRequest,
    AdminRoleChangeRequest,
    AdminUserListOut,
    AdminUserOut,
    AdminWorkspaceListOut,
    AdminWorkspaceMemberOut,
    AdminWorkspaceOut,
    AdminWorkspaceRoleChange,
)
from app.schemas.review import AdminReviewListOut, AdminReviewOut
from app.services import admin_service, review_service

logger = logging.getLogger("auditor.api.admin")

router = APIRouter(prefix="/admin", tags=["admin"])


def _client_ip(request: Request) -> str | None:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else None


def _admin_error(exc: admin_service.AdminError):
    return HTTPException(status_code=exc.status_code, detail=exc.detail)


def _user_out(user: User) -> AdminUserOut:
    return AdminUserOut(
        id=user.id,
        email=user.email,
        name=user.name,
        company_name=user.company_name,
        role=user.role,
        status=user.status,
        suspended_at=user.suspended_at,
        deleted_at=user.deleted_at,
        created_at=user.created_at,
    )


def _invitation_out(inv) -> AdminInvitationOut:
    return AdminInvitationOut(
        id=inv.id,
        workspace_id=inv.workspace_id,
        email=inv.email,
        role=inv.role,
        status=inv.status,
        created_at=inv.created_at,
        expires_at=inv.expires_at,
    )


def _review_error(exc: review_service.ReviewError) -> HTTPException:
    return HTTPException(status_code=exc.status_code, detail=exc.detail)


def _admin_review_out(review: Review) -> AdminReviewOut:
    return AdminReviewOut(
        id=review.id,
        user_id=review.user_id,
        user_name=review.user.name if review.user else None,
        user_email=review.user.email if review.user else None,
        audit_id=review.audit_id,
        audit_url=review.audit.target_url if review.audit else None,
        rating=review.rating,
        comment=review.comment,
        status=review.status,
        created_at=review.created_at,
        updated_at=review.updated_at,
    )


@router.get("/dashboard", response_model=AdminDashboardOut)
async def dashboard(
    request: Request,
    user: User = Depends(require_super_admin),
    session: AsyncSession = Depends(get_db_session),
) -> AdminDashboardOut:
    stats = await admin_service.dashboard_stats(session)
    registrations = [_user_out(u) for u in stats["recent_registrations"]]
    actions = await _audit_out_list(session, stats["recent_actions"])
    return AdminDashboardOut(
        total_users=stats["total_users"],
        active_users=stats["active_users"],
        suspended_users=stats["suspended_users"],
        deleted_users=stats["deleted_users"],
        total_workspaces=stats["total_workspaces"],
        total_audit_entries=stats["total_audit_entries"],
        recent_registrations=registrations,
        recent_actions=actions,
    )


# ---------- Users ----------
@router.get("/users", response_model=AdminUserListOut)
async def list_users(
    request: Request,
    q: str | None = Query(default=None, description="Search by name or email"),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(require_super_admin),
    session: AsyncSession = Depends(get_db_session),
) -> AdminUserListOut:
    users = await admin_service.list_users(session, search=q, limit=limit, offset=offset)
    total = await session.scalar(select(func.count(User.id)))
    return AdminUserListOut(total=total or 0, items=[_user_out(u) for u in users])


@router.get("/users/{user_id}", response_model=AdminUserOut)
async def get_user(
    user_id: str,
    request: Request,
    user: User = Depends(require_super_admin),
    session: AsyncSession = Depends(get_db_session),
) -> AdminUserOut:
    target = await admin_service.get_user(session, user_id)
    return _user_out(target)


@router.patch("/users/{user_id}/suspend", response_model=AdminUserOut)
async def suspend_user(
    user_id: str,
    request: Request,
    user: User = Depends(require_super_admin),
    session: AsyncSession = Depends(get_db_session),
) -> AdminUserOut:
    target = await admin_service.get_user(session, user_id)
    try:
        target = await admin_service.suspend_user(session, target, user, ip_address=_client_ip(request))
    except admin_service.AdminError as exc:
        raise _admin_error(exc) from None
    return _user_out(target)


@router.patch("/users/{user_id}/unsuspend", response_model=AdminUserOut)
async def unsuspend_user(
    user_id: str,
    request: Request,
    user: User = Depends(require_super_admin),
    session: AsyncSession = Depends(get_db_session),
) -> AdminUserOut:
    target = await admin_service.get_user(session, user_id)
    try:
        target = await admin_service.unsuspend_user(session, target, user, ip_address=_client_ip(request))
    except admin_service.AdminError as exc:
        raise _admin_error(exc) from None
    return _user_out(target)


@router.delete("/users/{user_id}", response_model=AdminUserOut)
async def delete_user(
    user_id: str,
    request: Request,
    user: User = Depends(require_super_admin),
    session: AsyncSession = Depends(get_db_session),
) -> AdminUserOut:
    target = await admin_service.get_user(session, user_id)
    try:
        target = await admin_service.delete_user(session, target, user, ip_address=_client_ip(request))
    except admin_service.AdminError as exc:
        raise _admin_error(exc) from None
    return _user_out(target)


@router.post("/users/{user_id}/restore", response_model=AdminUserOut)
async def restore_user(
    user_id: str,
    request: Request,
    user: User = Depends(require_super_admin),
    session: AsyncSession = Depends(get_db_session),
) -> AdminUserOut:
    target = await admin_service.get_user(session, user_id)
    try:
        target = await admin_service.restore_user(session, target, user, ip_address=_client_ip(request))
    except admin_service.AdminError as exc:
        raise _admin_error(exc) from None
    return _user_out(target)


@router.patch("/users/{user_id}/role", response_model=AdminUserOut)
async def change_user_role(
    user_id: str,
    payload: AdminRoleChangeRequest,
    request: Request,
    user: User = Depends(require_super_admin),
    session: AsyncSession = Depends(get_db_session),
) -> AdminUserOut:
    target = await admin_service.get_user(session, user_id)
    if user.id == target.id and payload.role != "SUPER_ADMIN":
        raise HTTPException(status_code=400, detail="You cannot demote your own account.")
    old_role = target.role
    target.role = payload.role
    await admin_service._record(  # noqa: SLF001 - internal, same app
        session,
        action="user.role",
        actor=user,
        target_user_id=target.id,
        metadata={"old_role": old_role, "new_role": payload.role, "email": target.email},
        ip_address=_client_ip(request),
    )
    await session.commit()
    await session.refresh(target)
    return _user_out(target)


# ---------- Workspaces ----------
@router.get("/workspaces", response_model=AdminWorkspaceListOut)
async def list_workspaces(
    request: Request,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(require_super_admin),
    session: AsyncSession = Depends(get_db_session),
) -> AdminWorkspaceListOut:
    total = await session.scalar(select(func.count(Workspace.id)))
    workspaces = await admin_service.list_workspaces(session, limit=limit, offset=offset)
    count_stmt = (
        select(WorkspaceMember.workspace_id, func.count(WorkspaceMember.id))
        .group_by(WorkspaceMember.workspace_id)
    )
    counts = dict((await session.execute(count_stmt)).all())
    items = [
        AdminWorkspaceOut(
            id=w.id,
            name=w.name,
            created_at=w.created_at,
            member_count=counts.get(w.id, 0),
        )
        for w in workspaces
    ]
    return AdminWorkspaceListOut(total=total or 0, items=items)


@router.get("/workspaces/{workspace_id}/members", response_model=list[AdminWorkspaceMemberOut])
async def workspace_members(
    workspace_id: str,
    request: Request,
    user: User = Depends(require_super_admin),
    session: AsyncSession = Depends(get_db_session),
) -> list[AdminWorkspaceMemberOut]:
    members = await admin_service.list_workspace_members(session, workspace_id)
    out = []
    for m in members:
        out.append(
            AdminWorkspaceMemberOut(
                id=m.id,
                workspace_id=m.workspace_id,
                user_id=m.user_id,
                user_name=m.user.name if m.user else None,
                user_email=m.user.email if m.user else None,
                role=m.role,
                created_at=m.created_at,
            )
        )
    return out


@router.patch("/workspaces/{workspace_id}/members/{member_id}/role", response_model=AdminWorkspaceMemberOut)
async def change_workspace_role(
    workspace_id: str,
    member_id: str,
    payload: AdminWorkspaceRoleChange,
    request: Request,
    user: User = Depends(require_super_admin),
    session: AsyncSession = Depends(get_db_session),
) -> AdminWorkspaceMemberOut:
    try:
        member = await admin_service.set_workspace_member_role(
            session, workspace_id, member_id, payload.role, user, ip_address=_client_ip(request)
        )
    except admin_service.AdminError as exc:
        raise _admin_error(exc) from None
    return AdminWorkspaceMemberOut(
        id=member.id,
        workspace_id=member.workspace_id,
        user_id=member.user_id,
        user_name=member.user.name if member.user else None,
        user_email=member.user.email if member.user else None,
        role=member.role,
        created_at=member.created_at,
    )


@router.delete("/workspaces/{workspace_id}/members/{member_id}", status_code=204)
async def remove_workspace_member(
    workspace_id: str,
    member_id: str,
    request: Request,
    user: User = Depends(require_super_admin),
    session: AsyncSession = Depends(get_db_session),
) -> None:
    try:
        await admin_service.remove_workspace_member(
            session, workspace_id, member_id, user, ip_address=_client_ip(request)
        )
    except admin_service.AdminError as exc:
        raise _admin_error(exc) from None


# ---------- Invitations ----------
@router.get("/invitations", response_model=AdminInvitationListOut)
async def list_invitations(
    request: Request,
    user: User = Depends(require_super_admin),
    session: AsyncSession = Depends(get_db_session),
) -> AdminInvitationListOut:
    invitations = await admin_service.list_pending_invitations(session)
    return AdminInvitationListOut(
        total=len(invitations),
        items=[_invitation_out(i) for i in invitations],
    )


@router.delete("/invitations/{invitation_id}", response_model=AdminInvitationOut)
async def cancel_invitation(
    invitation_id: str,
    request: Request,
    user: User = Depends(require_super_admin),
    session: AsyncSession = Depends(get_db_session),
) -> AdminInvitationOut:
    try:
        invitation = await admin_service.cancel_invitation_admin(
            session, invitation_id, user, ip_address=_client_ip(request)
        )
    except admin_service.AdminError as exc:
        raise _admin_error(exc) from None
    return _invitation_out(invitation)


@router.post("/invitations/{invitation_id}/accept", response_model=AdminInvitationOut)
async def accept_invitation(
    invitation_id: str,
    request: Request,
    user: User = Depends(require_super_admin),
    session: AsyncSession = Depends(get_db_session),
) -> AdminInvitationOut:
    try:
        invitation = await admin_service.accept_invitation_admin(
            session, invitation_id, user, ip_address=_client_ip(request)
        )
    except admin_service.AdminError as exc:
        raise _admin_error(exc) from None
    return _invitation_out(invitation)


@router.patch("/invitations/{invitation_id}", response_model=AdminInvitationOut)
async def update_invitation(
    invitation_id: str,
    payload: AdminInvitationUpdateRequest,
    request: Request,
    user: User = Depends(require_super_admin),
    session: AsyncSession = Depends(get_db_session),
) -> AdminInvitationOut:
    try:
        invitation = await admin_service.update_invitation_admin(
            session,
            invitation_id,
            user,
            role=payload.role,
            email=str(payload.email).lower().strip() if payload.email else None,
            ip_address=_client_ip(request),
        )
    except admin_service.AdminError as exc:
        raise _admin_error(exc) from None
    return _invitation_out(invitation)


# ---------- Reviews ----------
@router.get("/reviews", response_model=AdminReviewListOut)
async def list_reviews(
    request: Request,
    status: str | None = Query(default=None, description="Filter: PENDING | APPROVED | HIDDEN"),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(require_super_admin),
    session: AsyncSession = Depends(get_db_session),
) -> AdminReviewListOut:
    reviews = await review_service.list_all(session, status=status, limit=limit, offset=offset)
    total = await review_service.count_all(session, status=status)
    return AdminReviewListOut(total=total, items=[_admin_review_out(r) for r in reviews])


@router.get("/reviews/{review_id}", response_model=AdminReviewOut)
async def get_review(
    review_id: str,
    request: Request,
    user: User = Depends(require_super_admin),
    session: AsyncSession = Depends(get_db_session),
) -> AdminReviewOut:
    try:
        review = await review_service.get_review(session, review_id)
    except review_service.ReviewError as exc:
        raise _review_error(exc) from None
    return _admin_review_out(review)


async def _record_review_action(
    session: AsyncSession,
    request: Request,
    actor: User,
    review: Review,
    action: str,
) -> None:
    await admin_service._record(  # noqa: SLF001 - internal, same app
        session,
        action=action,
        actor=actor,
        target_user_id=review.user_id,
        metadata={"review_id": review.id, "rating": review.rating, "status": review.status},
        ip_address=_client_ip(request),
    )
    await session.commit()


@router.patch("/reviews/{review_id}/approve", response_model=AdminReviewOut)
async def approve_review(
    review_id: str,
    request: Request,
    user: User = Depends(require_super_admin),
    session: AsyncSession = Depends(get_db_session),
) -> AdminReviewOut:
    try:
        review = await review_service.get_review(session, review_id)
        review = await review_service.set_status(session, review, review_service.STATUS_APPROVED)
    except review_service.ReviewError as exc:
        raise _review_error(exc) from None
    await _record_review_action(session, request, user, review, "review.approve")
    return _admin_review_out(review)


@router.patch("/reviews/{review_id}/hide", response_model=AdminReviewOut)
async def hide_review(
    review_id: str,
    request: Request,
    user: User = Depends(require_super_admin),
    session: AsyncSession = Depends(get_db_session),
) -> AdminReviewOut:
    try:
        review = await review_service.get_review(session, review_id)
        review = await review_service.set_status(session, review, review_service.STATUS_HIDDEN)
    except review_service.ReviewError as exc:
        raise _review_error(exc) from None
    await _record_review_action(session, request, user, review, "review.hide")
    return _admin_review_out(review)


@router.delete("/reviews/{review_id}", status_code=204)
async def delete_review(
    review_id: str,
    request: Request,
    user: User = Depends(require_super_admin),
    session: AsyncSession = Depends(get_db_session),
) -> None:
    try:
        review = await review_service.get_review(session, review_id)
        review_id_for_log = review.id
        target_user_id = review.user_id
        metadata = {"review_id": review.id, "rating": review.rating, "status": review.status}
        await review_service.delete_review(session, review)
    except review_service.ReviewError as exc:
        raise _review_error(exc) from None
    await admin_service._record(  # noqa: SLF001 - internal, same app
        session,
        action="review.delete",
        actor=user,
        target_user_id=target_user_id,
        metadata={**metadata, "review_id": review_id_for_log},
        ip_address=_client_ip(request),
    )
    await session.commit()


# ---------- Audit log ----------
@router.get("/audit-logs", response_model=AdminAuditLogListOut)
async def list_audit_logs(
    request: Request,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    action: str | None = Query(default=None),
    user: User = Depends(require_super_admin),
    session: AsyncSession = Depends(get_db_session),
) -> AdminAuditLogListOut:
    entries = await admin_service.list_audit_log(session, limit=limit, offset=offset, action=action)
    total = await session.scalar(select(func.count(admin_service.AuditLogEntry.id)))
    return AdminAuditLogListOut(total=total or 0, items=await _audit_out_list(session, entries))


async def _audit_out_list(session: AsyncSession, entries):
    items = []
    for e in entries:
        actor = None
        if e.actor_id:
            actor = await session.get(User, e.actor_id)
        items.append(
            AdminAuditLogOut(
                id=e.id,
                actor_id=e.actor_id,
                actor_email=actor.email if actor else None,
                action=e.action,
                target_user_id=e.target_user_id,
                target_workspace_id=e.target_workspace_id,
                data=e.data,
                ip_address=e.ip_address,
                created_at=e.created_at,
            )
        )
    return items

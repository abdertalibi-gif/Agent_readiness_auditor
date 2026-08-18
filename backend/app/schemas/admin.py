"""Schemas for the super admin API."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field


# ---------- Users ----------
class AdminUserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str
    name: str | None = None
    company_name: str | None = None
    role: str
    status: str
    suspended_at: datetime | None = None
    deleted_at: datetime | None = None
    created_at: datetime


class AdminUserListOut(BaseModel):
    total: int
    items: list[AdminUserOut]


# ---------- Workspaces ----------
class AdminWorkspaceMemberOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    user_id: str
    user_name: str | None = None
    user_email: str | None = None
    role: str
    created_at: datetime


class AdminWorkspaceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    created_at: datetime
    member_count: int = 0


class AdminWorkspaceListOut(BaseModel):
    total: int
    items: list[AdminWorkspaceOut]


# ---------- Invitations ----------
class AdminInvitationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    email: str
    role: str
    status: str
    created_at: datetime
    expires_at: datetime


class AdminInvitationListOut(BaseModel):
    total: int
    items: list[AdminInvitationOut]


# ---------- Audit log ----------
class AdminAuditLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    actor_id: str | None = None
    actor_email: str | None = None
    action: str
    target_user_id: str | None = None
    target_workspace_id: str | None = None
    data: dict | None = None
    ip_address: str | None = None
    created_at: datetime


class AdminAuditLogListOut(BaseModel):
    total: int
    items: list[AdminAuditLogOut]


# ---------- Dashboard ----------
class AdminDashboardOut(BaseModel):
    total_users: int
    active_users: int
    suspended_users: int
    deleted_users: int
    total_workspaces: int
    total_audit_entries: int
    recent_registrations: list[AdminUserOut] = Field(default_factory=list)
    recent_actions: list[AdminAuditLogOut] = Field(default_factory=list)


# ---------- Requests ----------
class AdminRoleChangeRequest(BaseModel):
    role: Literal["OWNER", "ADMIN", "MEMBER"]


class AdminWorkspaceRoleChange(BaseModel):
    role: Literal["OWNER", "ADMIN", "MEMBER", "VIEWER"]


class AdminInvitationUpdateRequest(BaseModel):
    role: Literal["OWNER", "ADMIN", "MEMBER", "VIEWER"] | None = Field(
        default=None, description="New role for the pending invitation."
    )
    email: EmailStr | None = Field(
        default=None, description="New recipient email for the pending invitation."
    )

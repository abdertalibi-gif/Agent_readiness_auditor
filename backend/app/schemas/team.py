from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field

WorkspaceRole = Literal["OWNER", "ADMIN", "MEMBER", "VIEWER"]
InvitationStatus = Literal["PENDING", "ACCEPTED", "REJECTED", "EXPIRED", "CANCELLED"]


# ---------- Requests ----------
class InviteRequest(BaseModel):
    email: EmailStr = Field(description="Email of the person being invited.")
    role: WorkspaceRole = Field(default="MEMBER", description="Role to assign on acceptance.")


class UpdateMemberRoleRequest(BaseModel):
    role: WorkspaceRole = Field(description="New role for the member.")


# ---------- Responses ----------
class WorkspaceMemberOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str
    name: str | None = None
    email: str | None = None
    role: WorkspaceRole
    created_at: datetime


class InvitationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str
    role: WorkspaceRole
    inviter_id: str | None = None
    inviter_name: str | None = None
    status: InvitationStatus
    created_at: datetime
    expires_at: datetime
    accepted_at: datetime | None = None
    rejected_at: datetime | None = None
    cancelled_at: datetime | None = None
    email_sent: bool = True


class TeamOut(BaseModel):
    workspace_id: str
    workspace_name: str
    members: list[WorkspaceMemberOut]
    invitations: list[InvitationOut]


class InvitationInfoOut(BaseModel):
    """Public, safe representation of an invitation shown on the invite page."""

    workspace_id: str
    workspace_name: str
    inviter_name: str | None = None
    email: str
    role: WorkspaceRole
    status: InvitationStatus
    expires_at: datetime


class InvitationAcceptOut(BaseModel):
    ok: bool
    reason: str | None = None
    needs_registration: bool = False
    email: str | None = None
    workspace_id: str | None = None
    workspace_name: str | None = None
    role: WorkspaceRole | None = None


class InvitationRejectOut(BaseModel):
    ok: bool
    reason: str | None = None
    workspace_name: str | None = None

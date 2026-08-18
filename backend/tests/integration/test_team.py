"""Team workspace invitation system integration tests.

Covers the complete lifecycle: provisioning, invite, duplicate prevention,
accept (existing + new user auto-claim on registration), reject, expiry,
cancel, permissions (owner/admin only) and role/remove management.
"""

import re
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

import httpx
import pytest
from sqlalchemy import select

from app.config import settings
from app.models import User, WorkspaceInvitation, WorkspaceMember

# Force dev-mailbox delivery so tests never touch a real SMTP server.
settings.smtp_host = ""

MAILBOX = Path(__file__).resolve().parents[2] / "data" / "emails"
PASSWORD = "StrongPass-123"


def _fresh_email(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}@example.com"


async def _register_login(client: httpx.AsyncClient, email: str) -> dict[str, str]:
    reg = await client.post(
        "/api/auth/register",
        json={"name": "Test Person", "email": email, "password": PASSWORD, "company_name": "Acme Inc."},
    )
    assert reg.status_code == 201, reg.text
    login = await client.post("/api/auth/login", json={"email": email, "password": PASSWORD})
    assert login.status_code == 200, login.text
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


def _token_from_mailbox(invitee_email: str) -> str:
    """Extract the raw invitation token from the latest dev-mailbox email sent
    to ``invitee_email`` (the raw token is only ever sent over email). The
    message must be decoded because the .eml body is quoted-printable wrapped."""
    import email
    from email import policy

    assert MAILBOX.exists(), f"dev mailbox missing: {MAILBOX}"
    safe = invitee_email.replace("@", "_at_").replace("/", "_")
    files = sorted(MAILBOX.glob(f"*-invitation-{safe}.eml"), key=lambda p: p.name)
    assert files, f"no invitation email found for {invitee_email} in {MAILBOX}"
    with open(files[-1], encoding="utf-8") as fh:
        msg = email.message_from_file(fh, policy=policy.default)
    body = msg.get_body(preferencelist=("plain"))
    assert body is not None, "text/plain body missing from invitation email"
    text = body.get_content()
    match = re.search(r"/invite/accept\?token=(?P<token>[A-Za-z0-9_-]{20,})", text)
    assert match, "token not found in invitation email"
    return match.group("token")


async def _create_pending(
    client: httpx.AsyncClient,
    headers: dict[str, str],
    email: str,
    role: str = "MEMBER",
):
    resp = await client.post(
        "/api/team/invitations", json={"email": email, "role": role}, headers=headers
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


@pytest.fixture()
async def owner_headers(client) -> dict[str, str]:
    return await _register_login(client, _fresh_email("owner"))


@pytest.fixture()
async def owner_workspace_id(client, owner_headers) -> str:
    resp = await client.get("/api/team", headers=owner_headers)
    assert resp.status_code == 200, resp.text
    return resp.json()["workspace_id"]


# ---------- Provisioning ----------
async def test_register_provisions_personal_workspace(client, owner_headers) -> None:
    resp = await client.get("/api/team", headers=owner_headers)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["workspace_name"] == "Acme Inc. Workspace"
    assert len(data["members"]) == 1
    assert data["members"][0]["role"] == "OWNER"
    assert data["members"][0]["email"] is not None
    assert data["invitations"] == []


# ---------- Invite + accept (existing user) ----------
async def test_invite_and_accept_existing_user(
    client, owner_headers, owner_workspace_id
) -> None:
    invitee = _fresh_email("existing")
    await _register_login(client, invitee)  # existing account

    inv = await _create_pending(client, owner_headers, invitee, role="MEMBER")
    assert inv["status"] == "PENDING"
    assert inv["role"] == "MEMBER"
    assert inv["email"] == invitee
    assert inv["email_sent"] is True
    assert "token" not in inv  # raw token must never be in the API response

    # Duplicate pending invitation must be rejected.
    dup = await client.post(
        "/api/team/invitations", json={"email": invitee, "role": "MEMBER"}, headers=owner_headers
    )
    assert dup.status_code == 409, dup.text
    assert "already pending" in dup.json()["detail"].lower()

    token = _token_from_mailbox(invitee)
    state = await client.get(f"/api/invitations/{token}")
    assert state.status_code == 200, state.text
    info = state.json()
    assert info["status"] == "PENDING"
    assert info["email"] == invitee
    assert info["workspace_id"] == owner_workspace_id

    # Accept as a public caller.
    accept = await client.post(f"/api/invitations/{token}/accept")
    assert accept.status_code == 200, accept.text
    result = accept.json()
    assert result["ok"] is True
    assert result["workspace_id"] == owner_workspace_id

    # Invitee now appears as an active member in the owner's team.
    team = await client.get("/api/team", headers=owner_headers)
    emails = {m["email"]: m["role"] for m in team.json()["members"]}
    assert emails[invitee] == "MEMBER"

    # Single-use: a second accept reports the terminal state.
    again = await client.post(f"/api/invitations/{token}/accept")
    assert again.json()["ok"] is False
    assert again.json()["reason"] == "accepted"


# ---------- Reject flow ----------
async def test_reject_flow(client, owner_headers) -> None:
    invitee = _fresh_email("reject")
    await _create_pending(client, owner_headers, invitee, role="MEMBER")

    token = _token_from_mailbox(invitee)
    reject = await client.post(f"/api/invitations/{token}/reject")
    assert reject.status_code == 200, reject.text
    assert reject.json()["ok"] is True

    # Invitee was NOT added to the workspace.
    team = await client.get("/api/team", headers=owner_headers)
    emails = {m["email"] for m in team.json()["members"]}
    assert invitee not in emails

    # Re-inviting after a rejection is allowed (only PENDING is blocked).
    again = await _create_pending(client, owner_headers, invitee, role="MEMBER")
    assert again["status"] == "PENDING"


# ---------- Expired token ----------
async def test_expired_token_cannot_be_accepted(
    client, owner_headers, db_session_factory
) -> None:
    invitee = _fresh_email("expired")
    await _create_pending(client, owner_headers, invitee, role="MEMBER")
    token = _token_from_mailbox(invitee)

    async with db_session_factory() as session:
        invitation = await session.scalar(
            select(WorkspaceInvitation).where(WorkspaceInvitation.email == invitee)
        )
        assert invitation is not None
        invitation.expires_at = datetime.now(UTC) - timedelta(minutes=1)
        await session.commit()

    accept = await client.post(f"/api/invitations/{token}/accept")
    assert accept.json()["ok"] is False
    assert accept.json()["reason"] == "expired"

    team = await client.get("/api/team", headers=owner_headers)
    assert invitee not in {m["email"] for m in team.json()["members"]}


# ---------- New user: register auto-claims the pending invitation ----------
async def test_new_user_register_auto_accepts(client, owner_headers) -> None:
    invitee = _fresh_email("newbie")
    inv = await _create_pending(client, owner_headers, invitee, role="MEMBER")

    token = _token_from_mailbox(invitee)
    accept = await client.post(f"/api/invitations/{token}/accept")
    assert accept.json()["ok"] is False
    assert accept.json()["needs_registration"] is True
    assert accept.json()["email"] == invitee

    # Registering with the SAME email auto-connects the pending invitation.
    reg = await client.post(
        "/api/auth/register",
        json={"name": "New Person", "email": invitee, "password": PASSWORD},
    )
    assert reg.status_code == 201, reg.text

    team = await client.get("/api/team", headers=owner_headers)
    emails = {m["email"]: m["role"] for m in team.json()["members"]}
    assert emails[invitee] == "MEMBER"

    # The invitation is now accepted (single-use).
    again = await client.post(f"/api/invitations/{token}/accept")
    assert again.json()["ok"] is False
    assert again.json()["reason"] == "accepted"

    # And the inviter row still exists as a valid record.
    assert inv["id"]


# ---------- Cancel flow ----------
async def test_cancel_invitation(client, owner_headers) -> None:
    invitee = _fresh_email("cancel")
    inv = await _create_pending(client, owner_headers, invitee, role="MEMBER")

    cancel = await client.delete(f"/api/team/invitations/{inv['id']}", headers=owner_headers)
    assert cancel.status_code == 204

    token = _token_from_mailbox(invitee)
    accept = await client.post(f"/api/invitations/{token}/accept")
    assert accept.json()["ok"] is False
    assert accept.json()["reason"] == "cancelled"

    # Cancelling a non-pending invitation is rejected.
    again = await client.delete(f"/api/team/invitations/{inv['id']}", headers=owner_headers)
    assert again.status_code == 400


# ---------- Resend flow ----------
async def test_resend_rotates_token(client, owner_headers, db_session_factory) -> None:
    invitee = _fresh_email("resend")
    inv = await _create_pending(client, owner_headers, invitee, role="MEMBER")
    token_old = _token_from_mailbox(invitee)

    resp = await client.post(
        f"/api/team/invitations/{inv['id']}/resend", headers=owner_headers
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "PENDING"

    token_new = _token_from_mailbox(invitee)
    assert token_new != token_old  # old link is invalidated

    # The old token no longer resolves (its hash was rotated).
    state = await client.get(f"/api/invitations/{token_old}")
    assert state.status_code == 404
    # Only the NEW token can be accepted.
    accept_old = await client.post(f"/api/invitations/{token_old}/accept")
    assert accept_old.status_code == 400


# ---------- Permissions ----------
async def test_member_cannot_manage_invitations(
    client, owner_headers, owner_workspace_id
) -> None:
    invitee = _fresh_email("member-user")
    member_headers = await _register_login(client, invitee)
    await _create_pending(client, owner_headers, invitee, role="MEMBER")
    token = _token_from_mailbox(invitee)
    accept = await client.post(f"/api/invitations/{token}/accept")
    assert accept.status_code == 200, accept.text

    # A plain MEMBER cannot invite into the workspace they belong to.
    deny = await client.post(
        "/api/team/invitations",
        params={"workspace_id": owner_workspace_id},
        json={"email": _fresh_email("nope"), "role": "MEMBER"},
        headers=member_headers,
    )
    assert deny.status_code == 403, deny.text

    # And cannot manage the owner's workspace invitations.
    deny_resend = await client.post(
        "/api/team/invitations/00000000-0000-0000-0000-000000000000/resend",
        params={"workspace_id": owner_workspace_id},
        headers=member_headers,
    )
    assert deny_resend.status_code == 403, deny_resend.text

    # Members can still view their own personal workspace.
    team = await client.get("/api/team", headers=member_headers)
    assert team.status_code == 200


async def test_member_cannot_resend_or_cancel(
    client, owner_headers, owner_workspace_id
) -> None:
    invitee = _fresh_email("viewer2")
    member_headers = await _register_login(client, invitee)
    inv = await _create_pending(client, owner_headers, invitee, role="MEMBER")
    token = _token_from_mailbox(invitee)
    await client.post(f"/api/invitations/{token}/accept")

    inv2 = await _create_pending(client, owner_headers, _fresh_email("other"), role="MEMBER")
    resend = await client.post(
        f"/api/team/invitations/{inv2['id']}/resend",
        params={"workspace_id": owner_workspace_id},
        headers=member_headers,
    )
    assert resend.status_code == 403, resend.text
    cancel = await client.delete(
        f"/api/team/invitations/{inv2['id']}",
        params={"workspace_id": owner_workspace_id},
        headers=member_headers,
    )
    assert cancel.status_code == 403, cancel.text

    # Only owner/admins may change roles / remove members in that workspace.
    team = await client.get("/api/team", headers=member_headers)
    member = next(m for m in team.json()["members"] if m["email"] == invitee)
    deny_role = await client.patch(
        f"/api/team/members/{member['id']}",
        params={"workspace_id": owner_workspace_id},
        json={"role": "ADMIN"},
        headers=member_headers,
    )
    assert deny_role.status_code == 403, deny_role.text
    deny_remove = await client.delete(
        f"/api/team/members/{member['id']}",
        params={"workspace_id": owner_workspace_id},
        headers=member_headers,
    )
    assert deny_remove.status_code == 403, deny_remove.text


async def test_owner_role_management(client, owner_headers, owner_workspace_id) -> None:
    invitee = _fresh_email("admin2")
    await _register_login(client, invitee)
    inv = await _create_pending(client, owner_headers, invitee, role="MEMBER")
    token = _token_from_mailbox(invitee)
    await client.post(f"/api/invitations/{token}/accept")

    team = await client.get("/api/team", headers=owner_headers)
    member = next(m for m in team.json()["members"] if m["email"] == invitee)

    # Promote to ADMIN.
    up = await client.patch(
        f"/api/team/members/{member['id']}", json={"role": "ADMIN"}, headers=owner_headers
    )
    assert up.status_code == 200, up.text
    assert up.json()["role"] == "ADMIN"

    # Owner cannot be removed.
    owner_member = team.json()["members"][0]
    remove_owner = await client.delete(
        f"/api/team/members/{owner_member['id']}", headers=owner_headers
    )
    assert remove_owner.status_code == 400

    # Owner cannot be demoted.
    demote = await client.patch(
        f"/api/team/members/{owner_member['id']}", json={"role": "MEMBER"}, headers=owner_headers
    )
    assert demote.status_code == 400

    # A normal member cannot change roles (random user is not in this workspace).
    member_headers = await _register_login(client, _fresh_email("random-user"))
    deny = await client.patch(
        f"/api/team/members/{member['id']}",
        params={"workspace_id": owner_workspace_id},
        json={"role": "ADMIN"},
        headers=member_headers,
    )
    assert deny.status_code == 404  # no membership in that workspace


async def test_remove_member(client, owner_headers) -> None:
    invitee = _fresh_email("remove-me")
    await _register_login(client, invitee)
    inv = await _create_pending(client, owner_headers, invitee, role="MEMBER")
    token = _token_from_mailbox(invitee)
    await client.post(f"/api/invitations/{token}/accept")

    team = await client.get("/api/team", headers=owner_headers)
    member = next(m for m in team.json()["members"] if m["email"] == invitee)

    removed = await client.delete(f"/api/team/members/{member['id']}", headers=owner_headers)
    assert removed.status_code == 204

    team_after = await client.get("/api/team", headers=owner_headers)
    assert invitee not in {m["email"] for m in team_after.json()["members"]}


async def test_invite_invalid_role_rejected(client, owner_headers) -> None:
    resp = await client.post(
        "/api/team/invitations",
        json={"email": _fresh_email("badrole"), "role": "SUPERUSER"},
        headers=owner_headers,
    )
    assert resp.status_code == 422  # pydantic Literal validation


async def test_invite_invalid_email_rejected(client, owner_headers) -> None:
    resp = await client.post(
        "/api/team/invitations", json={"email": "not-an-email", "role": "MEMBER"}, headers=owner_headers
    )
    assert resp.status_code == 422


async def test_unknown_token_returns_404(client) -> None:
    resp = await client.get("/api/invitations/not-a-real-token")
    assert resp.status_code == 404


async def test_invite_requires_authentication(client) -> None:
    resp = await client.post(
        "/api/team/invitations", json={"email": _fresh_email("anon"), "role": "MEMBER"}
    )
    assert resp.status_code == 401


async def test_duplicate_membership_prevented(client, owner_headers, db_session_factory) -> None:
    """Accepting twice (e.g. via a second invite) must not duplicate membership."""
    invitee = _fresh_email("dupmem")
    await _register_login(client, invitee)
    await _create_pending(client, owner_headers, invitee, role="MEMBER")
    token = _token_from_mailbox(invitee)
    await client.post(f"/api/invitations/{token}/accept")

    team = await client.get("/api/team", headers=owner_headers)
    count = sum(1 for m in team.json()["members"] if m["email"] == invitee)
    assert count == 1


async def _db_invitation(db_session_factory, invitation_id: str) -> WorkspaceInvitation:
    async with db_session_factory() as session:
        return await session.get(WorkspaceInvitation, invitation_id)


async def _db_membership_count(
    db_session_factory, workspace_id: str, user_email: str
) -> int:
    async with db_session_factory() as session:
        user = await session.scalar(select(User).where(User.email == user_email))
        if user is None:
            return 0
        return len(
            (
                await session.scalars(
                    select(WorkspaceMember).where(
                        WorkspaceMember.workspace_id == workspace_id,
                        WorkspaceMember.user_id == user.id,
                    )
                )
            ).all()
        )


# ---------- End-to-end workflow with database state as source of truth ----------
async def test_accept_workflow_db_state(
    client, owner_headers, owner_workspace_id, db_session_factory
) -> None:
    """Send -> PENDING in DB -> accept -> ACCEPTED in DB -> membership exactly once
    -> second accept handled safely (no dup membership, no 5xx)."""
    invitee = _fresh_email("accept-db")
    recipient_headers = await _register_login(client, invitee)

    inv = await _create_pending(client, owner_headers, invitee, role="MEMBER")
    token = _token_from_mailbox(invitee)

    # 2. Invitation record exists with PENDING status.
    row = await _db_invitation(db_session_factory, inv["id"])
    assert row is not None
    assert row.status == "PENDING"
    assert row.email == invitee
    assert row.workspace_id == owner_workspace_id
    assert row.accepted_at is None and row.rejected_at is None

    # 3. Accept.
    accept = await client.post(f"/api/invitations/{token}/accept")
    assert accept.status_code == 200, accept.text
    assert accept.json()["ok"] is True

    # 4. DB status becomes ACCEPTED.
    row = await _db_invitation(db_session_factory, inv["id"])
    assert row.status == "ACCEPTED"
    assert row.accepted_at is not None
    assert row.rejected_at is None

    # 5. Membership created exactly once.
    assert await _db_membership_count(db_session_factory, owner_workspace_id, invitee) == 1

    # 7. Attempting to accept the same invitation again is handled safely.
    again = await client.post(f"/api/invitations/{token}/accept")
    assert again.status_code == 200, again.text
    assert again.json()["ok"] is False
    assert again.json()["reason"] == "accepted"
    assert await _db_membership_count(db_session_factory, owner_workspace_id, invitee) == 1


async def test_reject_workflow_db_state(
    client, owner_headers, owner_workspace_id, db_session_factory
) -> None:
    """Send -> PENDING in DB -> reject -> REJECTED in DB -> no membership
    -> second reject handled safely."""
    invitee = _fresh_email("reject-db")
    await _register_login(client, invitee)
    inv = await _create_pending(client, owner_headers, invitee, role="MEMBER")
    token = _token_from_mailbox(invitee)

    row = await _db_invitation(db_session_factory, inv["id"])
    assert row.status == "PENDING"

    # Refuse.
    reject = await client.post(f"/api/invitations/{token}/reject")
    assert reject.status_code == 200, reject.text
    assert reject.json()["ok"] is True

    # DB status becomes REJECTED.
    row = await _db_invitation(db_session_factory, inv["id"])
    assert row.status == "REJECTED"
    assert row.rejected_at is not None
    assert row.accepted_at is None

    # No team membership is created.
    assert await _db_membership_count(db_session_factory, owner_workspace_id, invitee) == 0

    # Second reject handled safely.
    again = await client.post(f"/api/invitations/{token}/reject")
    assert again.status_code == 200, again.text
    assert again.json()["ok"] is False
    assert again.json()["reason"] == "rejected"
    assert await _db_membership_count(db_session_factory, owner_workspace_id, invitee) == 0


async def test_unauthorized_user_cannot_accept_or_reject(
    client, owner_headers, owner_workspace_id, db_session_factory
) -> None:
    """An authenticated user who is NOT the recipient must not be able to
    accept or reject someone else's invitation (403), and the invitation must
    stay PENDING and usable by the real recipient."""
    invitee = _fresh_email("victim")
    recipient_headers = await _register_login(client, invitee)
    inv = await _create_pending(client, owner_headers, invitee, role="MEMBER")
    token = _token_from_mailbox(invitee)

    attacker_headers = await _register_login(client, _fresh_email("attacker"))

    deny = await client.post(f"/api/invitations/{token}/accept", headers=attacker_headers)
    assert deny.status_code == 403, deny.text

    deny = await client.post(f"/api/invitations/{token}/reject", headers=attacker_headers)
    assert deny.status_code == 403, deny.text

    # Still PENDING, no membership created, DB untouched by the attacker.
    row = await _db_invitation(db_session_factory, inv["id"])
    assert row.status == "PENDING"
    assert await _db_membership_count(db_session_factory, owner_workspace_id, invitee) == 0

    # The real recipient (authenticated) CAN accept.
    accept = await client.post(f"/api/invitations/{token}/accept", headers=recipient_headers)
    assert accept.status_code == 200, accept.text
    assert accept.json()["ok"] is True
    assert await _db_membership_count(db_session_factory, owner_workspace_id, invitee) == 1


async def test_invite_existing_member_rejected(client, owner_headers) -> None:
    """Inviting someone who is already a workspace member must fail (409)."""
    invitee = _fresh_email("already-member")
    await _register_login(client, invitee)
    inv = await _create_pending(client, owner_headers, invitee, role="MEMBER")
    token = _token_from_mailbox(invitee)
    accept = await client.post(f"/api/invitations/{token}/accept")
    assert accept.status_code == 200, accept.text

    # Now a member - a fresh invitation must be refused.
    resp = await client.post(
        "/api/team/invitations", json={"email": invitee, "role": "MEMBER"}, headers=owner_headers
    )
    assert resp.status_code == 409, resp.text
    assert "already a member" in resp.json()["detail"].lower()


async def test_cancel_db_state(
    client, owner_headers, owner_workspace_id, db_session_factory
) -> None:
    """Cancel flips the DB to CANCELLED, stamps cancelled_at and never adds a
    member."""
    invitee = _fresh_email("cancel-db")
    await _register_login(client, invitee)
    inv = await _create_pending(client, owner_headers, invitee, role="MEMBER")

    cancel = await client.delete(f"/api/team/invitations/{inv['id']}", headers=owner_headers)
    assert cancel.status_code == 204

    row = await _db_invitation(db_session_factory, inv["id"])
    assert row.status == "CANCELLED"
    assert row.cancelled_at is not None
    assert row.accepted_at is None and row.rejected_at is None
    assert await _db_membership_count(db_session_factory, owner_workspace_id, invitee) == 0

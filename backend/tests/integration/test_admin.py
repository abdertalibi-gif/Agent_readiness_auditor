"""Super admin platform management integration tests.

Covers authorization (only SUPER_ADMIN), user management (suspend/unsuspend/
soft-delete/restore), session invalidation, login blocking, workspace member
management, invitation cancellation and the audit trail, all against a real
SQLite DB via the API.
"""

import uuid

import httpx
import pytest
from sqlalchemy import select

from app.config import settings
from app.models import AuthSession, User

settings.smtp_host = ""

PASSWORD = "StrongPass-123"


def _email(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}@example.com"


async def _register(client: httpx.AsyncClient, email: str, name: str = "Admin Test User"):
    reg = await client.post(
        "/api/auth/register",
        json={"name": name, "email": email, "password": PASSWORD, "company_name": "Acme Inc."},
    )
    assert reg.status_code == 201, reg.text
    return reg.json()


async def _login(client: httpx.AsyncClient, email: str) -> dict[str, str]:
    login = await client.post("/api/auth/login", json={"email": email, "password": PASSWORD})
    assert login.status_code == 200, login.text
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


async def _make_admin(client, db_session_factory, email: str) -> str:
    """Register + login a normal user, then elevate to SUPER_ADMIN in the DB."""
    user = await _register(client, email)
    async with db_session_factory() as session:
        u = await session.get(User, user["id"])
        assert u is not None
        u.role = "SUPER_ADMIN"
        await session.commit()
    headers = await _login(client, email)
    return headers


@pytest.fixture()
async def admin_headers(client, db_session_factory) -> dict[str, str]:
    return await _make_admin(client, db_session_factory, _email("superadmin"))


# ---------- Authorization ----------
async def test_normal_user_cannot_access_admin(client) -> None:
    headers = await _register_login_normal(client)
    resp = await client.get("/api/admin/users", headers=headers)
    assert resp.status_code == 403, resp.text
    resp = await client.get("/api/admin/workspaces", headers=headers)
    assert resp.status_code == 403
    resp = await client.get("/api/admin/audit-logs", headers=headers)
    assert resp.status_code == 403


async def test_anon_cannot_access_admin(client) -> None:
    resp = await client.get("/api/admin/users")
    assert resp.status_code in (401, 403)


# ---------- User management ----------
async def test_admin_list_and_search_users(client, admin_headers) -> None:
    await _register(client, _email("target-list"))
    resp = await client.get("/api/admin/users", headers=admin_headers)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["total"] >= 1
    assert isinstance(body["items"], list)

    # Search by a distinctive email fragment.
    probe = _email("searchme")
    await _register(client, probe)
    resp = await client.get("/api/admin/users", params={"q": probe.split("@")[0]}, headers=admin_headers)
    assert resp.status_code == 200
    assert any(u["email"] == probe for u in resp.json()["items"])


async def test_suspend_blocks_login_and_api_and_revokes_sessions(
    client, admin_headers, db_session_factory
) -> None:
    user = await _register(client, _email("victim-sus"))
    victim_headers = await _login(client, user["email"])

    # Confirm the victim token currently works.
    me = await client.get("/api/auth/me", headers=victim_headers)
    assert me.status_code == 200

    # Suspend via admin (own account is protected, so use a normal victim).
    resp = await client.patch(f"/api/admin/users/{user['id']}/suspend", headers=admin_headers)
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "SUSPENDED"

    # Existing session is now invalid -> 403 suspended.
    me = await client.get("/api/auth/me", headers=victim_headers)
    assert me.status_code == 403, me.text
    assert "suspended" in me.json()["detail"].lower()

    # Login is refused.
    login = await client.post("/api/auth/login", json={"email": user["email"], "password": PASSWORD})
    assert login.status_code == 403, login.text

    # The original session row is revoked in the DB.
    async with db_session_factory() as session:
        sessions = (
            await session.scalars(select(AuthSession).where(AuthSession.user_id == user["id"]))
        ).all()
        assert sessions and all(s.revoked_at is not None for s in sessions)


async def test_unsuspend_restores_access(client, admin_headers) -> None:
    user = await _register(client, _email("victim-un"))
    await client.patch(f"/api/admin/users/{user['id']}/suspend", headers=admin_headers)
    resp = await client.patch(f"/api/admin/users/{user['id']}/unsuspend", headers=admin_headers)
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "ACTIVE"

    login = await client.post("/api/auth/login", json={"email": user["email"], "password": PASSWORD})
    assert login.status_code == 200, login.text

    # Suspend again now that it is active returns 409.
    resp = await client.patch(f"/api/admin/users/{user['id']}/suspend", headers=admin_headers)
    assert resp.status_code == 200
    dup = await client.patch(f"/api/admin/users/{user['id']}/suspend", headers=admin_headers)
    assert dup.status_code == 409


async def test_delete_is_soft_and_restorable(client, admin_headers, db_session_factory) -> None:
    user = await _register(client, _email("victim-del"))
    victim_headers = await _login(client, user["email"])

    resp = await client.delete(f"/api/admin/users/{user['id']}", headers=admin_headers)
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "DELETED"

    # Row still exists (soft delete), flagged deleted.
    async with db_session_factory() as session:
        u = await session.get(User, user["id"])
        assert u is not None
        assert u.status == "DELETED" and u.deleted_at is not None

    # Can no longer login.
    login = await client.post("/api/auth/login", json={"email": user["email"], "password": PASSWORD})
    assert login.status_code == 401, login.text

    # Existing session invalid.
    me = await client.get("/api/auth/me", headers=victim_headers)
    assert me.status_code == 403

    # Restore.
    resp = await client.post(f"/api/admin/users/{user['id']}/restore", headers=admin_headers)
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "ACTIVE"
    login = await client.post("/api/auth/login", json={"email": user["email"], "password": PASSWORD})
    assert login.status_code == 200


async def test_admin_cannot_suspend_or_delete_self(
    client, admin_headers, db_session_factory
) -> None:
    # Figure out the admin's own id from /me.
    me = await client.get("/api/auth/me", headers=admin_headers)
    my_id = me.json()["id"]

    resp = await client.patch(f"/api/admin/users/{my_id}/suspend", headers=admin_headers)
    assert resp.status_code == 400, resp.text

    resp = await client.delete(f"/api/admin/users/{my_id}", headers=admin_headers)
    assert resp.status_code == 400, resp.text


# ---------- Workspace management ----------
async def test_admin_lists_workspaces_and_manages_members(client, admin_headers) -> None:
    owner = await _register(client, _email("ws-owner"))
    owner_headers = await _login(client, owner["email"])

    # Create a workspace (provisioned on registration) and invite a member who accepts.
    team = await client.get("/api/team", headers=owner_headers)
    ws_id = team.json()["workspace_id"]

    invitee = await _register(client, _email("ws-invitee"))
    inv = await client.post(
        "/api/team/invitations", json={"email": invitee["email"], "role": "MEMBER"}, headers=owner_headers
    )
    assert inv.status_code == 201, inv.text

    from tests.integration.test_team import _token_from_mailbox

    token = _token_from_mailbox(invitee["email"])
    accept = await client.post(f"/api/invitations/{token}/accept", headers=await _login(client, invitee["email"]))
    assert accept.status_code == 200, accept.text

    # Admin sees the workspace and its members.
    ws = await client.get("/api/admin/workspaces", headers=admin_headers)
    assert ws.status_code == 200
    found = next((w for w in ws.json()["items"] if w["id"] == ws_id), None)
    assert found is not None
    assert found["member_count"] >= 2

    members = await client.get(f"/api/admin/workspaces/{ws_id}/members", headers=admin_headers)
    assert members.status_code == 200, members.text
    member_list = members.json()
    member = next(m for m in member_list if m["user_email"] == invitee["email"])

    # Admin can change a member's role.
    change = await client.patch(
        f"/api/admin/workspaces/{ws_id}/members/{member['id']}/role",
        json={"role": "ADMIN"},
        headers=admin_headers,
    )
    assert change.status_code == 200, change.text
    assert change.json()["role"] == "ADMIN"

    # Admin can remove a member.
    removed = await client.delete(
        f"/api/admin/workspaces/{ws_id}/members/{member['id']}", headers=admin_headers
    )
    assert removed.status_code == 204, removed.text


# ---------- Invitations ----------
async def test_admin_lists_and_cancels_pending_invitation(client, admin_headers) -> None:
    from tests.integration.test_team import _token_from_mailbox

    owner = await _register(client, _email("inv-owner"))
    owner_headers = await _login(client, owner["email"])
    invitee_email = _email("inv-target")
    inv = await client.post(
        "/api/team/invitations", json={"email": invitee_email, "role": "MEMBER"}, headers=owner_headers
    )
    assert inv.status_code == 201, inv.text
    inv_id = inv.json()["id"]

    resp = await client.get("/api/admin/invitations", headers=admin_headers)
    assert resp.status_code == 200, resp.text
    assert any(i["id"] == inv_id for i in resp.json()["items"])

    cancel = await client.delete(f"/api/admin/invitations/{inv_id}", headers=admin_headers)
    assert cancel.status_code == 200, cancel.text
    assert cancel.json()["status"] == "CANCELLED"

    # The token is now unusable.
    token = _token_from_mailbox(invitee_email)
    accept = await client.post(f"/api/invitations/{token}/accept")
    assert accept.json()["ok"] is False


async def test_admin_accepts_pending_invitation_immediately(client, admin_headers) -> None:
    from tests.integration.test_team import _token_from_mailbox

    owner = await _register(client, _email("acc-owner"))
    owner_headers = await _login(client, owner["email"])
    invitee = await _register(client, _email("acc-invitee"))

    inv = await client.post(
        "/api/team/invitations", json={"email": invitee["email"], "role": "MEMBER"}, headers=owner_headers
    )
    assert inv.status_code == 201, inv.text
    inv_id = inv.json()["id"]
    team = await client.get("/api/team", headers=owner_headers)
    workspace_id = team.json()["workspace_id"]

    # Admin validates the invitation immediately -> ACCEPTED + membership.
    accept = await client.post(f"/api/admin/invitations/{inv_id}/accept", headers=admin_headers)
    assert accept.status_code == 200, accept.text
    assert accept.json()["status"] == "ACCEPTED"

    members = await client.get(
        f"/api/admin/workspaces/{workspace_id}/members", headers=admin_headers
    )
    assert members.status_code == 200
    member_emails = [m["user_email"] for m in members.json()]
    assert invitee["email"] in member_emails

    # The magic link is now dead.
    token = _token_from_mailbox(invitee["email"])
    stale = await client.post(f"/api/invitations/{token}/accept")
    assert stale.json()["ok"] is False


async def test_admin_accept_requires_existing_account(client, admin_headers) -> None:
    owner = await _register(client, _email("acc-noacct-owner"))
    owner_headers = await _login(client, owner["email"])

    inv = await client.post(
        "/api/team/invitations",
        json={"email": _email("acc-noacct-target"), "role": "MEMBER"},
        headers=owner_headers,
    )
    assert inv.status_code == 201, inv.text

    accept = await client.post(f"/api/admin/invitations/{inv.json()['id']}/accept", headers=admin_headers)
    assert accept.status_code == 409, accept.text


async def test_admin_modifies_pending_invitation_role_and_email(client, admin_headers) -> None:
    from tests.integration.test_team import _token_from_mailbox

    owner = await _register(client, _email("mod-owner"))
    owner_headers = await _login(client, owner["email"])
    old_email = _email("mod-original-target")
    new_email = _email("mod-new-target")
    new_invitee = await _register(client, new_email)

    inv = await client.post(
        "/api/team/invitations", json={"email": old_email, "role": "MEMBER"}, headers=owner_headers
    )
    assert inv.status_code == 201, inv.text
    inv_id = inv.json()["id"]
    team = await client.get("/api/team", headers=owner_headers)
    workspace_id = team.json()["workspace_id"]

    # Update role + recipient.
    update = await client.patch(
        f"/api/admin/invitations/{inv_id}",
        json={"role": "ADMIN", "email": new_email},
        headers=admin_headers,
    )
    assert update.status_code == 200, update.text
    assert update.json()["status"] == "PENDING"
    assert update.json()["email"] == new_email
    assert update.json()["role"] == "ADMIN"

    # The new recipient can accept with the fresh magic link.
    new_headers = await _login(client, new_invitee["email"])
    token = _token_from_mailbox(new_email)
    accept = await client.post(f"/api/invitations/{token}/accept", headers=new_headers)
    assert accept.status_code == 200, accept.text
    assert accept.json()["ok"] is True and accept.json()["role"] == "ADMIN"
    assert accept.json()["workspace_id"] == workspace_id

    members = await client.get(
        f"/api/admin/workspaces/{workspace_id}/members", headers=admin_headers
    )
    member = next(m for m in members.json() if m["user_email"] == new_email)
    assert member["role"] == "ADMIN"


# ---------- Audit log ----------
async def test_audit_log_records_actions(client, admin_headers, db_session_factory) -> None:
    user = await _register(client, _email("log-target"))
    await client.patch(f"/api/admin/users/{user['id']}/suspend", headers=admin_headers)
    await client.patch(f"/api/admin/users/{user['id']}/unsuspend", headers=admin_headers)
    await client.delete(f"/api/admin/users/{user['id']}", headers=admin_headers)
    await client.post(f"/api/admin/users/{user['id']}/restore", headers=admin_headers)

    resp = await client.get("/api/admin/audit-logs", headers=admin_headers)
    assert resp.status_code == 200, resp.text
    actions = [e["action"] for e in resp.json()["items"]]
    for expected in ("user.suspend", "user.unsuspend", "user.delete", "user.restore"):
        assert expected in actions, f"missing {expected} in {actions}"

    # Filter by action.
    resp = await client.get("/api/admin/audit-logs", params={"action": "user.delete"}, headers=admin_headers)
    assert all(e["action"] == "user.delete" for e in resp.json()["items"])


async def test_dashboard_stats(client, admin_headers) -> None:
    resp = await client.get("/api/admin/dashboard", headers=admin_headers)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["total_users"] >= 1
    assert body["active_users"] >= 1
    assert body["total_workspaces"] >= 1


# ---------- helpers ----------
async def _register_login_normal(client) -> dict[str, str]:
    """Register + login a normal (non-admin) user."""
    user = await _register(client, _email("normal"))
    return await _login(client, user["email"])

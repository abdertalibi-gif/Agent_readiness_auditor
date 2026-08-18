"""Authentication endpoint tests: register, login, me, logout invalidation."""

import uuid

import pytest


@pytest.mark.asyncio
async def test_register_login_me(client):
    email = f"auth-{uuid.uuid4().hex[:8]}@example.com"
    reg = await client.post(
        "/api/auth/register",
        json={
            "name": "Jane Cooper",
            "email": email,
            "password": "SuperSecret-123",
            "company_name": "Cooper & Co",
        },
    )
    assert reg.status_code == 201
    user = reg.json()
    assert user["email"] == email
    assert user["name"] == "Jane Cooper"
    assert user["company_name"] == "Cooper & Co"
    assert "password" not in user and "password_hash" not in user

    login = await client.post("/api/auth/login", json={"email": email, "password": "SuperSecret-123"})
    assert login.status_code == 200
    body = login.json()
    assert body["token_type"] == "bearer"
    assert body["access_token"]
    assert body["user"]["id"] == user["id"]

    headers = {"Authorization": f"Bearer {body['access_token']}"}
    me = await client.get("/api/auth/me", headers=headers)
    assert me.status_code == 200
    assert me.json()["id"] == user["id"]


@pytest.mark.asyncio
async def test_register_rejects_duplicate_email(client):
    email = f"dup-{uuid.uuid4().hex[:8]}@example.com"
    first = await client.post(
        "/api/auth/register",
        json={"name": "First", "email": email, "password": "SuperSecret-123"},
    )
    assert first.status_code == 201
    second = await client.post(
        "/api/auth/register",
        json={"name": "Second", "email": email, "password": "SuperSecret-123"},
    )
    assert second.status_code == 409


@pytest.mark.asyncio
async def test_login_rejects_bad_credentials(client):
    email = f"bad-{uuid.uuid4().hex[:8]}@example.com"
    await client.post(
        "/api/auth/register",
        json={"name": "Bad", "email": email, "password": "SuperSecret-123"},
    )
    wrong_pass = await client.post("/api/auth/login", json={"email": email, "password": "nope"})
    assert wrong_pass.status_code == 401
    unknown = await client.post(
        "/api/auth/login", json={"email": f"nobody-{uuid.uuid4().hex[:8]}@example.com", "password": "nope"}
    )
    assert unknown.status_code == 401


@pytest.mark.asyncio
async def test_short_password_rejected(client):
    resp = await client.post(
        "/api/auth/register",
        json={"name": "X", "email": f"x-{uuid.uuid4().hex[:8]}@example.com", "password": "short"},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_logout_revokes_token(client):
    email = f"out-{uuid.uuid4().hex[:8]}@example.com"
    await client.post(
        "/api/auth/register",
        json={"name": "Out", "email": email, "password": "SuperSecret-123"},
    )
    login = await client.post("/api/auth/login", json={"email": email, "password": "SuperSecret-123"})
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    assert (await client.get("/api/auth/me", headers=headers)).status_code == 200

    logout = await client.post("/api/auth/logout", headers=headers)
    assert logout.status_code == 204

    # The same token must now be rejected everywhere.
    assert (await client.get("/api/auth/me", headers=headers)).status_code == 401
    assert (await client.get("/api/audits", headers=headers)).status_code == 401


@pytest.mark.asyncio
async def test_me_requires_auth(client):
    assert (await client.get("/api/auth/me")).status_code == 401
    assert (await client.get("/api/auth/me", headers={"Authorization": "Bearer garbage"})).status_code == 401
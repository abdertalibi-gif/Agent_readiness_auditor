"""API integration tests: full audit lifecycle against the mock site."""

import pytest


async def _wait_complete(client, audit_id, headers, timeout=30):
    import asyncio

    for _ in range(int(timeout / 0.05)):
        resp = await client.get(f"/api/audits/{audit_id}/status", headers=headers)
        status = resp.json()
        if status["status"] in ("COMPLETED", "PARTIAL", "FAILED", "CANCELLED"):
            return status
        await asyncio.sleep(0.05)
    raise TimeoutError("audit did not complete")


@pytest.mark.asyncio
async def test_health(client):
    resp = await client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


@pytest.mark.asyncio
async def test_anonymous_audits_allowed_in_free_mode(client):
    # In FREE MODE (default), anonymous audit creation should work
    resp = await client.post("/api/audits", json={"url": "https://example.com"})
    assert resp.status_code == 201
    audit = resp.json()
    assert audit["id"]
    assert audit["status"] in ("QUEUED", "RUNNING")
    assert audit["user_id"] is None  # Anonymous audit

    # Can view the anonymous audit without auth
    status = await client.get(f"/api/audits/{audit['id']}/status")
    assert status.status_code == 200
    assert status.json()["id"] == audit["id"]


@pytest.mark.asyncio
async def test_audits_require_auth_when_monetization_enabled(client, monkeypatch):
    # When monetization is enabled, auth is required
    from app.config import settings
    monkeypatch.setattr(settings, "monetization_enabled", True)
    
    resp = await client.post("/api/audits", json={"url": "https://example.com"})
    assert resp.status_code == 401
    resp = await client.get("/api/audits")
    assert resp.status_code == 401
    resp = await client.get("/api/audits/some-id")
    assert resp.status_code == 404  # Not found (404) vs auth required (401)


@pytest.mark.asyncio
async def test_start_audit_rejects_invalid_url(client, user_headers):
    resp = await client.post("/api/audits", json={"url": "not-a-url"}, headers=user_headers)
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_start_audit_rejects_private_url(client, user_headers):
    # localhost is on the hard blocklist and is rejected even in dev mode.
    resp = await client.post("/api/audits", json={"url": "http://localhost:8000"}, headers=user_headers)
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_full_audit_lifecycle(client, mock_site, user_headers):
    resp = await client.post("/api/audits", json={"url": mock_site}, headers=user_headers)
    assert resp.status_code == 201
    audit = resp.json()
    assert audit["id"]
    assert audit["status"] in ("QUEUED", "RUNNING")

    status = await _wait_complete(client, audit["id"], user_headers)
    assert status["status"] in ("COMPLETED", "PARTIAL")

    summary = (await client.get(f"/api/audits/{audit['id']}/summary", headers=user_headers)).json()
    assert summary["score"] is not None
    assert 0 <= summary["score"] <= 100
    assert summary["rating"] in ("EXCELLENT", "GOOD", "MODERATE", "POOR", "CRITICAL")
    assert len(summary["categories"]) == 8

    issues = (await client.get(f"/api/audits/{audit['id']}/issues", headers=user_headers)).json()
    assert issues["total"] > 0

    pages = (await client.get(f"/api/audits/{audit['id']}/pages", headers=user_headers)).json()
    assert len(pages) >= 3

    recs = (await client.get(f"/api/audits/{audit['id']}/recommendations", headers=user_headers)).json()
    assert isinstance(recs, list)


@pytest.mark.asyncio
async def test_list_audits_is_scoped_to_user(client, mock_site, user_headers, second_user_headers):
    mine = await client.post("/api/audits", json={"url": mock_site}, headers=user_headers)
    assert mine.status_code == 201
    audit_id = mine.json()["id"]

    others = await client.get("/api/audits", headers=second_user_headers)
    assert others.status_code == 200
    assert all(a["id"] != audit_id for a in others.json())

    mine_list = await client.get("/api/audits", headers=user_headers)
    assert mine_list.status_code == 200
    assert any(a["id"] == audit_id for a in mine_list.json())


@pytest.mark.asyncio
async def test_audit_ownership_enforced(client, mock_site, user_headers, second_user_headers):
    resp = await client.post("/api/audits", json={"url": mock_site}, headers=user_headers)
    audit_id = resp.json()["id"]

    # User A can read their own audit.
    own = await client.get(f"/api/audits/{audit_id}", headers=user_headers)
    assert own.status_code == 200

    # User B cannot read User A's audit -> 403.
    for path in (f"/api/audits/{audit_id}", f"/api/audits/{audit_id}/status"):
        forbidden = await client.get(path, headers=second_user_headers)
        assert forbidden.status_code == 403


@pytest.mark.asyncio
async def test_issues_filters(client, mock_site, user_headers):
    resp = await client.post("/api/audits", json={"url": mock_site}, headers=user_headers)
    audit_id = resp.json()["id"]
    await _wait_complete(client, audit_id, user_headers)

    issues = (await client.get(f"/api/audits/{audit_id}/issues?status=FAIL", headers=user_headers)).json()
    assert all(i["status"] == "FAIL" for i in issues["items"])


@pytest.mark.asyncio
async def test_audit_not_found(client, user_headers):
    resp = await client.get("/api/audits/nonexistent", headers=user_headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_report_pdf(client, mock_site, user_headers):
    resp = await client.post("/api/audits", json={"url": mock_site}, headers=user_headers)
    audit_id = resp.json()["id"]
    await _wait_complete(client, audit_id, user_headers)

    report = await client.get(f"/api/audits/{audit_id}/report", headers=user_headers)
    assert report.status_code == 200
    assert report.headers["content-type"] == "application/pdf"
    assert report.content.startswith(b"%PDF")


@pytest.mark.asyncio
async def test_cancel_queued_audit(client, mock_site, user_headers):
    resp = await client.post("/api/audits", json={"url": mock_site}, headers=user_headers)
    audit_id = resp.json()["id"]
    cancel = await client.post(f"/api/audits/{audit_id}/cancel", headers=user_headers)
    assert cancel.status_code == 200
    assert cancel.json()["status"] == "CANCELLED"
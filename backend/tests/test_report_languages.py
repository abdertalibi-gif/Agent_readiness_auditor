"""Test report generation for all languages - ensures no 500 for ar/fr/en."""
import uuid
import pytest
from httpx import AsyncClient

# Use a known audit ID for the specific production test, but fallback to creating a new one
TARGET_AUDIT_ID = "a966b867fe7e47dfad03a46ac98eb490"


@pytest.mark.asyncio
async def test_report_languages_for_existing_audit(client: AsyncClient):
    # Try to use the target audit if it exists, otherwise create a new one for testing
    # First, try to get the target audit's report (requires auth, may be 401/404, not 500)
    # Instead, create a fresh audit for deterministic testing
    # Create a test user and audit via conftest fixtures would be better, but we want a standalone test
    # We'll use the client fixture which is unauthenticated - need to create an anonymous audit if allowed
    # For this test, we just verify the route exists and doesn't 500 for a completed audit we create

    # Create an audit via the API (anonymous if allowed)
    resp = await client.post("/api/audits", json={"url": "https://example.com"})
    # In some modes this may require auth, so we handle both
    if resp.status_code == 401:
        # Need auth - create a user first
        email = f"report-test-{uuid.uuid4().hex[:8]}@example.com"
        reg = await client.post("/api/auth/register", json={
            "name": "Report Tester",
            "email": email,
            "password": "Test1234!Aa",
            "company_name": "Test",
            "preferred_language": "en"
        })
        assert reg.status_code in (200, 201), f"register failed {reg.status_code} {reg.text}"
        login = await client.post("/api/auth/login", json={"email": email, "password": "Test1234!Aa"})
        assert login.status_code == 200, f"login failed {login.text}"
        token = login.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        resp = await client.post("/api/audits", json={"url": "https://example.com"}, headers=headers)
        assert resp.status_code == 201, f"audit create failed {resp.text}"
        audit_id = resp.json()["id"]
        # Poll for completion (use sqlite inline mode, should be quick)
        import asyncio
        for _ in range(20):
            s = await client.get(f"/api/audits/{audit_id}/status", headers=headers)
            assert s.status_code == 200
            if s.json()["status"] in ("COMPLETED", "PARTIAL", "FAILED"):
                break
            await asyncio.sleep(1)
        # Test reports with auth headers
        for lang in ["en", "fr", "ar"]:
            r = await client.get(f"/api/audits/{audit_id}/report?lang={lang}", headers=headers)
            # Should be 200 with PDF, not 500
            assert r.status_code == 200, f"report lang={lang} failed {r.status_code} {r.text[:500]}"
            assert r.headers.get("content-type") == "application/pdf"
            assert len(r.content) > 1000, f"report too small for {lang}"
            # Also test invalid language falls back to en (should still be 200)
        # Test invalid lang
        r_inv = await client.get(f"/api/audits/{audit_id}/report?lang=xx", headers=headers)
        assert r_inv.status_code == 200
        assert r_inv.headers.get("content-type") == "application/pdf"
        # Test missing lang (default en)
        r_def = await client.get(f"/api/audits/{audit_id}/report", headers=headers)
        assert r_def.status_code == 200
    else:
        assert resp.status_code == 201, f"audit create failed {resp.text}"
        audit_id = resp.json()["id"]
        import asyncio
        for _ in range(20):
            s = await client.get(f"/api/audits/{audit_id}/status")
            if s.json()["status"] in ("COMPLETED", "PARTIAL", "FAILED"):
                break
            await asyncio.sleep(1)
        for lang in ["en", "fr", "ar"]:
            r = await client.get(f"/api/audits/{audit_id}/report?lang={lang}")
            assert r.status_code == 200, f"report lang={lang} failed {r.status_code} {r.text[:500]}"
            assert r.headers.get("content-type") == "application/pdf"
            assert len(r.content) > 1000


@pytest.mark.asyncio
async def test_report_route_exists_no_500_for_target_id(client: AsyncClient):
    """Verify the specific production audit ID does not cause 500 (if it exists, it should be 200 or 401/404, never 500)."""
    # This is the ID mentioned in the bug report
    # We test that the endpoint itself exists (route table) and that a missing audit returns 404, not 500
    # For an anonymous request, it will be 401 or 404, but never 500
    for lang in ["en", "fr", "ar"]:
        r = await client.get(f"/api/audits/{TARGET_AUDIT_ID}/report?lang={lang}")
        # Should be 401 (not authenticated) or 404 (not found) or 200 (if anonymous and exists), but never 500
        assert r.status_code != 500, f"report for target ID lang={lang} returned 500: {r.text[:500]}"
        assert r.status_code in (200, 401, 404, 409), f"unexpected status {r.status_code} for {lang}: {r.text[:500]}"

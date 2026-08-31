"""Minimal route existence test - verifies FastAPI route table without DB.

This test ensures production 404s for /api/auth/register etc. do not recur.
It does not create a user and works even if DATABASE_URL is unavailable.
"""
from app.main import app


def test_required_routes_exist():
    openapi = app.openapi()
    paths = openapi.get("paths", {})

    required = {
        "/api/health": ["get"],
        "/api/auth/register": ["post"],
        "/api/auth/login": ["post"],
        "/api/reviews": ["get"],
        "/api/reviews/stats": ["get"],
    }
    for path, methods in required.items():
        assert path in paths, f"Missing route {path} in OpenAPI. Have: {sorted(paths.keys())}"
        actual = [m.lower() for m in paths[path].keys()]
        for m in methods:
            assert m.lower() in actual, f"{path} missing method {m}, has {actual}"


def test_no_duplicate_api_prefix():
    openapi = app.openapi()
    paths = openapi.get("paths", {})
    for p in paths:
        assert "/api/api" not in p, f"Duplicate prefix {p}"
        # Ensure no trailing slash duplication issues
        assert p == p.rstrip("/") or p in ["/", "/api/health/ready"], f"Unexpected trailing slash {p}"


import pytest
import uuid


@pytest.mark.asyncio
async def test_key_endpoints_never_404(client):
    """Verify that all key endpoints exist and return non-404 responses."""
    # 1. GET /api/health
    r_health = await client.get("/api/health")
    assert r_health.status_code != 404
    assert r_health.status_code == 200

    # 2. POST /api/auth/register
    unique_email = f"api-test-{uuid.uuid4().hex[:8]}@example.com"
    r_reg = await client.post(
        "/api/auth/register",
        json={
            "name": "API Test User",
            "email": unique_email,
            "password": "TestPassword123!",
            "company_name": "Test Co",
            "preferred_language": "en",
        },
    )
    assert r_reg.status_code != 404
    assert r_reg.status_code == 201

    # 3. POST /api/auth/login
    r_login = await client.post(
        "/api/auth/login",
        json={
            "email": unique_email,
            "password": "TestPassword123!",
        },
    )
    assert r_login.status_code != 404
    assert r_login.status_code == 200
    token = r_login.json().get("access_token")
    assert token is not None

    # 4. GET /api/reviews?limit=6&offset=0
    r_reviews = await client.get("/api/reviews?limit=6&offset=0")
    assert r_reviews.status_code != 404
    assert r_reviews.status_code == 200

    # 5. GET /api/reviews/stats
    r_stats = await client.get("/api/reviews/stats")
    assert r_stats.status_code != 404
    assert r_stats.status_code == 200


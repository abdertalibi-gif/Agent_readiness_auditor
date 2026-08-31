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

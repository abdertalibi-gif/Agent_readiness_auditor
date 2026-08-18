"""Customer review integration tests.

Covers the full lifecycle: creation rules (auth, ownership, audit completion,
one-per-audit), comment sanitization/limits, public exposure (approved only),
stats accuracy, own-review management (read/update/delete), cross-user
protection, and admin moderation (list/filter/approve/hide/delete) with the
audit trail.
"""

import asyncio
import uuid

import httpx
import pytest
from sqlalchemy import select

from app.config import settings
from app.models import Audit, Review, User, Website

settings.smtp_host = ""

PASSWORD = "StrongPass-123"


def _email(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}@example.com"


async def _register(client: httpx.AsyncClient, email: str) -> dict:
    reg = await client.post(
        "/api/auth/register",
        json={"name": "Review User", "email": email, "password": PASSWORD, "company_name": "Acme Inc."},
    )
    assert reg.status_code == 201, reg.text
    return reg.json()


async def _login(client: httpx.AsyncClient, email: str) -> dict[str, str]:
    login = await client.post("/api/auth/login", json={"email": email, "password": PASSWORD})
    assert login.status_code == 200, login.text
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


async def _user_id(client: httpx.AsyncClient, headers: dict[str, str]) -> str:
    me = await client.get("/api/auth/me", headers=headers)
    assert me.status_code == 200, me.text
    return me.json()["id"]


async def _run_audit(client: httpx.AsyncClient, headers: dict[str, str], base_url: str) -> dict:
    resp = await client.post("/api/audits", json={"url": base_url}, headers=headers)
    assert resp.status_code == 201, resp.text
    audit_id = resp.json()["id"]
    for _ in range(300):
        status_resp = await client.get(f"/api/audits/{audit_id}/status", headers=headers)
        status = status_resp.json()
        if status["status"] in ("COMPLETED", "PARTIAL", "FAILED", "CANCELLED"):
            return status
        await asyncio.sleep(0.05)
    raise TimeoutError("audit did not complete in time")


@pytest.fixture()
async def admin_headers(client, db_session_factory) -> dict[str, str]:
    email = _email("superadmin-review")
    user = await _register(client, email)
    async with db_session_factory() as session:
        u = await session.get(User, user["id"])
        assert u is not None
        u.role = "SUPER_ADMIN"
        await session.commit()
    return await _login(client, email)


@pytest.fixture()
async def completed_audit_id(client, user_headers, mock_site) -> str:
    status = await _run_audit(client, user_headers, mock_site)
    assert status["status"] in ("COMPLETED", "PARTIAL"), status
    return status["id"]


# ---------- Creation rules ----------

async def test_review_requires_auth(client, completed_audit_id) -> None:
    resp = await client.post(
        "/api/reviews", json={"audit_id": completed_audit_id, "rating": 5, "comment": "Great"}
    )
    assert resp.status_code in (401, 403)


async def test_review_requires_owned_audit(client, user_headers, second_user_headers, completed_audit_id) -> None:
    resp = await client.post(
        "/api/reviews",
        json={"audit_id": completed_audit_id, "rating": 5},
        headers=second_user_headers,
    )
    assert resp.status_code == 403


async def test_review_unknown_audit(client, user_headers) -> None:
    resp = await client.post(
        "/api/reviews", json={"audit_id": uuid.uuid4().hex, "rating": 5}, headers=user_headers
    )
    assert resp.status_code == 404


async def test_review_requires_completed_audit(client, user_headers, db_session_factory, mock_site) -> None:
    user_id = await _user_id(client, user_headers)
    async with db_session_factory() as session:
        website = Website(id=uuid.uuid4().hex, owner_id=user_id, domain="queued.example", base_url=mock_site)
        session.add(website)
        await session.flush()
        audit = Audit(
            id=uuid.uuid4().hex,
            website_id=website.id,
            user_id=user_id,
            target_url=mock_site,
            status="QUEUED",
        )
        session.add(audit)
        await session.commit()
        audit_id = audit.id
    resp = await client.post(
        "/api/reviews", json={"audit_id": audit_id, "rating": 5}, headers=user_headers
    )
    assert resp.status_code == 400, resp.text


async def test_create_review_success(client, user_headers, completed_audit_id) -> None:
    resp = await client.post(
        "/api/reviews",
        json={"audit_id": completed_audit_id, "rating": 5, "comment": "Excellent report!"},
        headers=user_headers,
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["rating"] == 5
    assert body["comment"] == "Excellent report!"
    assert body["status"] == "PENDING"
    assert body["audit_id"] == completed_audit_id
    assert body["audit_url"] is not None


async def test_duplicate_review_rejected(client, user_headers, completed_audit_id) -> None:
    first = await client.post(
        "/api/reviews", json={"audit_id": completed_audit_id, "rating": 4}, headers=user_headers
    )
    assert first.status_code == 201
    second = await client.post(
        "/api/reviews", json={"audit_id": completed_audit_id, "rating": 2}, headers=user_headers
    )
    assert second.status_code == 409


async def test_rating_bounds_enforced(client, user_headers, completed_audit_id) -> None:
    for bad in (0, 6):
        resp = await client.post(
            "/api/reviews", json={"audit_id": completed_audit_id, "rating": bad}, headers=user_headers
        )
        assert resp.status_code == 422


async def test_comment_sanitized(client, user_headers, completed_audit_id) -> None:
    resp = await client.post(
        "/api/reviews",
        json={
            "audit_id": completed_audit_id,
            "rating": 5,
            "comment": "<script>alert(1)</script>Great product <b>bold</b> <a href=\"javascript:x\">x</a>",
        },
        headers=user_headers,
    )
    assert resp.status_code == 201, resp.text
    comment = resp.json()["comment"]
    assert "<" not in comment and ">" not in comment
    assert "Great product" in comment


async def test_comment_length_capped(client, user_headers, completed_audit_id) -> None:
    too_long = await client.post(
        "/api/reviews",
        json={"audit_id": completed_audit_id, "rating": 3, "comment": "a" * 2000},
        headers=user_headers,
    )
    assert too_long.status_code == 422

    exact = await client.post(
        "/api/reviews",
        json={"audit_id": completed_audit_id, "rating": 3, "comment": "a" * 1000},
        headers=user_headers,
    )
    assert exact.status_code == 201, exact.text
    assert len(exact.json()["comment"]) == 1000


async def test_comment_optional(client, user_headers, completed_audit_id) -> None:
    resp = await client.post(
        "/api/reviews", json={"audit_id": completed_audit_id, "rating": 4}, headers=user_headers
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["comment"] is None


# ---------- Public exposure (approved only) ----------

async def test_public_list_hides_pending(client, user_headers, admin_headers, completed_audit_id) -> None:
    await client.post(
        "/api/reviews", json={"audit_id": completed_audit_id, "rating": 5, "comment": "Pending one"},
        headers=user_headers,
    )
    before = await client.get("/api/reviews")
    assert before.status_code == 200
    assert all(item["comment"] != "Pending one" for item in before.json()["items"])

    review_id = (await client.get("/api/reviews/my", headers=user_headers)).json()["items"][0]["id"]
    approve = await client.patch(f"/api/admin/reviews/{review_id}/approve", headers=admin_headers)
    assert approve.status_code == 200, approve.text

    after = await client.get("/api/reviews")
    assert any(item["comment"] == "Pending one" for item in after.json()["items"])


async def test_stats_only_approved(
    client, user_headers, second_user_headers, mock_site, admin_headers
) -> None:
    before = (await client.get("/api/reviews/stats")).json()

    audit1 = (await _run_audit(client, user_headers, mock_site))["id"]
    audit2 = (await _run_audit(client, second_user_headers, mock_site))["id"]
    r1 = await client.post("/api/reviews", json={"audit_id": audit1, "rating": 1}, headers=user_headers)
    r2 = await client.post("/api/reviews", json={"audit_id": audit2, "rating": 5}, headers=second_user_headers)
    assert r1.status_code == 201 and r2.status_code == 201

    after_creation = (await client.get("/api/reviews/stats")).json()
    assert after_creation["total_reviews"] == before["total_reviews"]  # pending excluded

    r2_id = r2.json()["id"]
    await client.patch(f"/api/admin/reviews/{r2_id}/approve", headers=admin_headers)

    stats = (await client.get("/api/reviews/stats")).json()
    assert stats["total_reviews"] == before["total_reviews"] + 1
    assert stats["rating_counts"]["5"] == before["rating_counts"]["5"] + 1
    assert stats["average_rating"] is not None


async def test_stats_average_and_distribution(client, user_headers, second_user_headers, mock_site, admin_headers) -> None:
    before = (await client.get("/api/reviews/stats")).json()

    audits = []
    for headers in (user_headers, second_user_headers):
        audits.append((await _run_audit(client, headers, mock_site))["id"])
    ratings = [3, 5]
    for aid, rating, headers in zip(audits, ratings, (user_headers, second_user_headers)):
        resp = await client.post("/api/reviews", json={"audit_id": aid, "rating": rating}, headers=headers)
        assert resp.status_code == 201
        await client.patch(f"/api/admin/reviews/{resp.json()['id']}/approve", headers=admin_headers)

    stats = (await client.get("/api/reviews/stats")).json()
    assert stats["total_reviews"] == before["total_reviews"] + 2
    assert stats["rating_counts"]["3"] == before["rating_counts"]["3"] + 1
    assert stats["rating_counts"]["5"] == before["rating_counts"]["5"] + 1

    expected_total = before["total_reviews"] + 2
    expected_sum = (
        sum(int(k) * v for k, v in before["rating_counts"].items()) + sum(ratings)
    )
    assert abs(stats["average_rating"] - round(expected_sum / expected_total, 2)) < 0.001


async def test_public_list_paginated(client, user_headers, second_user_headers, mock_site, admin_headers) -> None:
    before = (await client.get("/api/reviews")).json()["total"]
    ids = []
    for headers in (user_headers, second_user_headers):
        for _ in range(3):
            aid = (await _run_audit(client, headers, mock_site))["id"]
            resp = await client.post("/api/reviews", json={"audit_id": aid, "rating": 5}, headers=headers)
            ids.append(resp.json()["id"])
    for rid in ids:
        await client.patch(f"/api/admin/reviews/{rid}/approve", headers=admin_headers)

    page = (await client.get("/api/reviews", params={"limit": 2, "offset": 0})).json()
    assert page["total"] == before + 6
    assert len(page["items"]) == 2


# ---------- Own reviews ----------

async def test_my_reviews(client, user_headers, completed_audit_id) -> None:
    await client.post(
        "/api/reviews", json={"audit_id": completed_audit_id, "rating": 5, "comment": "Nice"},
        headers=user_headers,
    )
    resp = await client.get("/api/reviews/my", headers=user_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 1
    assert body["items"][0]["audit_id"] == completed_audit_id
    assert body["items"][0]["status"] == "PENDING"


async def test_get_own_review(client, user_headers, completed_audit_id) -> None:
    created = await client.post(
        "/api/reviews", json={"audit_id": completed_audit_id, "rating": 5}, headers=user_headers
    )
    review_id = created.json()["id"]
    resp = await client.get(f"/api/reviews/{review_id}", headers=user_headers)
    assert resp.status_code == 200
    assert resp.json()["id"] == review_id


async def test_cannot_read_other_users_review(client, user_headers, second_user_headers, completed_audit_id) -> None:
    created = await client.post(
        "/api/reviews", json={"audit_id": completed_audit_id, "rating": 5}, headers=user_headers
    )
    review_id = created.json()["id"]
    resp = await client.get(f"/api/reviews/{review_id}", headers=second_user_headers)
    assert resp.status_code == 404


async def test_update_own_review(client, user_headers, completed_audit_id) -> None:
    created = await client.post(
        "/api/reviews", json={"audit_id": completed_audit_id, "rating": 2, "comment": "Old"},
        headers=user_headers,
    )
    review_id = created.json()["id"]
    resp = await client.patch(
        f"/api/reviews/{review_id}",
        json={"rating": 5, "comment": "Updated"},
        headers=user_headers,
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["rating"] == 5
    assert resp.json()["comment"] == "Updated"


async def test_cannot_update_other_users_review(client, user_headers, second_user_headers, completed_audit_id) -> None:
    created = await client.post(
        "/api/reviews", json={"audit_id": completed_audit_id, "rating": 4}, headers=user_headers
    )
    review_id = created.json()["id"]
    resp = await client.patch(
        f"/api/reviews/{review_id}", json={"rating": 1}, headers=second_user_headers
    )
    assert resp.status_code == 404


async def test_delete_own_review(client, user_headers, completed_audit_id) -> None:
    created = await client.post(
        "/api/reviews", json={"audit_id": completed_audit_id, "rating": 5}, headers=user_headers
    )
    review_id = created.json()["id"]
    resp = await client.delete(f"/api/reviews/{review_id}", headers=user_headers)
    assert resp.status_code == 204
    mine = (await client.get("/api/reviews/my", headers=user_headers)).json()
    assert mine["total"] == 0


async def test_cannot_delete_other_users_review(client, user_headers, second_user_headers, completed_audit_id) -> None:
    created = await client.post(
        "/api/reviews", json={"audit_id": completed_audit_id, "rating": 5}, headers=user_headers
    )
    review_id = created.json()["id"]
    resp = await client.delete(f"/api/reviews/{review_id}", headers=second_user_headers)
    assert resp.status_code == 404


# ---------- Admin moderation ----------

async def test_admin_normal_user_forbidden(client, user_headers) -> None:
    resp = await client.get("/api/admin/reviews", headers=user_headers)
    assert resp.status_code == 403


async def test_admin_anon_forbidden(client) -> None:
    resp = await client.get("/api/admin/reviews")
    assert resp.status_code in (401, 403)


async def test_admin_list_filter_status(client, user_headers, second_user_headers, admin_headers, mock_site) -> None:
    audit1 = (await _run_audit(client, user_headers, mock_site))["id"]
    audit2 = (await _run_audit(client, second_user_headers, mock_site))["id"]
    before_all = (await client.get("/api/admin/reviews", headers=admin_headers)).json()["total"]
    before_pending = (await client.get("/api/admin/reviews", params={"status": "PENDING"}, headers=admin_headers)).json()["total"]

    await client.post("/api/reviews", json={"audit_id": audit1, "rating": 5, "comment": "One"}, headers=user_headers)
    r2 = await client.post("/api/reviews", json={"audit_id": audit2, "rating": 4, "comment": "Two"}, headers=second_user_headers)
    await client.patch(f"/api/admin/reviews/{r2.json()['id']}/approve", headers=admin_headers)

    all_reviews = (await client.get("/api/admin/reviews", headers=admin_headers)).json()
    assert all_reviews["total"] == before_all + 2

    pending = (await client.get("/api/admin/reviews", params={"status": "PENDING"}, headers=admin_headers)).json()
    assert pending["total"] == before_pending + 1
    assert any(item["comment"] == "One" for item in pending["items"])
    assert all(item["user_email"] is not None for item in pending["items"])

    approved = (await client.get("/api/admin/reviews", params={"status": "APPROVED"}, headers=admin_headers)).json()
    assert any(item["comment"] == "Two" for item in approved["items"])


async def test_admin_get_review(client, user_headers, admin_headers, completed_audit_id) -> None:
    created = await client.post(
        "/api/reviews", json={"audit_id": completed_audit_id, "rating": 5, "comment": "Detail"},
        headers=user_headers,
    )
    review_id = created.json()["id"]
    resp = await client.get(f"/api/admin/reviews/{review_id}", headers=admin_headers)
    assert resp.status_code == 200, resp.text
    assert resp.json()["comment"] == "Detail"
    assert resp.json()["user_name"] is not None


async def test_admin_approve_publishes_review(client, user_headers, admin_headers, completed_audit_id) -> None:
    created = await client.post(
        "/api/reviews", json={"audit_id": completed_audit_id, "rating": 5, "comment": "Approved one"},
        headers=user_headers,
    )
    review_id = created.json()["id"]
    resp = await client.patch(f"/api/admin/reviews/{review_id}/approve", headers=admin_headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "APPROVED"
    public = (await client.get("/api/reviews")).json()
    assert any(item["comment"] == "Approved one" for item in public["items"])


async def test_admin_hide_removes_public_review(client, user_headers, admin_headers, completed_audit_id) -> None:
    created = await client.post(
        "/api/reviews", json={"audit_id": completed_audit_id, "rating": 5, "comment": "To hide"},
        headers=user_headers,
    )
    review_id = created.json()["id"]
    await client.patch(f"/api/admin/reviews/{review_id}/approve", headers=admin_headers)
    assert any(
        item["comment"] == "To hide" for item in (await client.get("/api/reviews")).json()["items"]
    )
    resp = await client.patch(f"/api/admin/reviews/{review_id}/hide", headers=admin_headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "HIDDEN"
    assert not any(
        item["comment"] == "To hide" for item in (await client.get("/api/reviews")).json()["items"]
    )


async def test_admin_delete_review(client, user_headers, admin_headers, completed_audit_id) -> None:
    created = await client.post(
        "/api/reviews", json={"audit_id": completed_audit_id, "rating": 5}, headers=user_headers
    )
    review_id = created.json()["id"]
    resp = await client.delete(f"/api/admin/reviews/{review_id}", headers=admin_headers)
    assert resp.status_code == 204
    mine = (await client.get("/api/reviews/my", headers=user_headers)).json()
    assert mine["total"] == 0


async def test_admin_actions_recorded_in_audit_log(client, user_headers, admin_headers, completed_audit_id) -> None:
    created = await client.post(
        "/api/reviews", json={"audit_id": completed_audit_id, "rating": 5}, headers=user_headers
    )
    review_id = created.json()["id"]
    await client.patch(f"/api/admin/reviews/{review_id}/approve", headers=admin_headers)
    logs = (await client.get("/api/admin/audit-logs", headers=admin_headers)).json()["items"]
    assert any(entry["action"] == "review.approve" for entry in logs)

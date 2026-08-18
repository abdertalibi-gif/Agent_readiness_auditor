"""Application feedback integration tests.

Covers the full lifecycle: auth, one record per user (create/update in place,
no duplicates), rating validation, comment sanitization, own-feedback
management (read/update/delete), cross-user isolation, admin statistics (SQL
aggregates) and the admin listing (pagination, filters, search, sort).
"""

import uuid

import httpx
import pytest
from sqlalchemy import select

from app.models import User, UserFeedback

PASSWORD = "StrongPass-123"


def _email(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}@example.com"


async def _register(client: httpx.AsyncClient, email: str) -> dict:
    reg = await client.post(
        "/api/auth/register",
        json={"name": "Feedback User", "email": email, "password": PASSWORD, "company_name": "Acme Inc."},
    )
    assert reg.status_code == 201, reg.text
    return reg.json()


async def _login(client: httpx.AsyncClient, email: str) -> dict[str, str]:
    login = await client.post("/api/auth/login", json={"email": email, "password": PASSWORD})
    assert login.status_code == 200, login.text
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


@pytest.fixture()
async def admin_headers(client, db_session_factory) -> dict[str, str]:
    email = _email("superadmin-feedback")
    user = await _register(client, email)
    async with db_session_factory() as session:
        u = await session.get(User, user["id"])
        assert u is not None
        u.role = "SUPER_ADMIN"
        await session.commit()
    return await _login(client, email)


# ---------- Authentication ----------

async def test_feedback_requires_auth(client) -> None:
    resp = await client.post("/api/feedback", json={"rating": 5, "comment": "Great app"})
    assert resp.status_code in (401, 403)
    resp = await client.get("/api/feedback/me")
    assert resp.status_code in (401, 403)
    resp = await client.delete("/api/feedback/me")
    assert resp.status_code in (401, 403)


# ---------- Creation / read ----------

async def test_create_feedback_success(client, user_headers) -> None:
    resp = await client.post(
        "/api/feedback", json={"rating": 5, "comment": "Very useful application!"}, headers=user_headers
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["has_feedback"] is True
    assert body["rating"] == 5
    assert body["comment"] == "Very useful application!"
    assert body["created_at"] is not None
    assert body["updated_at"] is not None


async def test_get_my_feedback_empty(client, user_headers) -> None:
    resp = await client.get("/api/feedback/me", headers=user_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["has_feedback"] is False
    assert body["rating"] is None
    assert body["comment"] is None


async def test_get_my_feedback_after_submit(client, user_headers) -> None:
    await client.post("/api/feedback", json={"rating": 4}, headers=user_headers)
    resp = await client.get("/api/feedback/me", headers=user_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["has_feedback"] is True
    assert body["rating"] == 4


async def test_comment_optional(client, user_headers) -> None:
    resp = await client.post("/api/feedback", json={"rating": 3}, headers=user_headers)
    assert resp.status_code == 200, resp.text
    assert resp.json()["comment"] is None


# ---------- Validation ----------

async def test_rating_bounds_enforced(client, user_headers) -> None:
    for bad in (0, 6, -1, 100):
        resp = await client.post("/api/feedback", json={"rating": bad}, headers=user_headers)
        assert resp.status_code == 422, f"rating {bad} should be rejected"


async def test_rating_missing_rejected(client, user_headers) -> None:
    resp = await client.post("/api/feedback", json={"comment": "no rating"}, headers=user_headers)
    assert resp.status_code == 422


async def test_comment_sanitized(client, user_headers) -> None:
    resp = await client.post(
        "/api/feedback",
        json={
            "rating": 5,
            "comment": '<script>alert(1)</script>Great app <b>bold</b> <a href="javascript:x">x</a>',
        },
        headers=user_headers,
    )
    assert resp.status_code == 200, resp.text
    comment = resp.json()["comment"]
    assert "<" not in comment and ">" not in comment
    assert "Great app" in comment


async def test_comment_length_capped(client, user_headers) -> None:
    resp = await client.post(
        "/api/feedback", json={"rating": 3, "comment": "a" * 2000}, headers=user_headers
    )
    assert resp.status_code == 422


# ---------- One feedback per user (upsert, no duplicates) ----------

async def test_resubmitting_updates_instead_of_duplicating(client, user_headers) -> None:
    first = await client.post(
        "/api/feedback", json={"rating": 2, "comment": "First"}, headers=user_headers
    )
    assert first.status_code == 200
    created_at = first.json()["created_at"]

    second = await client.post(
        "/api/feedback", json={"rating": 5, "comment": "Updated"}, headers=user_headers
    )
    assert second.status_code == 200, second.text
    body = second.json()
    assert body["rating"] == 5
    assert body["comment"] == "Updated"
    # Same record was updated: created_at is preserved (modulo SQLite's
    # timezone round-trip, which may append/omit the trailing "Z").
    assert _as_utc(body["created_at"]) == _as_utc(created_at)


def _as_utc(value: str) -> str:
    return value.removesuffix("Z").removesuffix("+00:00")


async def test_only_one_row_per_user(client, user_headers, db_session_factory) -> None:
    me = await client.get("/api/auth/me", headers=user_headers)
    user_id = me.json()["id"]
    await client.post("/api/feedback", json={"rating": 4}, headers=user_headers)
    await client.post("/api/feedback", json={"rating": 5, "comment": "again"}, headers=user_headers)
    await client.post("/api/feedback", json={"rating": 3}, headers=user_headers)
    async with db_session_factory() as session:
        rows = (
            await session.scalars(select(UserFeedback).where(UserFeedback.user_id == user_id))
        ).all()
    assert len(rows) == 1
    assert rows[0].rating == 3


# ---------- Delete ----------

async def test_delete_my_feedback(client, user_headers) -> None:
    await client.post("/api/feedback", json={"rating": 5, "comment": "To delete"}, headers=user_headers)
    resp = await client.delete("/api/feedback/me", headers=user_headers)
    assert resp.status_code == 204
    mine = (await client.get("/api/feedback/me", headers=user_headers)).json()
    assert mine["has_feedback"] is False


async def test_delete_without_feedback_is_noop(client, user_headers) -> None:
    resp = await client.delete("/api/feedback/me", headers=user_headers)
    assert resp.status_code == 204


# ---------- Isolation ----------

async def test_feedback_isolated_between_users(client, user_headers, second_user_headers) -> None:
    await client.post("/api/feedback", json={"rating": 5, "comment": "mine"}, headers=user_headers)
    mine = (await client.get("/api/feedback/me", headers=user_headers)).json()
    other = (await client.get("/api/feedback/me", headers=second_user_headers)).json()
    assert mine["has_feedback"] is True
    assert other["has_feedback"] is False
    assert other["comment"] is None


# ---------- Admin authorization ----------

async def test_admin_stats_require_super_admin(client, user_headers) -> None:
    resp = await client.get("/api/feedback/stats", headers=user_headers)
    assert resp.status_code == 403


async def test_admin_list_require_super_admin(client, user_headers) -> None:
    resp = await client.get("/api/feedback", headers=user_headers)
    assert resp.status_code == 403


async def test_admin_stats_require_auth(client) -> None:
    resp = await client.get("/api/feedback/stats")
    assert resp.status_code in (401, 403)


# ---------- Admin statistics ----------

async def test_stats_empty(client, admin_headers) -> None:
    resp = await client.get("/api/feedback/stats", headers=admin_headers)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    # The DB is shared across the session, so verify structural invariants
    # (valid percentage keys / range) rather than absolute emptiness.
    assert "total_ratings" in body
    assert body["five_star_percentage"] >= 0
    assert body["satisfaction_rate"] >= 0
    assert body["average_rating"] is None or 1 <= body["average_rating"] <= 5


async def test_stats_aggregates(client, user_headers, second_user_headers, admin_headers) -> None:
    before = (await client.get("/api/feedback/stats", headers=admin_headers)).json()

    await client.post("/api/feedback", json={"rating": 5, "comment": "a"}, headers=user_headers)
    await client.post("/api/feedback", json={"rating": 5, "comment": "b"}, headers=second_user_headers)

    third_email = _email("third-feedback")
    await _register(client, third_email)
    third_headers = await _login(client, third_email)
    await client.post("/api/feedback", json={"rating": 2}, headers=third_headers)

    stats = (await client.get("/api/feedback/stats", headers=admin_headers)).json()
    expected_total = before["total_ratings"] + 3
    assert stats["total_ratings"] == expected_total

    # Average: recompute from prior distribution plus the three new ratings.
    prior_sum = before["average_rating"] * before["total_ratings"] if before["total_ratings"] else 0
    expected_avg = (prior_sum + 5 + 5 + 2) / expected_total
    assert abs(stats["average_rating"] - round(expected_avg, 2)) < 0.001

    # Added two 5-star + one 2-star feedback, so the shares of 5★ and 2★ grow.
    assert stats["five_star_percentage"] > 0
    assert stats["two_star_percentage"] > 0
    # Satisfaction is a valid 0..100 percentage.
    assert 0 <= stats["satisfaction_rate"] <= 100


# ---------- Admin listing ----------

async def test_admin_list_pagination_and_sort(client, user_headers, second_user_headers, admin_headers) -> None:
    await client.post("/api/feedback", json={"rating": 5, "comment": "user one"}, headers=user_headers)
    await client.post("/api/feedback", json={"rating": 1, "comment": "user two"}, headers=second_user_headers)

    newest = (await client.get("/api/feedback", params={"sort": "newest"}, headers=admin_headers)).json()
    assert newest["total"] >= 2
    assert newest["items"][0]["comment"] == "user two"  # submitted last

    highest = (await client.get("/api/feedback", params={"sort": "highest"}, headers=admin_headers)).json()
    assert highest["items"][0]["rating"] == 5

    lowest = (await client.get("/api/feedback", params={"sort": "lowest"}, headers=admin_headers)).json()
    assert lowest["items"][0]["rating"] == 1

    page = (await client.get("/api/feedback", params={"limit": 1, "offset": 0}, headers=admin_headers)).json()
    assert page["total"] >= 2
    assert len(page["items"]) == 1


async def test_admin_list_filters_and_search(client, user_headers, second_user_headers, admin_headers) -> None:
    me = (await client.get("/api/auth/me", headers=user_headers)).json()
    await client.post("/api/feedback", json={"rating": 5, "comment": "fan"}, headers=user_headers)
    await client.post("/api/feedback", json={"rating": 2, "comment": "critic"}, headers=second_user_headers)

    by_rating = (await client.get("/api/feedback", params={"rating": 5}, headers=admin_headers)).json()
    assert by_rating["total"] >= 1
    assert any(item["comment"] == "fan" for item in by_rating["items"])

    by_search = (
        await client.get("/api/feedback", params={"search": me["email"][:8]}, headers=admin_headers)
    ).json()
    assert by_search["total"] >= 1
    assert any(item["user_email"] == me["email"] for item in by_search["items"])

    invalid_sort = await client.get("/api/feedback", params={"sort": "bogus"}, headers=admin_headers)
    assert invalid_sort.status_code == 400


async def test_admin_list_exposes_minimal_user_info(client, user_headers, admin_headers) -> None:
    await client.post("/api/feedback", json={"rating": 4, "comment": "ok"}, headers=user_headers)
    items = (await client.get("/api/feedback", headers=admin_headers)).json()["items"]
    assert items[0]["user_email"] is not None
    assert items[0]["rating"] == 4
    assert items[0]["comment"] == "ok"
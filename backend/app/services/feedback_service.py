"""Application feedback service.

Authenticated users may leave exactly one rating (1..5) of the
Agent-Readiness Auditor application itself, plus an optional comment. Submitting
again updates the existing record (never a duplicate). Comments are sanitized on
write so stored text is safe to render as plain text anywhere.

Admin statistics are computed entirely in SQL (grouped aggregates / CASE sums)
so they never load every feedback row into Python.
"""

import logging
import re
from datetime import UTC, datetime

from sqlalchemy import case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User, UserFeedback

logger = logging.getLogger("auditor.feedback")

COMMENT_MAX_LENGTH = 1000

_TAG_RE = re.compile(r"<[^>]*>")
_UNSAFE_RE = re.compile(r"(javascript:|vbscript:|on[a-z]+\s*=)", re.IGNORECASE)
_CONTROL_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")

VALID_SORTS = {"newest", "highest", "lowest"}


class FeedbackError(Exception):
    def __init__(self, detail: str, *, status_code: int = 400) -> None:
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code


class NotFoundError(FeedbackError):
    def __init__(self, detail: str = "Feedback not found.") -> None:
        super().__init__(detail, status_code=404)


def sanitize_comment(value: str | None) -> str | None:
    """Strip markup/dangerous payloads and cap length; None stays None."""
    if value is None:
        return None
    text = value
    text = _CONTROL_RE.sub("", text)
    text = _TAG_RE.sub(" ", text)
    text = _UNSAFE_RE.sub("", text)
    # Drop any angle brackets left behind by malformed markup.
    text = text.replace("<", " ").replace(">", " ")
    text = " ".join(text.split()).strip()
    if not text:
        return None
    return text[:COMMENT_MAX_LENGTH]


def _now() -> datetime:
    return datetime.now(UTC)


# ---------- Own feedback ----------

async def get_for_user(session: AsyncSession, user_id: str) -> UserFeedback | None:
    return await session.scalar(
        select(UserFeedback).where(UserFeedback.user_id == user_id)
    )


async def create_or_update_feedback(
    session: AsyncSession, *, user_id: str, rating: int, comment: str | None
) -> UserFeedback:
    """Insert if the user has no feedback yet, otherwise update in place."""
    existing = await get_for_user(session, user_id)
    if existing is not None:
        existing.rating = rating
        existing.comment = sanitize_comment(comment)
        existing.updated_at = _now()
        await session.commit()
        await session.refresh(existing, ["user"])
        return existing
    feedback = UserFeedback(
        user_id=user_id,
        rating=rating,
        comment=sanitize_comment(comment),
        created_at=_now(),
        updated_at=_now(),
    )
    session.add(feedback)
    await session.commit()
    await session.refresh(feedback, ["user"])
    return feedback


async def delete_feedback(session: AsyncSession, feedback: UserFeedback) -> None:
    await session.delete(feedback)
    await session.commit()


# ---------- Admin listing ----------

async def list_all(
    session: AsyncSession,
    *,
    rating: int | None = None,
    search: str | None = None,
    sort: str = "newest",
    limit: int = 100,
    offset: int = 0,
) -> list[UserFeedback]:
    stmt = select(UserFeedback)
    if rating is not None and 1 <= rating <= 5:
        stmt = stmt.where(UserFeedback.rating == rating)
    if search:
        like = f"%{search.strip()}%"
        stmt = stmt.join(User, User.id == UserFeedback.user_id).where(
            or_(User.email.ilike(like), User.name.ilike(like))
        )
    if sort == "highest":
        stmt = stmt.order_by(UserFeedback.rating.desc(), UserFeedback.created_at.desc())
    elif sort == "lowest":
        stmt = stmt.order_by(UserFeedback.rating.asc(), UserFeedback.created_at.desc())
    else:
        stmt = stmt.order_by(UserFeedback.created_at.desc())
    stmt = stmt.limit(limit).offset(offset)
    return list((await session.scalars(stmt)).all())


async def count_all(
    session: AsyncSession,
    *,
    rating: int | None = None,
    search: str | None = None,
) -> int:
    stmt = select(func.count(UserFeedback.id))
    if rating is not None and 1 <= rating <= 5:
        stmt = stmt.where(UserFeedback.rating == rating)
    if search:
        like = f"%{search.strip()}%"
        stmt = stmt.join(User, User.id == UserFeedback.user_id).where(
            or_(User.email.ilike(like), User.name.ilike(like))
        )
    return (await session.scalar(stmt)) or 0


# ---------- Statistics (SQL aggregation) ----------

async def stats(session: AsyncSession) -> dict:
    """Aggregate rating statistics in one SQL query (no Python-side N+1)."""
    one_star = func.sum(case((UserFeedback.rating == 1, 1), else_=0))
    two_star = func.sum(case((UserFeedback.rating == 2, 1), else_=0))
    three_star = func.sum(case((UserFeedback.rating == 3, 1), else_=0))
    four_star = func.sum(case((UserFeedback.rating == 4, 1), else_=0))
    five_star = func.sum(case((UserFeedback.rating == 5, 1), else_=0))
    satisfied = func.sum(case((UserFeedback.rating >= 4, 1), else_=0))

    row = (
        await session.execute(
            select(
                func.count(UserFeedback.id),
                func.avg(UserFeedback.rating),
                satisfied,
                one_star,
                two_star,
                three_star,
                four_star,
                five_star,
            )
        )
    ).one()

    total, avg = row[0] or 0, row[1]
    # Column layout: 0 total, 1 avg, 2 satisfied, 3 one, 4 two, 5 three, 6 four, 7 five.
    counts = {
        "satisfied": row[2] or 0,
        "one": row[3] or 0,
        "two": row[4] or 0,
        "three": row[5] or 0,
        "four": row[6] or 0,
        "five": row[7] or 0,
    }
    if total == 0:
        return {
            "total_ratings": 0,
            "average_rating": None,
            "five_star_percentage": 0,
            "four_star_percentage": 0,
            "three_star_percentage": 0,
            "two_star_percentage": 0,
            "one_star_percentage": 0,
            "satisfaction_rate": 0,
        }

    def pct(count: int) -> int:
        return round(count / total * 100)

    return {
        "total_ratings": total,
        "average_rating": round(avg, 2) if avg is not None else None,
        "five_star_percentage": pct(counts["five"]),
        "four_star_percentage": pct(counts["four"]),
        "three_star_percentage": pct(counts["three"]),
        "two_star_percentage": pct(counts["two"]),
        "one_star_percentage": pct(counts["one"]),
        "satisfaction_rate": pct(counts["satisfied"]),
    }
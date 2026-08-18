"""Customer review service.

Authenticated users may leave exactly one review per completed audit, and may
update or delete their own review. New reviews start as PENDING and only become
public once a SUPER_ADMIN approves them; public listings and stats therefore
only ever surface APPROVED reviews.

Comments are sanitized on write (markup, script-ish payloads, control
characters and over-long text are stripped/truncated) so stored text is safe to
render as plain text anywhere.
"""

import logging
import re
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Audit, Review, User

logger = logging.getLogger("auditor.reviews")

COMMENT_MAX_LENGTH = 1000
STATUS_PENDING = "PENDING"
STATUS_APPROVED = "APPROVED"
STATUS_HIDDEN = "HIDDEN"
PUBLIC_STATUSES = {STATUS_APPROVED}
VALID_STATUSES = {STATUS_PENDING, STATUS_APPROVED, STATUS_HIDDEN}

# Reviews are only allowed once the audit has actually finished.
REVIEWABLE_AUDIT_STATUSES = {"COMPLETED", "PARTIAL"}

_TAG_RE = re.compile(r"<[^>]*>")
_UNSAFE_RE = re.compile(r"(javascript:|vbscript:|on[a-z]+\s*=)", re.IGNORECASE)
_CONTROL_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


class ReviewError(Exception):
    def __init__(self, detail: str, *, status_code: int = 400) -> None:
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code


class NotFoundError(ReviewError):
    def __init__(self, detail: str = "Review not found.") -> None:
        super().__init__(detail, status_code=404)


class DuplicateReviewError(ReviewError):
    def __init__(self, detail: str = "You have already reviewed this audit.") -> None:
        super().__init__(detail, status_code=409)


class ForbiddenError(ReviewError):
    def __init__(self, detail: str = "You do not have access to this review.") -> None:
        super().__init__(detail, status_code=403)


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


# ---------- Creation / ownership ----------

async def get_existing(session: AsyncSession, user_id: str, audit_id: str) -> Review | None:
    return await session.scalar(
        select(Review).where(Review.user_id == user_id, Review.audit_id == audit_id)
    )


async def get_owned_review(session: AsyncSession, review_id: str, user_id: str) -> Review:
    review = await session.scalar(
        select(Review).where(Review.id == review_id, Review.user_id == user_id)
    )
    if review is None:
        raise NotFoundError()
    return review


async def create_review(
    session: AsyncSession, *, user: User, audit: Audit, rating: int, comment: str | None
) -> Review:
    if audit.status not in REVIEWABLE_AUDIT_STATUSES:
        raise ReviewError("You can only review an audit after it has completed.")
    existing = await get_existing(session, user.id, audit.id)
    if existing is not None:
        raise DuplicateReviewError()
    review = Review(
        user_id=user.id,
        audit_id=audit.id,
        rating=rating,
        comment=sanitize_comment(comment),
        status=STATUS_PENDING,
        created_at=_now(),
        updated_at=_now(),
    )
    session.add(review)
    await session.commit()
    await session.refresh(review, ["user", "audit"])
    return review


async def update_review(
    session: AsyncSession,
    review: Review,
    *,
    rating: int | None = None,
    comment: str | None = None,
) -> Review:
    if rating is not None:
        review.rating = rating
    if comment is not None:
        review.comment = sanitize_comment(comment)
    review.updated_at = _now()
    await session.commit()
    await session.refresh(review, ["user", "audit"])
    return review


async def delete_review(session: AsyncSession, review: Review) -> None:
    await session.delete(review)
    await session.commit()


# ---------- Public (approved only) ----------

async def list_public(
    session: AsyncSession, *, limit: int = 20, offset: int = 0
) -> list[Review]:
    stmt = (
        select(Review)
        .where(Review.status == STATUS_APPROVED)
        .order_by(Review.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return list((await session.scalars(stmt)).all())


async def count_public(session: AsyncSession) -> int:
    return (
        await session.scalar(
            select(func.count(Review.id)).where(Review.status == STATUS_APPROVED)
        )
    ) or 0


async def review_stats(session: AsyncSession) -> dict:
    """Average + per-star counts computed in one grouped aggregate query."""
    rows = (
        await session.execute(
            select(Review.rating, func.count(Review.id))
            .where(Review.status == STATUS_APPROVED)
            .group_by(Review.rating)
        )
    ).all()
    counts = {rating: count for rating, count in rows}
    total = sum(counts.values())
    if total == 0:
        return {"average_rating": None, "total_reviews": 0, "rating_counts": {str(i): 0 for i in range(1, 6)}}
    weighted = sum(rating * count for rating, count in counts.items())
    return {
        "average_rating": round(weighted / total, 2),
        "total_reviews": total,
        "rating_counts": {str(i): counts.get(i, 0) for i in range(1, 6)},
    }


# ---------- Own reviews ----------

async def list_my(
    session: AsyncSession, *, user_id: str, limit: int = 20, offset: int = 0
) -> list[Review]:
    stmt = (
        select(Review)
        .where(Review.user_id == user_id)
        .order_by(Review.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return list((await session.scalars(stmt)).all())


async def count_my(session: AsyncSession, user_id: str) -> int:
    return (
        await session.scalar(select(func.count(Review.id)).where(Review.user_id == user_id))
    ) or 0


# ---------- Admin moderation ----------

async def list_all(
    session: AsyncSession,
    *,
    status: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[Review]:
    stmt = select(Review)
    if status and status.upper() in VALID_STATUSES:
        stmt = stmt.where(Review.status == status.upper())
    stmt = stmt.order_by(Review.created_at.desc()).limit(limit).offset(offset)
    return list((await session.scalars(stmt)).all())


async def count_all(session: AsyncSession, *, status: str | None = None) -> int:
    stmt = select(func.count(Review.id))
    if status and status.upper() in VALID_STATUSES:
        stmt = stmt.where(Review.status == status.upper())
    return (await session.scalar(stmt)) or 0


async def get_review(session: AsyncSession, review_id: str) -> Review:
    review = await session.scalar(select(Review).where(Review.id == review_id))
    if review is None:
        raise NotFoundError()
    return review


async def set_status(session: AsyncSession, review: Review, status: str) -> Review:
    if status not in VALID_STATUSES:
        raise ReviewError("Invalid review status.")
    review.status = status
    review.updated_at = _now()
    await session.commit()
    await session.refresh(review, ["user", "audit"])
    return review

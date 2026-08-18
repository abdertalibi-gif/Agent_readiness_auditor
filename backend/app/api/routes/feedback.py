"""Application feedback endpoints.

Authenticated users can submit exactly one rating (1..5) of the application
itself, view it, update it, or delete it. The current user is always derived
from the bearer token (never trusted from the request body).

The admin listing and statistics endpoints require the existing SUPER_ADMIN
role via ``require_super_admin``.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_super_admin
from app.database import get_db_session
from app.models import User, UserFeedback
from app.schemas.feedback import (
    AdminFeedbackListOut,
    AdminFeedbackOut,
    FeedbackCreate,
    FeedbackMeOut,
    FeedbackStatsOut,
)
from app.services import feedback_service

router = APIRouter(prefix="/feedback", tags=["feedback"])


def _me_out(feedback: UserFeedback | None) -> FeedbackMeOut:
    if feedback is None:
        return FeedbackMeOut(has_feedback=False, rating=None, comment=None)
    return FeedbackMeOut(
        has_feedback=True,
        rating=feedback.rating,
        comment=feedback.comment,
        created_at=feedback.created_at,
        updated_at=feedback.updated_at,
    )


def _admin_out(feedback: UserFeedback) -> AdminFeedbackOut:
    return AdminFeedbackOut(
        id=feedback.id,
        user_id=feedback.user_id,
        user_name=feedback.user.name if feedback.user else None,
        user_email=feedback.user.email if feedback.user else None,
        rating=feedback.rating,
        comment=feedback.comment,
        created_at=feedback.created_at,
        updated_at=feedback.updated_at,
    )


@router.get("/me", response_model=FeedbackMeOut)
async def get_my_feedback(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> FeedbackMeOut:
    feedback = await feedback_service.get_for_user(session, user.id)
    return _me_out(feedback)


@router.post("", response_model=FeedbackMeOut, status_code=200)
async def submit_feedback(
    payload: FeedbackCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> FeedbackMeOut:
    feedback = await feedback_service.create_or_update_feedback(
        session, user_id=user.id, rating=payload.rating, comment=payload.comment
    )
    return _me_out(feedback)


@router.delete("/me", status_code=204)
async def delete_my_feedback(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> None:
    feedback = await feedback_service.get_for_user(session, user.id)
    if feedback is not None:
        await feedback_service.delete_feedback(session, feedback)


# ---------- Admin ----------

@router.get("/stats", response_model=FeedbackStatsOut)
async def feedback_stats(
    _user: User = Depends(require_super_admin),
    session: AsyncSession = Depends(get_db_session),
) -> FeedbackStatsOut:
    return FeedbackStatsOut(**await feedback_service.stats(session))


@router.get("", response_model=AdminFeedbackListOut)
async def list_feedback(
    rating: int | None = Query(default=None, ge=1, le=5, description="Filter by star rating."),
    search: str | None = Query(default=None, max_length=120, description="Search by user email/name."),
    sort: str = Query(default="newest", description="newest | highest | lowest"),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    _user: User = Depends(require_super_admin),
    session: AsyncSession = Depends(get_db_session),
) -> AdminFeedbackListOut:
    if sort not in feedback_service.VALID_SORTS:
        raise HTTPException(status_code=400, detail="Invalid sort. Use newest | highest | lowest.")
    items = await feedback_service.list_all(
        session, rating=rating, search=search, sort=sort, limit=limit, offset=offset
    )
    total = await feedback_service.count_all(session, rating=rating, search=search)
    return AdminFeedbackListOut(total=total, items=[_admin_out(f) for f in items])
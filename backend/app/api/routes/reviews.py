"""Customer review endpoints.

Authenticated users can leave exactly one review per completed audit, update or
delete their own review, and view their own review history. The public listing
and stats endpoints only surface APPROVED reviews (no authentication needed).

Route ordering matters: ``/stats`` and ``/my`` are declared before ``/{id}``
so FastAPI matches the literal segments first.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.database import get_db_session
from app.models import Audit, Review, User
from app.schemas.review import (
    MyReviewListOut,
    MyReviewOut,
    PublicReviewListOut,
    PublicReviewOut,
    ReviewCreate,
    ReviewStatsOut,
    ReviewUpdate,
)
from app.services import review_service

router = APIRouter(prefix="/reviews", tags=["reviews"])


def _review_error(exc: review_service.ReviewError) -> HTTPException:
    return HTTPException(status_code=exc.status_code, detail=exc.detail)


def _my_out(review: Review) -> MyReviewOut:
    return MyReviewOut(
        id=review.id,
        audit_id=review.audit_id,
        audit_url=review.audit.target_url if review.audit else None,
        rating=review.rating,
        comment=review.comment,
        status=review.status,
        created_at=review.created_at,
        updated_at=review.updated_at,
    )


def _public_out(review: Review) -> PublicReviewOut:
    return PublicReviewOut(
        id=review.id,
        rating=review.rating,
        comment=review.comment,
        user_name=review.user.name if review.user else None,
        audit_url=review.audit.target_url if review.audit else None,
        created_at=review.created_at,
    )


@router.post("", response_model=MyReviewOut, status_code=201)
async def create_review(
    payload: ReviewCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> MyReviewOut:
    audit = await session.get(Audit, payload.audit_id)
    if audit is None:
        raise HTTPException(status_code=404, detail="Audit not found.")
    if audit.user_id != user.id:
        raise HTTPException(status_code=403, detail="You do not have access to this audit.")
    try:
        review = await review_service.create_review(
            session, user=user, audit=audit, rating=payload.rating, comment=payload.comment
        )
    except review_service.ReviewError as exc:
        raise _review_error(exc)
    return _my_out(review)


@router.get("", response_model=PublicReviewListOut)
async def list_public_reviews(
    limit: int = Query(default=20, ge=1, le=50),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(get_db_session),
) -> PublicReviewListOut:
    reviews = await review_service.list_public(session, limit=limit, offset=offset)
    total = await review_service.count_public(session)
    return PublicReviewListOut(total=total, items=[_public_out(r) for r in reviews])


@router.get("/stats", response_model=ReviewStatsOut)
async def review_stats(
    session: AsyncSession = Depends(get_db_session),
) -> ReviewStatsOut:
    return ReviewStatsOut(**await review_service.review_stats(session))


@router.get("/my", response_model=MyReviewListOut)
async def list_my_reviews(
    limit: int = Query(default=20, ge=1, le=50),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> MyReviewListOut:
    reviews = await review_service.list_my(session, user_id=user.id, limit=limit, offset=offset)
    total = await review_service.count_my(session, user_id=user.id)
    return MyReviewListOut(total=total, items=[_my_out(r) for r in reviews])


@router.get("/{review_id}", response_model=MyReviewOut)
async def get_my_review(
    review_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> MyReviewOut:
    try:
        review = await review_service.get_owned_review(session, review_id, user.id)
    except review_service.ReviewError as exc:
        raise _review_error(exc)
    return _my_out(review)


@router.patch("/{review_id}", response_model=MyReviewOut)
async def update_my_review(
    review_id: str,
    payload: ReviewUpdate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> MyReviewOut:
    if payload.rating is None and payload.comment is None:
        raise HTTPException(status_code=400, detail="Nothing to update.")
    try:
        review = await review_service.get_owned_review(session, review_id, user.id)
        review = await review_service.update_review(
            session, review, rating=payload.rating, comment=payload.comment
        )
    except review_service.ReviewError as exc:
        raise _review_error(exc)
    return _my_out(review)


@router.delete("/{review_id}", status_code=204)
async def delete_my_review(
    review_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> None:
    try:
        review = await review_service.get_owned_review(session, review_id, user.id)
        await review_service.delete_review(session, review)
    except review_service.ReviewError as exc:
        raise _review_error(exc)

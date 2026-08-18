"""Schemas for application feedback (rating of Agent-Readiness Auditor itself)."""

from datetime import datetime

from pydantic import BaseModel, Field


class FeedbackCreate(BaseModel):
    rating: int = Field(..., ge=1, le=5, description="Rating of the application from 1 to 5.")
    comment: str | None = Field(
        default=None, max_length=1000, description="Plain-text comment (sanitized on write)."
    )


class FeedbackMeOut(BaseModel):
    """Current user's feedback. ``has_feedback`` distinguishes "no record yet"
    (rating/comment None) from a real rating of 0 (impossible)."""

    has_feedback: bool
    rating: int | None = None
    comment: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class FeedbackStatsOut(BaseModel):
    """Aggregate statistics computed with SQL aggregation (single query)."""

    total_ratings: int = 0
    average_rating: float | None = None
    five_star_percentage: int = 0
    four_star_percentage: int = 0
    three_star_percentage: int = 0
    two_star_percentage: int = 0
    one_star_percentage: int = 0
    # Percentage of ratings >= 4 (used for the "satisfaction rate" widget).
    satisfaction_rate: int = 0


class AdminFeedbackOut(BaseModel):
    id: str
    user_id: str
    user_name: str | None = None
    user_email: str | None = None
    rating: int
    comment: str | None = None
    created_at: datetime
    updated_at: datetime


class AdminFeedbackListOut(BaseModel):
    total: int
    items: list[AdminFeedbackOut]
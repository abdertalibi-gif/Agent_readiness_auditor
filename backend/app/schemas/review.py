"""Schemas for customer reviews."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ReviewCreate(BaseModel):
    audit_id: str = Field(..., min_length=1, max_length=64)
    rating: int = Field(..., ge=1, le=5)
    comment: str | None = Field(
        default=None, max_length=1000, description="Plain-text feedback (sanitized on write)."
    )


class ReviewUpdate(BaseModel):
    rating: int | None = Field(default=None, ge=1, le=5)
    comment: str | None = Field(default=None, max_length=1000)


class ReviewOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str
    audit_id: str
    rating: int
    comment: str | None = None
    status: str
    created_at: datetime
    updated_at: datetime


class MyReviewOut(BaseModel):
    id: str
    audit_id: str
    audit_url: str | None = None
    rating: int
    comment: str | None = None
    status: str
    created_at: datetime
    updated_at: datetime


class MyReviewListOut(BaseModel):
    total: int
    items: list[MyReviewOut]


class PublicReviewOut(BaseModel):
    id: str
    rating: int
    comment: str | None = None
    user_name: str | None = None
    audit_url: str | None = None
    created_at: datetime


class PublicReviewListOut(BaseModel):
    total: int
    items: list[PublicReviewOut]


class ReviewStatsOut(BaseModel):
    average_rating: float | None = None
    total_reviews: int = 0
    rating_counts: dict[str, int] = {}


class AdminReviewOut(BaseModel):
    id: str
    user_id: str
    user_name: str | None = None
    user_email: str | None = None
    audit_id: str
    audit_url: str | None = None
    rating: int
    comment: str | None = None
    status: str
    created_at: datetime
    updated_at: datetime


class AdminReviewListOut(BaseModel):
    total: int
    items: list[AdminReviewOut]


ReviewStatus = Literal["PENDING", "APPROVED", "HIDDEN"]

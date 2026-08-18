from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import AuditStatus, Category, CheckStatus, Severity


# ---------- Requests ----------
class AuditCreate(BaseModel):
    url: str = Field(..., min_length=1, max_length=2048, description="Public website URL to audit")
    max_pages: int | None = Field(
        default=None,
        ge=1,
        le=50,
        description="Optional page limit for this audit (capped at the server maximum).",
    )
    wait_for_completion: bool = Field(
        default=False, description="Block until the audit completes (used by tests/tools)."
    )


# ---------- Audit ----------
class WebsiteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    domain: str
    base_url: str
    created_at: datetime


class AuditOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    target_url: str
    status: AuditStatus
    score: float | None = None
    rating: str | None = None
    error_message: str | None = None
    failed_step: str | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    created_at: datetime
    progress_json: dict | None = None
    website: WebsiteOut | None = None
    user_id: str | None = None


class AuditStatusOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    status: AuditStatus
    progress_json: dict | None = None
    score: float | None = None
    rating: str | None = None
    error_message: str | None = None
    failed_step: str | None = None


class CategoryScore(BaseModel):
    category: Category
    label: str
    score: float
    weight: float
    status: str
    checks_total: int
    checks_passed: int
    checks_failed: int
    checks_warning: int


class AuditSummaryOut(BaseModel):
    id: str
    target_url: str
    status: AuditStatus
    score: float | None = None
    rating: str | None = None
    rating_label: str | None = None
    overall_status: str | None = None
    categories: list[CategoryScore] = []
    counts: dict[str, int] = {}
    ai_summary: str | None = None
    coverage: dict[str, int] = {}
    platform: str | None = None
    created_at: datetime
    completed_at: datetime | None = None


# ---------- Checks / issues ----------
class CheckOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    check_id: str
    category: Category
    name: str
    description: str | None = None
    status: CheckStatus
    severity: Severity
    score: float
    weight: float
    evidence: dict | None = None
    recommendation: str | None = None
    why_matters: str | None = None
    ai_explanation: str | None = None


class IssuesOut(BaseModel):
    total: int
    items: list[CheckOut]


class PageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    url: str
    final_url: str | None = None
    status_code: int | None = None
    depth: int
    is_same_domain: bool
    content_type: str | None = None
    response_time_ms: int | None = None
    title: str | None = None
    meta_description: str | None = None
    canonical: str | None = None
    robots_meta: dict | None = None
    headings: dict | None = None
    links_count: int
    broken_links: list | None = None
    images: list | None = None
    structured_data: list | None = None
    open_graph: dict | None = None
    text_preview: str | None = None
    word_count: int
    lang: str | None = None
    has_forms: bool
    has_buttons: bool
    js_dependency_count: int
    crawled_at: datetime


class RecommendationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    check_id: str | None = None
    priority: str
    title: str
    description: str | None = None
    how_to_fix: str | None = None
    effort: str | None = None
    impact: str | None = None
    source: str

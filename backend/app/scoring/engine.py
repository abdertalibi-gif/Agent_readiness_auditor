"""Transparent scoring engine.

Every score is computed from the collected CheckResults. Category scores are
weighted averages of their checks; the overall score is the weighted sum of
category scores. No score is ever hardcoded.

    Score bands:
      0-39   Critical
      40-59  Poor
      60-74  Moderate
      75-89  Good
      90-100 Excellent
"""

from dataclasses import dataclass, field

from app.analyzers.base import CheckResult
from app.scoring.categories import CATEGORIES, CATEGORY_WEIGHTS, category_label


def rating_for(score: float) -> tuple[str, str]:
    if score >= 90:
        return "EXCELLENT", "Excellent"
    if score >= 75:
        return "GOOD", "Good"
    if score >= 60:
        return "MODERATE", "Moderate"
    if score >= 40:
        return "POOR", "Poor"
    return "CRITICAL", "Critical"


@dataclass
class CategoryScore:
    category: str
    label: str
    score: float
    weight: float
    status: str
    checks_total: int
    checks_passed: int
    checks_failed: int
    checks_warning: int


@dataclass
class ScoreResult:
    overall: float
    rating: str
    rating_label: str
    categories: dict[str, CategoryScore] = field(default_factory=dict)
    counts: dict[str, int] = field(default_factory=dict)


def _status_for(score: float) -> str:
    if score >= 75:
        return "good"
    if score >= 55:
        return "warning"
    return "critical"


def score_checks(checks: list[CheckResult]) -> ScoreResult:
    by_category: dict[str, list[CheckResult]] = {c: [] for c in CATEGORIES}
    for check in checks:
        if check.category in by_category:
            by_category[check.category].append(check)

    categories: dict[str, CategoryScore] = {}
    counts: dict[str, int] = {"PASS": 0, "WARNING": 0, "FAIL": 0, "NOT_APPLICABLE": 0}

    for category in CATEGORIES:
        items = by_category.get(category, [])
        scorable = [c for c in items if c.status != "NOT_APPLICABLE"]
        for c in items:
            counts[c.status] = counts.get(c.status, 0) + 1

        if not scorable:
            categories[category] = CategoryScore(
                category=category,
                label=category_label(category),
                score=0.0,
                weight=CATEGORY_WEIGHTS[category],
                status="not_measured",
                checks_total=len(items),
                checks_passed=0,
                checks_failed=0,
                checks_warning=0,
            )
            continue

        weight_total = sum(c.weight for c in scorable) or 1.0
        score = sum(c.score * c.weight for c in scorable) / weight_total
        categories[category] = CategoryScore(
            category=category,
            label=category_label(category),
            score=round(score, 1),
            weight=CATEGORY_WEIGHTS[category],
            status=_status_for(score),
            checks_total=len(items),
            checks_passed=sum(1 for c in scorable if c.status == "PASS"),
            checks_failed=sum(1 for c in scorable if c.status == "FAIL"),
            checks_warning=sum(1 for c in scorable if c.status == "WARNING"),
        )

    overall = round(sum(cat_score.score * CATEGORY_WEIGHTS[cat] for cat, cat_score in categories.items()), 1)
    rating, label = rating_for(overall)

    return ScoreResult(
        overall=overall,
        rating=rating,
        rating_label=label,
        categories=categories,
        counts=counts,
    )

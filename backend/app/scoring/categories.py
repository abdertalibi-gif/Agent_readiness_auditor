"""Category definitions and weights for the scoring engine."""

from app.schemas.common import CATEGORY_LABELS

CATEGORY_WEIGHTS: dict[str, float] = {
    "discoverability": 0.15,
    "crawlability": 0.15,
    "semantic_structure": 0.15,
    "structured_data": 0.15,
    "content_accessibility": 0.15,
    "navigation_linking": 0.10,
    "technical_quality": 0.10,
    "performance_accessibility": 0.05,
}

CATEGORIES: list[str] = list(CATEGORY_WEIGHTS.keys())
WEIGHT_TOTAL = sum(CATEGORY_WEIGHTS.values())


def category_label(category: str) -> str:
    return CATEGORY_LABELS.get(category, category.replace("_", " ").title())

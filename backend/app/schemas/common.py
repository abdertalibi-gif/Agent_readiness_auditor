from typing import Literal

AuditStatus = Literal["QUEUED", "RUNNING", "COMPLETED", "FAILED", "CANCELLED", "PARTIAL"]
CheckStatus = Literal["PASS", "WARNING", "FAIL", "NOT_APPLICABLE"]
Severity = Literal["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"]

Category = Literal[
    "discoverability",
    "crawlability",
    "semantic_structure",
    "structured_data",
    "content_accessibility",
    "navigation_linking",
    "technical_quality",
    "performance_accessibility",
]

CATEGORY_LABELS: dict[str, str] = {
    "discoverability": "Discoverability",
    "crawlability": "Crawlability",
    "semantic_structure": "Semantic Structure",
    "structured_data": "Structured Data",
    "content_accessibility": "Content Accessibility",
    "navigation_linking": "Navigation & Linking",
    "technical_quality": "Technical Quality",
    "performance_accessibility": "Performance & Accessibility",
}

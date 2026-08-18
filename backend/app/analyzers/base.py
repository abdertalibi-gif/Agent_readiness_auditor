"""Analyzer framework.

Every analyzer inspects a `CrawlContext` and returns a list of `CheckResult`s.
Checks are deterministic and evidence-based — the scoring engine consumes them.
"""

from dataclasses import dataclass, field
from typing import Any, Protocol

from app.crawler.crawler import CrawlResult
from app.crawler.parsers import PageData


@dataclass
class CrawlContext:
    base_url: str
    crawl: CrawlResult
    pages: list[PageData] = field(default_factory=list)
    home_page: PageData | None = None
    extra: dict[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if not self.pages:
            self.pages = self.crawl.pages
        if self.home_page is None and self.pages:
            for p in self.pages:
                if p.url == self.crawl.base_url:
                    self.home_page = p
                    break


@dataclass
class CheckResult:
    check_id: str
    category: str
    name: str
    description: str
    status: str
    severity: str
    score: float
    weight: float
    evidence: dict[str, Any]
    recommendation: str | None = None
    why_matters: str | None = None
    ai_explanation: str | None = None


def pass_result(
    check_id: str,
    category: str,
    name: str,
    description: str,
    weight: float,
    evidence: dict | None = None,
    recommendation: str | None = None,
    why_matters: str | None = None,
    severity: str = "INFO",
) -> CheckResult:
    return CheckResult(
        check_id=check_id,
        category=category,
        name=name,
        description=description,
        status="PASS",
        severity=severity,
        score=100.0,
        weight=weight,
        evidence=evidence or {},
        recommendation=recommendation,
        why_matters=why_matters,
    )


def warn_result(
    check_id: str,
    category: str,
    name: str,
    description: str,
    weight: float,
    evidence: dict | None = None,
    recommendation: str | None = None,
    why_matters: str | None = None,
    severity: str = "MEDIUM",
    score: float = 55.0,
) -> CheckResult:
    return CheckResult(
        check_id=check_id,
        category=category,
        name=name,
        description=description,
        status="WARNING",
        severity=severity,
        score=score,
        weight=weight,
        evidence=evidence or {},
        recommendation=recommendation,
        why_matters=why_matters,
    )


def fail_result(
    check_id: str,
    category: str,
    name: str,
    description: str,
    weight: float,
    evidence: dict | None = None,
    recommendation: str | None = None,
    why_matters: str | None = None,
    severity: str = "HIGH",
    score: float = 15.0,
) -> CheckResult:
    return CheckResult(
        check_id=check_id,
        category=category,
        name=name,
        description=description,
        status="FAIL",
        severity=severity,
        score=score,
        weight=weight,
        evidence=evidence or {},
        recommendation=recommendation,
        why_matters=why_matters,
    )


def na_result(
    check_id: str,
    category: str,
    name: str,
    description: str,
    weight: float,
    evidence: dict | None = None,
) -> CheckResult:
    return CheckResult(
        check_id=check_id,
        category=category,
        name=name,
        description=description,
        status="NOT_APPLICABLE",
        severity="INFO",
        score=0.0,
        weight=weight,
        evidence=evidence or {},
    )


class Analyzer(Protocol):
    name: str

    async def analyze(self, ctx: CrawlContext) -> list[CheckResult]: ...

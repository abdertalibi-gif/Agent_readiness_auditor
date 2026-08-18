"""AI analysis orchestration.

Always best-effort: any failure is logged and the audit continues with
engine-generated content. AI outputs are grounded in collected evidence.
"""

import asyncio
import logging

from app.ai import prompts
from app.ai.base import get_provider
from app.analyzers.base import CheckResult
from app.scoring.categories import category_label
from app.scoring.engine import ScoreResult

logger = logging.getLogger("auditor.ai.analysis")

MAX_AI_ISSUES = 10


async def enrich_checks(checks: list[CheckResult]) -> None:
    """Best-effort AI explanations for the most severe issues."""
    provider = get_provider()
    if not provider:
        return
    targets = [
        c for c in checks if c.status != "PASS" and c.severity in ("CRITICAL", "HIGH", "MEDIUM")
    ][:MAX_AI_ISSUES]

    async def explain(check: CheckResult) -> None:
        try:
            explanation = await provider.complete(
                prompts.SYSTEM_BASE,
                prompts.explanation_prompt(check.name, check.evidence or {}, check.why_matters),
            )
            if explanation:
                check.ai_explanation = explanation
        except Exception:  # noqa: BLE001
            logger.exception("ai explanation failed for check %s", check.check_id)

    await asyncio.gather(*(explain(c) for c in targets))


async def generate_summary(
    target_url: str, score_result: ScoreResult, checks: list[CheckResult]
) -> str | None:
    provider = get_provider()
    if not provider:
        return None
    categories = [
        {
            "label": category_label(cat),
            "score": cs.score,
            "status": cs.status,
        }
        for cat, cs in score_result.categories.items()
    ]
    top_issues = [
        f"{c.name} ({c.severity})" for c in sorted(
            (c for c in checks if c.status in ("FAIL", "WARNING")),
            key=lambda c: ("CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO").index(c.severity),
        )[:8]
    ]
    try:
        return await provider.complete(
            prompts.SYSTEM_BASE,
            prompts.summary_prompt(target_url, score_result.overall, score_result.rating_label, categories, top_issues),
            max_tokens=300,
        )
    except Exception:  # noqa: BLE001
        logger.exception("ai summary failed")
        return None


async def analyze_business_purpose(target_url: str, home_text: str) -> str | None:
    provider = get_provider()
    if not provider or not home_text:
        return None
    try:
        return await provider.complete(
            prompts.SYSTEM_BASE,
            prompts.purpose_prompt(target_url, home_text),
            max_tokens=200,
        )
    except Exception:  # noqa: BLE001
        logger.exception("ai purpose analysis failed")
        return None

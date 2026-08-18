"""Analyzer registry: runs all deterministic analyzers over a CrawlContext."""

import logging
from typing import Any

from app.analyzers import (
    content,
    links,
    metadata,
    performance,
    robots,
    semantic,
    shopify,
    sitemap,
    structured_data,
    technical,
)
from app.analyzers.base import CheckResult, CrawlContext

logger = logging.getLogger("auditor.analyzers")

ANALYZERS: list[dict[str, Any]] = [
    {"name": "robots", "analyze": robots.analyze},
    {"name": "sitemap", "analyze": sitemap.analyze},
    {"name": "metadata", "analyze": metadata.analyze},
    {"name": "semantic", "analyze": semantic.analyze},
    {"name": "structured_data", "analyze": structured_data.analyze},
    {"name": "links", "analyze": links.analyze},
    {"name": "content", "analyze": content.analyze},
    {"name": "technical", "analyze": technical.analyze},
    {"name": "performance", "analyze": performance.analyze},
    {"name": "shopify", "analyze": shopify.analyze},
]


async def run_analyzers(ctx: CrawlContext) -> list[CheckResult]:
    results: list[CheckResult] = []
    for definition in ANALYZERS:
        try:
            checks = await definition["analyze"](ctx)
            results.extend(checks)
        except Exception:  # noqa: BLE001 - one analyzer must not sink the audit
            logger.exception("analyzer %s failed", definition["name"])
    return results

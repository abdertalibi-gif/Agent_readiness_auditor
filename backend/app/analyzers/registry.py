"""Analyzer registry: runs all deterministic analyzers over a CrawlContext."""

import asyncio
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
    try:
        batch_results = await asyncio.gather(
            *(definition["analyze"](ctx) for definition in ANALYZERS),
            return_exceptions=True,
        )
        for result in batch_results:
            if isinstance(result, Exception):
                logger.exception("analyzer failed: %s", result)
            elif isinstance(result, list):
                results.extend(result)
    except Exception:
        logger.exception("run_analyzers failed")
    return results

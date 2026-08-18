"""Structured data checks (Structured Data)."""

import logging
from typing import Any

from app.analyzers.base import CrawlContext, fail_result, pass_result, warn_result

logger = logging.getLogger("auditor.analyzers.structured_data")


def _types(data: Any) -> list[str]:
    """Extract @type values, tolerating malformed JSON-LD payloads.

    Real-world sites emit everything from plain strings to lists of lists.
    Only non-empty string type names are returned; anything else is ignored so
    downstream set membership (which requires hashable values) never throws.
    """
    if not isinstance(data, dict):
        return []
    t = data.get("@type")
    values = [t] if isinstance(t, str) else (t if isinstance(t, list) else [])
    return [v for v in values if isinstance(v, str) and v]


def _type_names(payloads: list[dict]) -> list[str]:
    names: list[str] = []
    for payload in payloads:
        names.extend(_types(payload))
    return [n for n in names if n]


async def analyze(ctx: CrawlContext) -> list:
    checks = []
    home = ctx.home_page
    pages = [p for p in ctx.pages if p.is_html]

    home_data = home.structured_data if home else []
    home_types = _type_names(home_data)
    pages_with_data = [p for p in pages if p.structured_data]

    if home_types:
        checks.append(
            pass_result(
                check_id="schema_present",
                category="structured_data",
                name="Structured data detected",
                description="The homepage exposes structured data (JSON-LD).",
                weight=1.5,
                evidence={"types": home_types},
            )
        )
    else:
        checks.append(
            fail_result(
                check_id="schema_present",
                category="structured_data",
                name="No structured data on homepage",
                description="No Schema.org structured data was found on the homepage.",
                weight=1.5,
                severity="HIGH",
                evidence={"page": ctx.base_url},
                recommendation="Add JSON-LD structured data describing your organization and content.",
                why_matters="Structured data lets agents extract entities (organization, products, contacts) reliably.",
            )
        )

    entity_checks = [
        ("organization", "Organization"),
        ("website", "WebSite"),
        ("contact", ("ContactPage", "ContactPoint")),
        ("breadcrumb", "BreadcrumbList"),
        ("product", ("Product", "Service")),
    ]
    for check_id, wanted in entity_checks:
        targets = {wanted} if isinstance(wanted, str) else set(wanted)
        found = [t for t in home_types if t in targets]
        if found:
            checks.append(
                pass_result(
                    check_id=f"schema_{check_id}",
                    category="structured_data",
                    name=f"{targets.pop()} schema present",
                    description=f"The site declares the {', '.join(found)} structured data type.",
                    weight=1.0,
                    evidence={"types": found},
                )
            )
        else:
            label = wanted if isinstance(wanted, str) else " / ".join(wanted)
            checks.append(
                warn_result(
                    check_id=f"schema_{check_id}",
                    category="structured_data",
                    name=f"{label} schema not detected",
                    description=f"Could not detect {label} structured data.",
                    weight=0.75,
                    evidence={"page": ctx.base_url},
                    recommendation=f"Consider adding {label} structured data to help agents identify this information.",
                )
            )

    if home and home.open_graph:
        og_required = ["og:title", "og:type", "og:url"]
        missing = [p for p in og_required if p not in home.open_graph]
        if not missing:
            checks.append(
                pass_result(
                    check_id="open_graph",
                    category="structured_data",
                    name="Open Graph tags present",
                    description="The homepage includes core Open Graph tags.",
                    weight=1.0,
                    evidence={"tags": sorted(home.open_graph.keys())[:10]},
                )
            )
        else:
            checks.append(
                warn_result(
                    check_id="open_graph",
                    category="structured_data",
                    name="Open Graph tags incomplete",
                    description="Some core Open Graph tags are missing.",
                    weight=1.0,
                    evidence={"missing": missing, "present": sorted(home.open_graph.keys())[:10]},
                    recommendation=f"Add missing Open Graph tags: {', '.join(missing)}.",
                )
            )
    else:
        checks.append(
            warn_result(
                check_id="open_graph",
                category="structured_data",
                name="No Open Graph tags",
                description="No Open Graph tags were found on the homepage.",
                weight=1.0,
                evidence={"page": ctx.base_url},
                recommendation="Add Open Graph tags (og:title, og:type, og:url, og:image) to the homepage.",
            )
        )

    coverage = len(pages_with_data) / len(pages) if pages else 0.0
    if coverage >= 0.6:
        checks.append(
            pass_result(
                check_id="structured_data_coverage",
                category="structured_data",
                name="Good structured data coverage",
                description="Most crawled pages include structured data.",
                weight=1.0,
                evidence={"pages_with_data": len(pages_with_data), "total": len(pages), "coverage": round(coverage, 2)},
            )
        )
    elif coverage > 0:
        checks.append(
            warn_result(
                check_id="structured_data_coverage",
                category="structured_data",
                name="Partial structured data coverage",
                description="Only some crawled pages include structured data.",
                weight=1.0,
                evidence={"pages_with_data": len(pages_with_data), "total": len(pages), "coverage": round(coverage, 2)},
                recommendation="Add structured data to your most important pages first.",
            )
        )
    else:
        checks.append(
            fail_result(
                check_id="structured_data_coverage",
                category="structured_data",
                name="No structured data coverage",
                description="None of the crawled pages include structured data.",
                weight=1.0,
                severity="MEDIUM",
                evidence={"pages_with_data": 0, "total": len(pages)},
                recommendation="Introduce JSON-LD structured data across your site.",
            )
        )

    return checks

"""robots.txt checks (Discoverability / Crawlability)."""

import logging

from app.analyzers.base import CrawlContext, fail_result, pass_result, warn_result

logger = logging.getLogger("auditor.analyzers.robots")


async def analyze(ctx: CrawlContext) -> list:
    checks = []
    robots = ctx.crawl.robots

    if robots.fetched:
        checks.append(
            pass_result(
                check_id="robots_txt_exists",
                category="crawlability",
                name="robots.txt is available",
                description="The site exposes a robots.txt file at /robots.txt.",
                weight=1.0,
                evidence={"url": robots.url},
                recommendation="Keep robots.txt present and up to date.",
                why_matters="AI agents and crawlers consult robots.txt first to learn what they may fetch.",
            )
        )
        if robots.rules:
            checks.append(
                pass_result(
                    check_id="robots_txt_rules",
                    category="crawlability",
                    name="robots.txt defines crawl rules",
                    description="robots.txt contains Allow/Disallow rules for user agents.",
                    weight=1.0,
                    evidence={"rule_count": len(robots.rules)},
                )
            )
        else:
            checks.append(
                warn_result(
                    check_id="robots_txt_rules",
                    category="crawlability",
                    name="robots.txt defines no crawl rules",
                    description="robots.txt exists but does not define any Allow/Disallow rules.",
                    weight=1.0,
                    evidence={"rule_count": len(robots.rules)},
                    recommendation="Add explicit Allow/Disallow rules so agents know what is crawlable.",
                )
            )
    else:
        checks.append(
            fail_result(
                check_id="robots_txt_exists",
                category="crawlability",
                name="robots.txt is missing or unreachable",
                description="No robots.txt was found (or it could not be fetched).",
                weight=1.5,
                severity="MEDIUM",
                evidence={"robots_url": f"{ctx.base_url}/robots.txt"},
                recommendation="Add a robots.txt file describing which paths agents may crawl.",
                why_matters="Without robots.txt, agents must guess crawl boundaries and may miss key pages.",
            )
        )

    if robots.sitemaps:
        checks.append(
            pass_result(
                check_id="robots_sitemap_declared",
                category="discoverability",
                name="Sitemap declared in robots.txt",
                description="robots.txt references one or more sitemaps.",
                weight=1.0,
                evidence={"sitemaps": robots.sitemaps[:5]},
                recommendation="Keep the Sitemap directive in robots.txt current.",
                why_matters="Sitemap references in robots.txt are the canonical way agents discover all pages.",
            )
        )
    else:
        checks.append(
            warn_result(
                check_id="robots_sitemap_declared",
                category="discoverability",
                name="No sitemap declared in robots.txt",
                description="robots.txt does not reference any sitemap.",
                weight=1.0,
                evidence={"sitemaps": robots.sitemaps},
                recommendation="Add a 'Sitemap:' line to robots.txt pointing to your sitemap.xml.",
                why_matters="A declared sitemap dramatically improves discovery of deep or new pages.",
            )
        )

    return checks

"""Sitemap checks (Crawlability / Discoverability)."""

from app.analyzers.base import CrawlContext, fail_result, pass_result, warn_result


async def analyze(ctx: CrawlContext) -> list:
    checks = []
    urls = ctx.crawl.sitemap_urls
    pages = ctx.pages
    page_urls = {p.url for p in pages}

    if urls:
        checks.append(
            pass_result(
                check_id="sitemap_present",
                category="crawlability",
                name="Sitemap is present",
                description="The site provides an XML sitemap with page URLs.",
                weight=1.5,
                evidence={"sitemap_url_count": len(urls), "sample": urls[:5]},
                recommendation="Keep the sitemap current and register it in Search Console tools.",
                why_matters="Sitemaps give agents a complete, structured index of your important pages.",
            )
        )
        overlap = len(page_urls & set(urls))
        ratio = overlap / len(urls) if urls else 1.0
        if ratio >= 0.7:
            checks.append(
                pass_result(
                    check_id="sitemap_consistent",
                    category="crawlability",
                    name="Sitemap URLs are reachable",
                    description="Most URLs in the sitemap were successfully crawled.",
                    weight=1.0,
                    evidence={"overlap": overlap, "total": len(urls), "ratio": round(ratio, 2)},
                )
            )
        else:
            checks.append(
                warn_result(
                    check_id="sitemap_consistent",
                    category="crawlability",
                    name="Many sitemap URLs are unreachable",
                    description="A significant share of sitemap URLs could not be fetched.",
                    weight=1.0,
                    evidence={"overlap": overlap, "total": len(urls), "ratio": round(ratio, 2)},
                    recommendation="Remove stale URLs from the sitemap and fix the failing ones.",
                )
            )
    else:
        checks.append(
            fail_result(
                check_id="sitemap_present",
                category="crawlability",
                name="No sitemap found",
                description="No XML sitemap was found (declared or at common locations).",
                weight=1.5,
                severity="MEDIUM",
                evidence={"checked": ["/sitemap.xml", "/sitemap_index.xml", "robots.txt Sitemap directive"]},
                recommendation="Create an XML sitemap listing all important pages and reference it in robots.txt.",
                why_matters="Without a sitemap, agents must discover everything through links alone.",
            )
        )

    return checks

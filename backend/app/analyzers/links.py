"""Navigation & linking checks (Navigation & Linking)."""

from app.analyzers.base import CrawlContext, fail_result, pass_result, warn_result


async def analyze(ctx: CrawlContext) -> list:
    checks = []
    pages = [p for p in ctx.pages if p.is_html]
    home = ctx.home_page

    if pages:
        total_internal = sum(1 for p in pages for link in p.links if link.is_internal)
        checks.append(
            pass_result(
                check_id="internal_links",
                category="navigation_linking",
                name="Internal links are present",
                description="Crawled pages expose internal links between pages.",
                weight=1.5,
                evidence={"total_internal_links": total_internal, "pages": len(pages)},
            )
        )
    else:
        checks.append(
            fail_result(
                check_id="internal_links",
                category="navigation_linking",
                name="No internal links found",
                description="No internal links were discovered during the crawl.",
                weight=1.5,
                severity="HIGH",
                evidence={"pages": len(pages)},
                recommendation="Link your important pages to each other so agents can traverse the site.",
                why_matters="Agents discover pages by following internal links.",
            )
        )

    if home and home.has_nav:
        checks.append(
            pass_result(
                check_id="navigation_element",
                category="navigation_linking",
                name="Navigation element present",
                description="The homepage uses a <nav> element.",
                weight=1.0,
                evidence={"page": ctx.base_url},
            )
        )
    else:
        checks.append(
            warn_result(
                check_id="navigation_element",
                category="navigation_linking",
                name="No <nav> element on homepage",
                description="The homepage does not use a semantic <nav> element.",
                weight=1.0,
                evidence={"page": ctx.base_url},
                recommendation="Wrap primary navigation links in a <nav> element.",
            )
        )

    broken_urls: set[str] = set()
    for p in pages:
        broken_urls.update(b["href"] for b in (p.broken_links_for_page or []))
    if broken_urls:
        checks.append(
            fail_result(
                check_id="broken_links",
                category="navigation_linking",
                name="Broken internal links detected",
                description="Some internal links return errors (4xx/5xx) or fail to load.",
                weight=1.5,
                severity="HIGH",
                evidence={"broken_count": len(broken_urls), "examples": sorted(broken_urls)[:5]},
                recommendation="Fix or remove the broken internal links listed in the evidence.",
                why_matters="Broken links break agent traversal and signal poor maintenance.",
            )
        )
    else:
        checks.append(
            pass_result(
                check_id="broken_links",
                category="navigation_linking",
                name="No broken internal links detected",
                description="Checked internal links resolved without errors.",
                weight=1.0,
                evidence={"checked": "sampled internal links"},
            )
        )

    reachable = len(pages)
    if reachable >= 5:
        checks.append(
            pass_result(
                check_id="multiple_pages",
                category="navigation_linking",
                name="Multiple pages discoverable",
                description="The crawler discovered several pages via links.",
                weight=1.0,
                evidence={"pages": reachable},
            )
        )
    else:
        checks.append(
            warn_result(
                check_id="multiple_pages",
                category="navigation_linking",
                name="Very few pages discovered",
                description="Fewer than five pages were discoverable from the homepage.",
                weight=1.0,
                evidence={"pages": reachable},
                recommendation="Ensure important pages are linked from the homepage or navigation.",
            )
        )

    return checks

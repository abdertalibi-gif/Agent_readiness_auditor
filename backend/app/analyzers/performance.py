"""Performance & accessibility checks (Performance & Accessibility)."""

from app.analyzers.base import CrawlContext, fail_result, na_result, pass_result, warn_result


async def analyze(ctx: CrawlContext) -> list:
    checks = []
    home = ctx.home_page
    pages = [p for p in ctx.pages if p.is_html]

    if home and home.response_time_ms is not None:
        ms = home.response_time_ms
        if ms <= 800:
            checks.append(
                pass_result(
                    check_id="homepage_response_time",
                    category="performance_accessibility",
                    name="Homepage responds quickly",
                    description=f"Homepage response time was {ms}ms.",
                    weight=1.5,
                    evidence={"response_time_ms": ms},
                )
            )
        elif ms <= 2500:
            checks.append(
                warn_result(
                    check_id="homepage_response_time",
                    category="performance_accessibility",
                    name="Homepage response time is elevated",
                    description=f"Homepage response time was {ms}ms.",
                    weight=1.5,
                    evidence={"response_time_ms": ms},
                    recommendation="Improve server response time (caching, CDN, faster origin).",
                )
            )
        else:
            checks.append(
                fail_result(
                    check_id="homepage_response_time",
                    category="performance_accessibility",
                    name="Homepage is slow to respond",
                    description=f"Homepage response time was {ms}ms.",
                    weight=1.5,
                    severity="MEDIUM",
                    evidence={"response_time_ms": ms},
                    recommendation="Investigate slow server responses; agents may time out.",
                    why_matters="Slow sites cause agent timeouts and skipped pages.",
                )
            )
    else:
        checks.append(
            na_result(
                "homepage_response_time",
                "performance_accessibility",
                "Homepage response time unavailable",
                "The homepage response time could not be measured.",
                1.0,
            )
        )

    if home and home.viewport:
        checks.append(
            pass_result(
                check_id="mobile_viewport",
                category="performance_accessibility",
                name="Mobile viewport configured",
                description="The homepage defines a viewport meta tag.",
                weight=1.0,
                evidence={"viewport": home.viewport},
            )
        )
    else:
        checks.append(
            warn_result(
                check_id="mobile_viewport",
                category="performance_accessibility",
                name="Mobile viewport not configured",
                description="No viewport meta tag was found on the homepage.",
                weight=1.0,
                evidence={"page": ctx.base_url},
                recommendation="Add <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">.",
                why_matters="A missing viewport signals poor mobile friendliness.",
            )
        )

    all_images = [img for p in pages for img in p.images]
    if all_images:
        no_alt = [img for img in all_images if not img.alt]
        coverage = 1 - (len(no_alt) / len(all_images))
        if coverage >= 0.9:
            checks.append(
                pass_result(
                    check_id="image_alt",
                    category="performance_accessibility",
                    name="Images have alt text",
                    description="Most images include alt text.",
                    weight=1.0,
                    evidence={"images": len(all_images), "missing_alt": len(no_alt), "coverage": round(coverage, 2)},
                )
            )
        else:
            checks.append(
                warn_result(
                    check_id="image_alt",
                    category="performance_accessibility",
                    name="Many images lack alt text",
                    description=f"{len(no_alt)} of {len(all_images)} images have no alt text.",
                    weight=1.0,
                    evidence={"images": len(all_images), "missing_alt": len(no_alt), "examples": [img.src for img in no_alt[:5]]},
                    recommendation="Add descriptive alt text to images.",
                )
            )
    else:
        checks.append(
            na_result(
                "image_alt",
                "performance_accessibility",
                "No images to evaluate",
                "No images were found on the crawled pages.",
                0.5,
            )
        )

    crawl_errors = ctx.crawl.crawl_errors
    if crawl_errors and not pages:
        checks.append(
            fail_result(
                check_id="availability",
                category="performance_accessibility",
                name="Website is not reachable",
                description="No pages could be fetched from this website.",
                weight=2.0,
                severity="CRITICAL",
                evidence={"errors": crawl_errors[:5]},
                recommendation="Confirm the site is online and accessible from the public internet.",
                why_matters="An unreachable website cannot be used by agents at all.",
            )
        )
    else:
        checks.append(
            pass_result(
                check_id="availability",
                category="performance_accessibility",
                name="Website is reachable",
                description=f"Crawled {len(pages)} page(s) successfully.",
                weight=1.0,
                evidence={"pages": len(pages), "crawl_errors": len(crawl_errors)},
            )
        )

    return checks

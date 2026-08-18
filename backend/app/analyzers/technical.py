"""Technical quality checks (Technical Quality).

Uses headers captured from the homepage fetch: HTTPS, security headers,
content-type, robots meta, status codes.
"""

from app.analyzers.base import CrawlContext, fail_result, pass_result, warn_result


async def analyze(ctx: CrawlContext) -> list:
    checks = []
    home = ctx.home_page

    checks.append(_https_check(ctx, home))
    checks.append(_status_check(ctx, home))

    if home and home.robots_meta:
        robots = home.robots_meta
        if robots.get("noindex"):
            checks.append(
                fail_result(
                    check_id="noindex",
                    category="technical_quality",
                    name="Homepage blocks indexing",
                    description="The homepage contains a robots noindex directive.",
                    weight=1.5,
                    severity="CRITICAL",
                    evidence={"robots": robots.get("content")},
                    recommendation="Remove noindex from the homepage if it should be discoverable.",
                    why_matters="A noindex homepage tells agents and crawlers to ignore the site entirely.",
                )
            )
        else:
            checks.append(
                pass_result(
                    check_id="noindex",
                    category="technical_quality",
                    name="Homepage is indexable",
                    description="The homepage does not block indexing.",
                    weight=1.0,
                    evidence={"robots": robots.get("content")},
                )
            )
    else:
        checks.append(
            pass_result(
                check_id="noindex",
                category="technical_quality",
                name="Homepage is indexable",
                description="No blocking robots directive was found.",
                weight=1.0,
                evidence={"robots": None},
            )
        )

    checks.append(_security_headers_check(ctx))
    checks.append(_redirect_check(ctx))

    return checks


def _https_check(ctx: CrawlContext, home) -> object:
    base = ctx.base_url
    if base.startswith("https://"):
        return pass_result(
            check_id="https",
            category="technical_quality",
            name="Site is served over HTTPS",
            description="The website is accessible over HTTPS.",
            weight=1.5,
            evidence={"url": base},
            why_matters="Agents prefer and trust secure endpoints.",
        )
    return fail_result(
        check_id="https",
        category="technical_quality",
        name="Site is not served over HTTPS",
        description="The website does not use HTTPS.",
        weight=1.5,
        severity="CRITICAL",
        evidence={"url": base},
        recommendation="Serve your site over HTTPS with a valid TLS certificate.",
        why_matters="Without HTTPS, agents and browsers may refuse to access the site.",
    )


def _status_check(ctx: CrawlContext, home) -> object:
    if home is None:
        return warn_result(
            check_id="home_status",
            category="technical_quality",
            name="Homepage status unknown",
            description="The homepage could not be fetched for a status check.",
            weight=0.5,
            evidence={"pages": len(ctx.pages)},
        )
    code = home.status_code
    if code is not None and 200 <= code < 300:
        return pass_result(
            check_id="home_status",
            category="technical_quality",
            name="Homepage responds with a healthy status",
            description=f"The homepage returned HTTP {code}.",
            weight=1.0,
            evidence={"status_code": code},
        )
    return fail_result(
        check_id="home_status",
        category="technical_quality",
        name="Homepage returns an error status",
        description=f"The homepage returned HTTP {code}.",
        weight=1.0,
        severity="CRITICAL",
        evidence={"status_code": code},
        recommendation="Fix the homepage so it returns HTTP 200.",
    )


def _security_headers_check(ctx: CrawlContext) -> object:
    home = ctx.home_page
    if not home:
        return na_result_for(
            "security_headers",
            "technical_quality",
            "Security headers not measured",
            "The homepage was not available to inspect response headers.",
            0.5,
        )
    relevant = {
        "content-security-policy",
        "strict-transport-security",
        "x-frame-options",
        "x-content-type-options",
        "referrer-policy",
    }
    evidence = home.response_headers or {}
    present = {k: evidence.get(k) for k in relevant if evidence.get(k)}
    if present:
        return pass_result(
            check_id="security_headers",
            category="technical_quality",
            name="Basic security headers present",
            description="Some basic security headers were detected.",
            weight=1.0,
            evidence={"headers": sorted(present.keys())},
        )
    return warn_result(
        check_id="security_headers",
        category="technical_quality",
        name="Basic security headers missing",
        description="No common security headers were detected on the homepage response.",
        weight=1.0,
        evidence={"headers": []},
        recommendation="Add security headers such as Strict-Transport-Security and X-Content-Type-Options.",
    )


def _redirect_check(ctx: CrawlContext) -> object:
    home = ctx.home_page
    if not home or not home.redirect_chain:
        return na_result_for(
            "redirect_chain",
            "technical_quality",
            "No redirect chain",
            "The homepage was fetched without redirects.",
            0.5,
        )
    chain = home.redirect_chain
    if len(chain) <= 1:
        return pass_result(
            check_id="redirect_chain",
            category="technical_quality",
            name="Redirects are minimal",
            description="The homepage resolves with at most one redirect.",
            weight=0.75,
            evidence={"chain": chain},
        )
    return warn_result(
        check_id="redirect_chain",
        category="technical_quality",
        name="Long redirect chain",
        description="The homepage requires several redirects to resolve.",
        weight=0.75,
        evidence={"chain": chain},
        recommendation="Reduce redirect hops; each hop slows agents and can drop metadata.",
    )


def na_result_for(check_id, category, name, description, weight):
    from app.analyzers.base import na_result

    return na_result(check_id, category, name, description, weight)

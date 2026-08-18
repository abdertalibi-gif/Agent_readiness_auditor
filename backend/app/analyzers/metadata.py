"""Metadata checks (Discoverability)."""

from app.analyzers.base import CrawlContext, fail_result, pass_result, warn_result

HOME_ONLY = ("home",)


async def analyze(ctx: CrawlContext) -> list:
    checks = []
    pages = [p for p in ctx.pages if p.is_html]
    home = ctx.home_page
    sampled = pages[:10]
    with_title = [p for p in sampled if p.title]
    with_desc = [p for p in sampled if p.meta_description]
    with_canonical = [p for p in sampled if p.canonical]

    if home and home.title:
        checks.append(
            pass_result(
                check_id="home_title",
                category="discoverability",
                name="Homepage has a title",
                description="The homepage defines a <title> element.",
                weight=1.5,
                evidence={"title": home.title},
            )
        )
    else:
        checks.append(
            fail_result(
                check_id="home_title",
                category="discoverability",
                name="Homepage is missing a title",
                description="No <title> element was found on the homepage.",
                weight=1.5,
                severity="CRITICAL",
                evidence={"page": ctx.base_url},
                recommendation="Add a concise, descriptive <title> to the homepage.",
                why_matters="The title is the primary identifier agents use to understand a page's purpose.",
            )
        )

    title_len = len(home.title) if home and home.title else 0
    if 10 <= title_len <= 70:
        checks.append(
            pass_result(
                check_id="title_length",
                category="discoverability",
                name="Title length is appropriate",
                description="The homepage title is within a reasonable length.",
                weight=1.0,
                evidence={"length": title_len, "title": home.title if home else None},
            )
        )
    elif title_len > 0:
        checks.append(
            warn_result(
                check_id="title_length",
                category="discoverability",
                name="Title length could be optimized",
                description="The homepage title is too long or too short for clear identification.",
                weight=1.0,
                evidence={"length": title_len, "title": home.title if home else None},
                recommendation="Aim for 30-60 characters describing page purpose.",
            )
        )

    if home and home.meta_description:
        checks.append(
            pass_result(
                check_id="meta_description",
                category="discoverability",
                name="Homepage has a meta description",
                description="A meta description is present on the homepage.",
                weight=1.0,
                evidence={"description": home.meta_description[:200]},
            )
        )
    else:
        checks.append(
            fail_result(
                check_id="meta_description",
                category="discoverability",
                name="Homepage is missing a meta description",
                description="No meta description was found on the homepage.",
                weight=1.0,
                severity="MEDIUM",
                evidence={"page": ctx.base_url},
                recommendation="Add a meta description summarizing the site's purpose.",
                why_matters="Descriptions help agents understand what a page is about without reading everything.",
            )
        )

    if home and home.canonical:
        checks.append(
            pass_result(
                check_id="canonical_present",
                category="discoverability",
                name="Homepage declares a canonical URL",
                description="The homepage uses a rel=canonical link.",
                weight=1.0,
                evidence={"canonical": home.canonical},
            )
        )
    else:
        checks.append(
            warn_result(
                check_id="canonical_present",
                category="discoverability",
                name="No canonical URL declared",
                description="The homepage does not declare a canonical URL.",
                weight=1.0,
                evidence={"page": ctx.base_url},
                recommendation="Add rel=canonical links to avoid duplicate-content confusion.",
            )
        )

    if sampled:
        if with_title:
            checks.append(
                pass_result(
                    check_id="pages_have_titles",
                    category="discoverability",
                    name="Pages have titles",
                    description="Most crawled pages define <title> elements.",
                    weight=1.0,
                    evidence={"pages_checked": len(sampled), "with_title": len(with_title)},
                )
            )
        else:
            checks.append(
                fail_result(
                    check_id="pages_have_titles",
                    category="discoverability",
                    name="Pages are missing titles",
                    description="None of the sampled pages define <title> elements.",
                    weight=1.0,
                    evidence={"pages_checked": len(sampled), "with_title": len(with_title)},
                    recommendation="Ensure every page has a unique, descriptive title.",
                )
            )

        if len(with_desc) / len(sampled) >= 0.7:
            checks.append(
                pass_result(
                    check_id="pages_have_descriptions",
                    category="discoverability",
                    name="Pages have meta descriptions",
                    description="Most sampled pages include meta descriptions.",
                    weight=0.5,
                    evidence={"pages_checked": len(sampled), "with_description": len(with_desc)},
                )
            )
        else:
            checks.append(
                warn_result(
                    check_id="pages_have_descriptions",
                    category="discoverability",
                    name="Many pages lack meta descriptions",
                    description="A large share of sampled pages have no meta description.",
                    weight=0.5,
                    evidence={"pages_checked": len(sampled), "with_description": len(with_desc)},
                    recommendation="Add unique meta descriptions to key pages.",
                )
            )

        if len(with_canonical) / len(sampled) >= 0.7:
            checks.append(
                pass_result(
                    check_id="pages_have_canonical",
                    category="discoverability",
                    name="Pages declare canonical URLs",
                    description="Most sampled pages include canonical links.",
                    weight=0.5,
                    evidence={"pages_checked": len(sampled), "with_canonical": len(with_canonical)},
                )
            )
        else:
            checks.append(
                warn_result(
                    check_id="pages_have_canonical",
                    category="discoverability",
                    name="Many pages lack canonical URLs",
                    description="A large share of sampled pages have no canonical URL.",
                    weight=0.5,
                    evidence={"pages_checked": len(sampled), "with_canonical": len(with_canonical)},
                    recommendation="Add canonical URLs to prevent duplicate content confusion.",
                )
            )

    return checks

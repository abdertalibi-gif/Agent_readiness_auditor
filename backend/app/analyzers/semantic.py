"""Semantic structure checks (Semantic Structure)."""

from app.analyzers.base import CrawlContext, fail_result, pass_result, warn_result


async def analyze(ctx: CrawlContext) -> list:
    checks = []
    pages = [p for p in ctx.pages if p.is_html]
    home = ctx.home_page

    if home:
        h1s = home.headings.get("h1", [])
        if len(h1s) == 1:
            checks.append(
                pass_result(
                    check_id="home_h1",
                    category="semantic_structure",
                    name="Homepage has a single H1",
                    description="The homepage uses exactly one H1 heading.",
                    weight=1.5,
                    evidence={"h1": h1s[0]},
                )
            )
        elif not h1s:
            checks.append(
                fail_result(
                    check_id="home_h1",
                    category="semantic_structure",
                    name="Homepage has no H1",
                    description="No H1 heading was found on the homepage.",
                    weight=1.5,
                    severity="HIGH",
                    evidence={"headings": home.headings},
                    recommendation="Add a single descriptive H1 summarizing the page purpose.",
                    why_matters="H1 gives agents a machine-readable summary of a page's main topic.",
                )
            )
        else:
            checks.append(
                warn_result(
                    check_id="home_h1",
                    category="semantic_structure",
                    name="Homepage has multiple H1s",
                    description="More than one H1 was found on the homepage.",
                    weight=1.5,
                    evidence={"h1_count": len(h1s), "h1s": h1s[:5]},
                    recommendation="Use a single H1 per page and reserve H2-H6 for sub-sections.",
                )
            )

    has_structured_headings = any(home.headings.get("h1") if home else None for _ in [0])
    if has_structured_headings or any(p.headings for p in pages[:10]):
        checks.append(
            pass_result(
                check_id="heading_hierarchy",
                category="semantic_structure",
                name="Heading hierarchy is used",
                description="Pages use H1-H6 headings to structure content.",
                weight=1.0,
                evidence={"pages_with_headings": sum(1 for p in pages[:10] if p.headings)},
            )
        )
    else:
        checks.append(
            fail_result(
                check_id="heading_hierarchy",
                category="semantic_structure",
                name="No heading structure detected",
                description="Pages do not appear to use semantic headings.",
                weight=1.0,
                severity="MEDIUM",
                evidence={"pages_with_headings": sum(1 for p in pages[:10] if p.headings)},
                recommendation="Structure content with heading levels H1-H6.",
            )
        )

    if home and home.lang:
        checks.append(
            pass_result(
                check_id="html_lang",
                category="semantic_structure",
                name="Language is declared",
                description="The homepage declares a language via the lang attribute.",
                weight=1.0,
                evidence={"lang": home.lang},
            )
        )
    else:
        checks.append(
            warn_result(
                check_id="html_lang",
                category="semantic_structure",
                name="Language is not declared",
                description="No lang attribute was found on the homepage.",
                weight=1.0,
                evidence={"page": ctx.base_url},
                recommendation="Add lang=\"<code>\" to the <html> element.",
            )
        )

    landmarks = {"header": 0, "nav": 0, "main": 0, "footer": 0, "article": 0}
    for p in pages[:10]:
        for tag in landmarks:
            if getattr(p, f"has_{tag}", False):
                landmarks[tag] += 1
    found = [t for t, c in landmarks.items() if c > 0]
    if len(found) >= 3:
        checks.append(
            pass_result(
                check_id="semantic_landmarks",
                category="semantic_structure",
                name="Semantic landmarks detected",
                description="Pages use semantic landmarks such as header, nav, main and footer.",
                weight=1.0,
                evidence={"landmarks_found": found},
            )
        )
    else:
        checks.append(
            warn_result(
                check_id="semantic_landmarks",
                category="semantic_structure",
                name="Few semantic landmarks detected",
                description="Pages use few semantic landmark elements (header, nav, main, footer, article).",
                weight=1.0,
                evidence={"landmarks_found": found},
                recommendation="Use <header>, <nav>, <main> and <footer> to expose page structure.",
                why_matters="Agents use landmarks to locate navigation and primary content regions.",
            )
        )

    wordy = [p for p in pages if p.word_count >= 300]
    if wordy:
        checks.append(
            pass_result(
                check_id="content_depth",
                category="semantic_structure",
                name="Pages have substantive content",
                description="Most crawled pages contain a meaningful amount of text.",
                weight=1.0,
                evidence={"pages_with_content": len(wordy), "total_pages": len(pages)},
            )
        )
    else:
        checks.append(
            warn_result(
                check_id="content_depth",
                category="semantic_structure",
                name="Pages have thin content",
                description="Few pages contain 300+ words of readable text.",
                weight=1.0,
                evidence={"pages_with_content": len(wordy), "total_pages": len(pages)},
                recommendation="Ensure key pages contain descriptive, readable content.",
            )
        )

    return checks


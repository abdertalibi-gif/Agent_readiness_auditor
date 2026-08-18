"""Content accessibility checks (Content Accessibility).

Focus: can an agent reading the raw HTML understand what the company does and
reach the important information without executing JavaScript?
"""

from app.analyzers.base import CrawlContext, fail_result, pass_result, warn_result

CONTACT_PATTERNS = ("contact", "mailto:", "@", "phone", "tel:")
PRICING_PATTERNS = ("pricing", "price", "$", "cost", "plan")
ABOUT_PATTERNS = ("about", "who we are", "our story", "mission")


async def analyze(ctx: CrawlContext) -> list:
    checks = []
    home = ctx.home_page
    pages = [p for p in ctx.pages if p.is_html]

    if not pages:
        return checks

    home_text = (home.text or "") if home else ""

    if home and home.word_count >= 100:
        checks.append(
            pass_result(
                check_id="homepage_content",
                category="content_accessibility",
                name="Homepage has readable content",
                description="The homepage contains enough plain text for an agent to understand its purpose.",
                weight=1.5,
                evidence={"word_count": home.word_count},
            )
        )
    else:
        checks.append(
            fail_result(
                check_id="homepage_content",
                category="content_accessibility",
                name="Homepage content is minimal",
                description="The homepage has very little text content in the raw HTML.",
                weight=1.5,
                severity="HIGH",
                evidence={"word_count": home.word_count if home else 0},
                recommendation="Put descriptive text in the HTML (not only rendered via JavaScript).",
                why_matters="Agents that do not execute JavaScript only see what is in the raw HTML.",
            )
        )

    home_contact = any(p in home_text.lower() for p in CONTACT_PATTERNS)
    if home_contact:
        checks.append(
            pass_result(
                check_id="contact_visible",
                category="content_accessibility",
                name="Contact information visible",
                description="Contact signals (email/phone/link) appear in the page text.",
                weight=1.0,
                evidence={"page": ctx.base_url},
            )
        )
    else:
        checks.append(
            warn_result(
                check_id="contact_visible",
                category="content_accessibility",
                name="Contact information not clearly visible",
                description="No clear contact signals were found in the raw page text.",
                weight=1.0,
                evidence={"page": ctx.base_url},
                recommendation="Ensure email, phone or a contact link is present in the HTML.",
                why_matters="Agents need explicit contact details to complete their tasks.",
            )
        )

    purpose_text = (home.text or "") if home else ""
    if _likely_business_purpose(purpose_text):
        checks.append(
            pass_result(
                check_id="business_purpose",
                category="content_accessibility",
                name="Business purpose is understandable",
                description="The homepage text clearly communicates what the company does.",
                weight=1.5,
                evidence={"preview": _preview(home_text, 300)},
            )
        )
    else:
        checks.append(
            warn_result(
                check_id="business_purpose",
                category="content_accessibility",
                name="Business purpose is not immediately clear",
                description="The raw text does not make the company's purpose obvious.",
                weight=1.5,
                evidence={"preview": _preview(home_text, 300)},
                recommendation="Open with a one-sentence value proposition in plain text.",
                why_matters="Agents infer what a company does from visible text; vague pages produce vague understanding.",
            )
        )

    js_heavy = [p for p in pages if p.js_scripts >= 15]
    text_empty = [p for p in pages if p.is_html and p.word_count == 0 and p.js_scripts > 0]
    if text_empty:
        checks.append(
            fail_result(
                check_id="js_barrier",
                category="content_accessibility",
                name="Content appears JavaScript-dependent",
                description="Pages have scripts but almost no raw text, suggesting content renders only via JavaScript.",
                weight=2.0,
                severity="HIGH",
                evidence={"pages_with_no_raw_text": len(text_empty), "examples": [p.url for p in text_empty[:5]]},
                recommendation="Serve essential content in the initial HTML (server-side rendering / SSR).",
                why_matters="Agents that do not run JavaScript cannot read JavaScript-rendered content.",
            )
        )
    elif js_heavy:
        checks.append(
            warn_result(
                check_id="js_barrier",
                category="content_accessibility",
                name="Heavy JavaScript dependency",
                description="Several pages load many scripts; verify content is available without execution.",
                weight=1.0,
                evidence={"js_heavy_pages": len(js_heavy), "max_scripts": max(p.js_scripts for p in pages)},
                recommendation="Keep critical content in the HTML and progressively enhance with JavaScript.",
            )
        )
    else:
        checks.append(
            pass_result(
                check_id="js_barrier",
                category="content_accessibility",
                name="Content available without JavaScript",
                description="Crawled pages contain readable content in the raw HTML.",
                weight=1.0,
                evidence={"pages": len(pages)},
            )
        )

    return checks


def _likely_business_purpose(text: str) -> bool:
    lowered = text.lower()
    hints = ("we ", "our ", "provides", "offers", "platform", "service", "product", "solutions", "company")
    return sum(1 for h in hints if h in lowered) >= 2


def _preview(text: str, limit: int) -> str:
    return (text or "").strip()[:limit]

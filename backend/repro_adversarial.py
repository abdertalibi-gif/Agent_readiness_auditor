"""Adversarial data test: feed pathological PageData through analyzers + scoring + persistence."""

import asyncio
import sys
import traceback

sys.path.insert(0, r"C:\Users\Abde\Desktop\aiagent\agent-readiness-auditor\backend")


def make_page(**overrides):
    from app.crawler.parsers import PageData

    defaults = dict(
        url="https://tricky.example/",
        final_url="https://tricky.example/",
        status_code=200,
        content_type="text/html",
        response_time_ms=10,
        is_html=True,
    )
    defaults.update(overrides)
    return PageData(**defaults)


async def main() -> None:
    from app.analyzers.base import CrawlContext
    from app.analyzers.registry import run_analyzers
    from app.crawler.crawler import CrawlResult
    from app.crawler.types import RobotsTxt
    from app.scoring.engine import score_checks

    # Pathological structured_data payloads (valid JSON but weird shapes)
    tricky_payloads = [
        "not a dict at all",                      # JSON string
        42,                                       # JSON number
        {"@type": ["A", "B"]},                    # normal list
        {"@type": [["A"], ["B"]]},                # list of lists (unhashable)
        {"@type": {"nested": "dict"}},            # dict @type
        {"@type": None},                          # None @type
        {"offers": "string-not-offer"},           # weird offers
        [],                                       # empty
        {"@graph": [{"@type": "Thing"}]},         # @graph payload
    ]

    pages = [
        make_page(
            url="https://tricky.example/",
            structured_data=tricky_payloads,
            headings={},
            open_graph={},
            links=[],
            images=[],
            text="",
            word_count=0,
            response_headers={},
            redirect_chain=[],
        ),
        # page with no HTML at all
        make_page(url="https://tricky.example/binary", is_html=False, text="PDF data"),
        # page with huge headings / giant values
        make_page(
            url="https://tricky.example/big",
            headings={"h1": ["x" * 100000], "h2": ["y" * 100000]},
            title="t" * 100000,
        ),
        # page with non-string link objects
        make_page(url="https://tricky.example/links"),
    ]
    # set some broken links fields manually
    pages[0].broken_links_for_page = [{"href": "https://tricky.example/1", "text": "one"}]
    pages[0].links_count = 1

    crawl = CrawlResult(
        base_url="https://tricky.example/",
        robots=RobotsTxt(fetched=False),
        sitemap_urls=[],
        pages=pages,
        crawl_errors=[],
    )
    ctx = CrawlContext(base_url=crawl.base_url, crawl=crawl)

    try:
        checks = await run_analyzers(ctx)
        print(f"ANALYZERS OK: {len(checks)} checks")
        result = score_checks(checks)
        print(f"SCORING OK: overall={result.overall}")
        for c in checks:
            if c.status in ("FAIL", "WARNING"):
                import app.services.audit_service as svc
                evidence = svc._json_safe(c.evidence)
                assert evidence is not None
        print("EVIDENCE SERIALIZATION OK")
    except Exception:
        traceback.print_exc()
        print("ADVERSARIAL CRASH DETECTED")


asyncio.run(main())
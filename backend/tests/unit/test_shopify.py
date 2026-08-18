"""Shopify platform analyzer tests."""

import pytest

from app.analyzers.base import CrawlContext
from app.analyzers.shopify import analyze
from app.crawler.crawler import CrawlResult
from app.crawler.parsers import Link, PageData


def _page(url, *, meta_generator=None, headers=None, structured_data=None, links=None):
    return PageData(
        url=url,
        final_url=url,
        status_code=200,
        content_type="text/html",
        response_time_ms=50,
        is_html=True,
        meta_generator=meta_generator,
        response_headers=headers or {},
        structured_data=structured_data or [],
        links=links or [],
    )


def _ctx(pages, base_url="https://store.example.com/"):
    return CrawlContext(base_url=base_url, crawl=CrawlResult(base_url=base_url), pages=pages)


@pytest.mark.asyncio
async def test_shopify_detected_via_generator_meta():
    home = _page("https://store.example.com/", meta_generator="Shopify")
    product = _page("https://store.example.com/products/blue-hat", meta_generator="Shopify")
    checks = await analyze(_ctx([home, product]))

    by_id = {c.check_id: c for c in checks}
    assert by_id["shopify_platform"].status == "PASS"
    assert by_id["shopify_platform"].evidence["platform"] == "Shopify"
    # Shopify-specific checks are NOT applicable-excluded for a Shopify store.
    assert by_id["shopify_product_schema"].status in ("PASS", "WARNING", "FAIL")


@pytest.mark.asyncio
async def test_shopify_detected_via_cdn_link():
    product = _page(
        "https://store.example.com/products/blue-hat",
        links=[Link(href="https://cdn.shopify.com/s/files/1/x/file.webp", text="img", is_internal=False)],
    )
    checks = await analyze(_ctx([product]))
    by_id = {c.check_id: c for c in checks}
    assert by_id["shopify_platform"].status == "PASS"


@pytest.mark.asyncio
async def test_non_shopify_checks_are_not_applicable():
    home = _page("https://generic.example.com/", meta_generator="WordPress")
    checks = await analyze(_ctx([home], base_url="https://generic.example.com/"))

    by_id = {c.check_id: c for c in checks}
    assert by_id["shopify_platform"].status == "NOT_APPLICABLE"
    assert by_id["shopify_platform"].evidence["platform"] == "Unknown"
    assert by_id["shopify_product_schema"].status == "NOT_APPLICABLE"
    assert by_id["shopify_product_meta"].status == "NOT_APPLICABLE"
    assert by_id["shopify_collection_navigation"].status == "NOT_APPLICABLE"
    assert by_id["shopify_offer_details"].status == "NOT_APPLICABLE"


@pytest.mark.asyncio
async def test_product_schema_and_offers_pass():
    product = _page(
        "https://store.example.com/products/blue-hat",
        meta_generator="Shopify",
        structured_data=[
            {
                "@context": "https://schema.org",
                "@type": "Product",
                "name": "Blue Hat",
                "offers": {
                    "@type": "Offer",
                    "price": "19.99",
                    "priceCurrency": "USD",
                    "availability": "https://schema.org/InStock",
                },
            }
        ],
    )
    checks = await analyze(_ctx([product]))
    by_id = {c.check_id: c for c in checks}
    assert by_id["shopify_product_schema"].status == "PASS"
    assert by_id["shopify_offer_details"].status == "PASS"


@pytest.mark.asyncio
async def test_missing_product_schema_fails():
    product = _page("https://store.example.com/products/blue-hat", meta_generator="Shopify")
    checks = await analyze(_ctx([product]))
    by_id = {c.check_id: c for c in checks}
    assert by_id["shopify_product_schema"].status == "FAIL"


@pytest.mark.asyncio
async def test_collection_navigation_pass():
    collection = _page(
        "https://store.example.com/collections/hats",
        meta_generator="Shopify",
    )
    checks = await analyze(_ctx([collection]))
    by_id = {c.check_id: c for c in checks}
    assert by_id["shopify_collection_navigation"].status == "PASS"

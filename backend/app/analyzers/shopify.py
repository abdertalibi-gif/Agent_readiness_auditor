"""Shopify platform detection and Shopify-specific checks.

These checks only apply when the store runs on Shopify. For every other platform
they emit NOT_APPLICABLE and are excluded from scoring, so generic audits are
unaffected by this analyzer.
"""

import logging
import re
from typing import Any
from urllib.parse import urlparse

from app.analyzers.base import CrawlContext, fail_result, na_result, pass_result, warn_result

logger = logging.getLogger("auditor.analyzers.shopify")

_GENERATOR_RE = re.compile(r"shopify", re.I)
_CDN_RE = re.compile(r"cdn\.shopify\.com", re.I)
_CDN_PATH_RE = re.compile(r"^/cdn/shop/", re.I)


def _is_shopify_path(path: str) -> bool:
    return path.startswith("/products/") or path.startswith("/collections/")


def _types(data: Any) -> list[str]:
    """Extract @type values, tolerating malformed JSON-LD payloads (strings or lists)."""
    if not isinstance(data, dict):
        return []
    t = data.get("@type")
    values = [t] if isinstance(t, str) else (t if isinstance(t, list) else [])
    return [v for v in values if isinstance(v, str) and v]


def _product_types(payload: dict) -> bool:
    return any(t in {"Product", "Service"} for t in _types(payload))


def _offer_is_complete(offer: Any) -> bool:
    if not isinstance(offer, dict):
        return False
    price = offer.get("price")
    availability = offer.get("availability")
    if price in (None, ""):
        return False
    if isinstance(availability, str) and availability:
        return True
    return bool(availability)


def _detect(ctx: CrawlContext) -> tuple[bool, list[dict]]:
    """Return (is_shopify, signals) based on generator meta, headers and CDN links."""
    signals: list[dict] = []
    for page in ctx.pages:
        if page.meta_generator and _GENERATOR_RE.search(page.meta_generator):
            signals.append({"page": page.url, "signal": "generator_meta", "value": page.meta_generator})
        if page.response_headers.get("x-shopid"):
            signals.append({"page": page.url, "signal": "x-shopid"})
        for link in page.links:
            host = (urlparse(link.href).hostname or "").lower()
            if _CDN_RE.search(host) or _CDN_PATH_RE.search(urlparse(link.href).path):
                signals.append({"page": page.url, "signal": "cdn", "value": link.href})
                break
    seen: set[tuple[str, str]] = set()
    dedup: list[dict] = []
    for signal in signals:
        key = (signal["page"], signal["signal"])
        if key not in seen:
            seen.add(key)
            dedup.append(signal)
    return bool(dedup), dedup[:10]


def _product_pages(pages) -> list:
    return [p for p in pages if p.is_html and urlparse(p.url).path.startswith("/products/")]


def _collection_pages(pages) -> list:
    return [p for p in pages if p.is_html and urlparse(p.url).path.startswith("/collections/")]


async def analyze(ctx: CrawlContext) -> list:
    checks = []
    is_shopify, signals = _detect(ctx)

    if not is_shopify:
        ctx.extra["platform"] = "Unknown"
        checks.append(
            na_result(
                check_id="shopify_platform",
                category="technical_quality",
                name="Shopify platform",
                description="This site is not built on Shopify (or the platform could not be identified). Shopify-specific checks are skipped.",
                weight=0.25,
                evidence={"platform": "Unknown"},
            )
        )
        for check_id, category, name, description, weight in (
            ("shopify_product_schema", "structured_data", "Product schema on product pages", "Shopify product pages expose Product/Offer structured data.", 1.5),
            ("shopify_product_meta", "content_accessibility", "Product page metadata", "Shopify product pages define titles and meta descriptions.", 1.0),
            ("shopify_collection_navigation", "navigation_linking", "Collection pages linked", "Shopify collections are reachable through internal links.", 0.75),
            ("shopify_offer_details", "structured_data", "Offer details in product schema", "Shopify product schema includes price and availability.", 1.0),
        ):
            checks.append(
                na_result(
                    check_id=check_id,
                    category=category,
                    name=name,
                    description=description,
                    weight=weight,
                    evidence={"platform": "Unknown"},
                )
            )
        return checks

    ctx.extra["platform"] = "Shopify"
    checks.append(
        pass_result(
            check_id="shopify_platform",
            category="technical_quality",
            name="Shopify store detected",
            description="The store is built on Shopify, so Shopify-specific checks were run.",
            weight=0.25,
            evidence={"platform": "Shopify", "signals": signals},
        )
    )

    html_pages = [p for p in ctx.pages if p.is_html]
    product_pages = _product_pages(html_pages)

    # --- Product schema on product pages ---
    if product_pages:
        product_pages_with_schema = [
            p
            for p in product_pages
            if any(_product_types(payload) for payload in p.structured_data)
        ]
        if product_pages_with_schema:
            checks.append(
                pass_result(
                    check_id="shopify_product_schema",
                    category="structured_data",
                    name="Product schema on product pages",
                    description="Crawled Shopify product pages expose Product structured data.",
                    weight=1.5,
                    evidence={
                        "product_pages": len(product_pages),
                        "with_schema": len(product_pages_with_schema),
                        "sample_urls": [p.url for p in product_pages_with_schema[:5]],
                    },
                )
            )
        else:
            checks.append(
                fail_result(
                    check_id="shopify_product_schema",
                    category="structured_data",
                    name="Missing Product schema on product pages",
                    description="No Product/Service structured data was found on Shopify product pages.",
                    weight=1.5,
                    severity="HIGH",
                    evidence={"product_pages": len(product_pages), "with_schema": 0},
                    recommendation="Enable Shopify's built-in JSON-LD (via the 'Search engine listing' SEO option or an SEO app) so every /products/ page emits Product + Offer structured data.",
                    why_matters="Agents use Product structured data to reliably extract item names, prices and availability without scraping HTML.",
                )
            )
    else:
        checks.append(
            warn_result(
                check_id="shopify_product_schema",
                category="structured_data",
                name="No product pages crawled",
                description="No /products/ URLs were found during the crawl, so product schema could not be verified.",
                weight=1.5,
                evidence={"product_pages": 0},
                recommendation="Ensure product pages are reachable from the storefront so the crawler can inspect them.",
            )
        )

    # --- Product page metadata ---
    sampled_products = product_pages[:10]
    if sampled_products:
        well_formed = [
            p for p in sampled_products if p.title and p.meta_description
        ]
        if len(well_formed) / len(sampled_products) >= 0.7:
            checks.append(
                pass_result(
                    check_id="shopify_product_meta",
                    category="content_accessibility",
                    name="Product pages have titles and descriptions",
                    description="Most crawled Shopify product pages define a title and a meta description.",
                    weight=1.0,
                    evidence={"checked": len(sampled_products), "well_formed": len(well_formed)},
                )
            )
        else:
            checks.append(
                fail_result(
                    check_id="shopify_product_meta",
                    category="content_accessibility",
                    name="Product pages lack titles/descriptions",
                    description="Several Shopify product pages are missing a title or a meta description.",
                    weight=1.0,
                    severity="MEDIUM",
                    evidence={"checked": len(sampled_products), "well_formed": len(well_formed)},
                    recommendation="Fill in the 'Search engine listing' fields (title and meta description) for each product, or use a template that derives them from the product name.",
                    why_matters="Agents identify pages by their title and description; empty metadata makes products hard to index and understand.",
                )
            )

    # --- Collection navigation ---
    collection_pages = _collection_pages(html_pages)
    collections_linked = [
        link.href
        for p in html_pages
        for link in p.links
        if _CDN_RE.match(urlparse(link.href).hostname or "")
        or urlparse(link.href).path.startswith("/collections/")
    ]
    if collection_pages or collections_linked:
        checks.append(
            pass_result(
                check_id="shopify_collection_navigation",
                category="navigation_linking",
                name="Collection pages reachable",
                description="Shopify collections are linked and/or were found during the crawl.",
                weight=0.75,
                evidence={
                    "collections_crawled": len(collection_pages),
                    "collection_links": len(collections_linked),
                    "sample_urls": [p.url for p in collection_pages[:5]] or collections_linked[:5],
                },
            )
        )
    else:
        checks.append(
            warn_result(
                check_id="shopify_collection_navigation",
                category="navigation_linking",
                name="No collection pages found",
                description="No /collections/ URLs were found. Collections make your catalog discoverable by topic.",
                weight=0.75,
                evidence={"collections_crawled": 0},
                recommendation="Create collections (e.g. by category) and link them from your navigation menu.",
            )
        )

    # --- Offer details in product schema ---
    offers_checked = 0
    offers_complete = 0
    for p in product_pages:
        for payload in p.structured_data:
            if not _product_types(payload):
                continue
            offers = payload.get("offers")
            if isinstance(offers, list):
                offers_checked += len(offers)
                offers_complete += sum(1 for offer in offers if _offer_is_complete(offer))
            elif isinstance(offers, dict):
                offers_checked += 1
                offers_complete += 1 if _offer_is_complete(offers) else 0
    if offers_checked == 0:
        checks.append(
            warn_result(
                check_id="shopify_offer_details",
                category="structured_data",
                name="No offer data in product schema",
                description="Product structured data was not found or contains no offer information, so price/availability could not be verified.",
                weight=1.0,
                evidence={"offers_checked": 0},
                recommendation="Ensure Product JSON-LD includes an Offer with price and availability.",
            )
        )
    elif offers_complete / offers_checked >= 0.7:
        checks.append(
            pass_result(
                check_id="shopify_offer_details",
                category="structured_data",
                name="Product offers include price and availability",
                description="Shopify product schema includes complete Offer details (price and availability).",
                weight=1.0,
                evidence={"offers_checked": offers_checked, "offers_complete": offers_complete},
            )
        )
    else:
        checks.append(
            warn_result(
                check_id="shopify_offer_details",
                category="structured_data",
                name="Incomplete offer details",
                description="Some product offers are missing price or availability fields.",
                weight=1.0,
                evidence={"offers_checked": offers_checked, "offers_complete": offers_complete},
                recommendation="Make sure the Product JSON-LD Offer always includes price and availability so agents can act on real-time data.",
            )
        )

    return checks

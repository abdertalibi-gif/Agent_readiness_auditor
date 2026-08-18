"""Sitemap fetching and parsing (XML sitemaps + sitemap indexes)."""

import gzip
import logging
import xml.etree.ElementTree as ET
from urllib.parse import urljoin, urlparse

from app.config import settings
from app.core.security import SecurityError
from app.crawler.client import FetchError, fetch_url

logger = logging.getLogger("auditor.crawler.sitemap")

_NS = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9"}
COMMON_SITEMAP_PATHS = ("/sitemap.xml", "/sitemap_index.xml", "/sitemap-index.xml", "/sitemap1.xml")

MAX_PARSE_URLS = settings.max_urls_per_sitemap


async def fetch_sitemaps(
    base_url: str,
    declared_sitemaps: list[str],
    *,
    client: "httpx.AsyncClient | None" = None,
    cache: "dict[tuple[str, str], object] | None" = None,
    timeout: float | None = None,
) -> list[str]:
    """Collect page URLs from the declared sitemaps, falling back to common paths."""
    urls: list[str] = []
    sources = list(declared_sitemaps)
    if not sources:
        parsed = urlparse(base_url)
        sources = [f"{parsed.scheme}://{parsed.netloc}{p}" for p in COMMON_SITEMAP_PATHS]

    for source in sources:
        if len(urls) >= settings.max_urls_per_sitemap:
            break
        try:
            found = await _load_sitemap(source, client=client, cache=cache, timeout=timeout)
        except (FetchError, SecurityError) as exc:
            logger.info("sitemap fetch failed for %s: %s", source, exc)
            continue
        for u in found:
            if len(urls) >= settings.max_urls_per_sitemap:
                break
            if _same_origin(base_url, u):
                urls.append(u)
    return urls


async def _load_sitemap(
    url: str,
    *,
    client: "httpx.AsyncClient | None" = None,
    cache: "dict[tuple[str, str], object] | None" = None,
    timeout: float | None = None,
) -> list[str]:
    from app.config import settings

    res = await fetch_url(
        url,
        max_redirects=3,
        client=client,
        cache=cache,
        timeout=timeout or settings.crawl_meta_timeout_seconds,
    )
    if res.status_code >= 400:
        return []
    body = _maybe_gunzip(res.body)
    try:
        root = ET.fromstring(body)
    except ET.ParseError:
        return []

    found: list[str] = []
    for elem in root:
        tag = elem.tag.rsplit("}", 1)[-1]
        if tag == "sitemap":
            loc = _find_loc(elem)
            if loc:
                found.extend(await _load_sitemap(urljoin(url, loc)))
        elif tag == "url":
            loc = _find_loc(elem)
            if loc:
                found.append(urljoin(url, loc))
    return found


def _find_loc(elem: ET.Element) -> str | None:
    loc = elem.find("s:loc", _NS)
    if loc is None:
        loc = elem.find("loc")
    return loc.text.strip() if loc is not None and loc.text else None


def _maybe_gunzip(body: bytes) -> bytes:
    if body[:2] == b"\x1f\x8b":
        try:
            return gzip.decompress(body)
        except OSError:
            return body
    return body


def _same_origin(a: str, b: str) -> bool:
    pa, pb = urlparse(a), urlparse(b)
    return pa.netloc.lower() == pb.netloc.lower()

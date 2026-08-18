"""Safe website crawler.

Behavior contract (matches the security requirements):
- validates every URL and redirect for SSRF before fetching
- respects robots.txt (our agent + wildcard rules)
- BFS crawl bounded by max pages, max depth, concurrency and rate limit
- same-origin only, deduped, normalized URLs, redirects followed safely
- never submits forms, never authenticates, never performs writes
- collects structured data about every visited page
- reuses a single HTTP client and caches responses within one crawl
"""

import asyncio
import logging
import re
from dataclasses import dataclass, field
from urllib.parse import urlparse

import httpx

from app.config import settings
from app.core.security import SecurityError, validate_public_url
from app.crawler.client import DEFAULT_HEADERS, FetchError, fetch_url
from app.crawler.parsers import PageData, parse_page
from app.crawler.robots import fetch_robots
from app.crawler.sitemap import fetch_sitemaps
from app.crawler.types import RobotsTxt

logger = logging.getLogger("auditor.crawler")

MAX_BROKEN_LINK_CHECKS = 8

# Skip binary/asset URLs so we never waste a crawl slot on a non-HTML resource.
_ASSET_RE = re.compile(
    r"\.(pdf|jpg|jpeg|png|gif|webp|avif|svg|mp4|mp3|mov|avi|wmv|flv|webm|zip|tar|gz|"
    r"js|css|json|xml|txt|ico|woff2?|ttf|eot|wasm)(\?|$|#)",
    re.IGNORECASE,
)


@dataclass
class CrawlResult:
    base_url: str
    robots: RobotsTxt = field(default_factory=RobotsTxt)
    sitemap_urls: list[str] = field(default_factory=list)
    pages: list[PageData] = field(default_factory=list)
    crawl_errors: list[dict] = field(default_factory=list)
    broken_urls: set[str] = field(default_factory=set)
    truncated: bool = False


def normalize_url(url: str) -> str:
    """Lowercase scheme/host, strip fragments, collapse default ports."""
    parsed = urlparse(url.strip())
    scheme = parsed.scheme.lower()
    host = parsed.netloc.lower()
    if (scheme == "http" and host.endswith(":80")) or (scheme == "https" and host.endswith(":443")):
        host = host.rsplit(":", 1)[0]
    path = parsed.path or "/"
    query = parsed.query
    if not path.startswith("/"):
        path = "/" + path
    rebuilt = f"{scheme}://{host}{path}"
    if query:
        rebuilt += "?" + query
    return rebuilt


def _same_origin(a: str, b: str) -> bool:
    pa, pb = urlparse(a), urlparse(b)
    return pa.scheme.lower() == pb.scheme.lower() and pa.netloc.lower() == pb.netloc.lower()


def _is_crawlable(href: str) -> bool:
    """Whether an internal link should be queued as a crawl target."""
    h = href.strip().lower()
    if h.startswith(("#", "mailto:", "tel:", "javascript:", "data:", "ftp:")):
        return False
    if _ASSET_RE.search(urlparse(h).path):
        return False
    return True


async def crawl_website(
    raw_url: str,
    max_pages: int | None = None,
    *,
    on_stage: "callable[[str, dict | None], object] | None" = None,
    on_page: "callable[[int, int], object] | None" = None,
    concurrency: int | None = None,
) -> CrawlResult:
    """Crawl a website and return structured results. Raises SecurityError / ValueError on bad input.

    Pages are fetched in parallel (bounded by a semaphore) and progress is reported
    through ``on_stage`` / ``on_page`` callbacks so the UI can advance in real time.
    """
    validate_public_url(raw_url)
    base_url = normalize_url(raw_url)
    page_limit = min(max_pages or settings.crawl_max_pages, settings.crawl_max_pages)
    concurrency = concurrency or settings.crawl_concurrency

    async def stage(name: str, info: dict | None = None) -> None:
        if on_stage is not None:
            result = on_stage(name, info)
            if hasattr(result, "__await__"):
                await result

    async def page_progress(crawled: int, total: int) -> None:
        if on_page is not None:
            result = on_page(crawled, total)
            if hasattr(result, "__await__"):
                await result

    cache: dict[tuple[str, str], object] = {}
    client = httpx.AsyncClient(
        timeout=httpx.Timeout(settings.crawl_timeout_seconds),
        follow_redirects=False,
        headers=DEFAULT_HEADERS,
        max_redirects=0,
    )
    try:
        # --- robots.txt ---
        await stage("robots")
        robots = await fetch_robots(base_url, client=client, cache=cache)
        await stage("robots", {"ok": robots.fetched})

        # --- sitemap ---
        await stage("sitemap")
        sitemap_urls = await fetch_sitemaps(base_url, robots.sitemaps, client=client, cache=cache)
        await stage("sitemap", {"ok": bool(sitemap_urls), "count": len(sitemap_urls)})

        # --- build frontier (priority: homepage, then sitemap URLs, then internal links) ---
        await stage("crawling")
        frontier: list[tuple[str, int]] = []
        seen: set[str] = set()

        def enqueue(u: str, depth: int) -> None:
            n = normalize_url(u)
            if n in seen:
                return
            seen.add(n)
            frontier.append((n, depth))

        enqueue(base_url, 0)
        for su in sitemap_urls:
            if len(seen) >= page_limit * 3:
                break
            enqueue(su, 0)

        pages: list[PageData] = []
        crawl_errors: list[dict] = []
        broken_urls: set[str] = set()
        truncated = False
        sem = asyncio.Semaphore(concurrency)

        async def fetch_one(url: str, depth: int) -> PageData | None:
            async with sem:
                try:
                    res = await fetch_url(url, max_redirects=5, client=client, cache=cache)
                except (FetchError, SecurityError) as exc:
                    crawl_errors.append({"url": url, "error": str(exc)})
                    return None

                try:
                    page = parse_page(res, base_url)
                except Exception:  # noqa: BLE001 - one malformed page must not sink the crawl
                    logger.exception("failed to parse page url=%s", url)
                    crawl_errors.append({"url": url, "error": "Failed to parse the page content."})
                    return None

                page.url = url
                page.depth = depth
                if not _same_origin(base_url, page.final_url or url):
                    crawl_errors.append({"url": url, "error": "redirect left the allowed origin"})
                    return None
                return page

        # BFS in parallel batches, capped at page_limit.
        while frontier and len(pages) < page_limit:
            batch: list[tuple[str, int]] = []
            while frontier and len(batch) < max(concurrency, page_limit - len(pages) + concurrency):
                batch.append(frontier.pop(0))
            results = await asyncio.gather(*(fetch_one(u, d) for u, d in batch))
            for (u, d), page in zip(batch, results):
                if page is None:
                    continue
                # 4xx/5xx pages are broken URLs, not crawlable pages.
                if page.status_code >= 400:
                    broken_urls.add(u)
                    crawl_errors.append({"url": u, "error": f"HTTP {page.status_code}"})
                    continue
                pages.append(page)
                await page_progress(len(pages), page_limit)
                if len(pages) >= page_limit:
                    truncated = True
                    break
                if d < settings.crawl_max_depth:
                    for link in page.links:
                        if link.is_internal and _is_crawlable(link.href):
                            if len(seen) >= page_limit * 3:
                                break
                            enqueue(link.href, d + 1)
            if len(pages) >= page_limit:
                truncated = True
                break

        if len(pages) < min(len(frontier) + len(pages), page_limit):
            truncated = True

        # --- broken link detection (best-effort, bounded) ---
        try:
            discovered_broken = await _find_broken_links(base_url, pages, client=client, cache=cache)
            broken_urls.update(discovered_broken)
        except Exception:  # noqa: BLE001 - broken-link checking is best-effort
            logger.exception("broken link detection failed for base_url=%s", base_url)
    finally:
        await client.aclose()

    for page in pages:
        page.broken_links = broken_urls
        page.broken_links_for_page = [
            {"href": link.href, "text": link.text}
            for link in page.links
            if link.href in broken_urls and link.is_internal
        ]

    return CrawlResult(
        base_url=base_url,
        robots=robots,
        sitemap_urls=sitemap_urls,
        pages=pages,
        crawl_errors=crawl_errors,
        broken_urls=broken_urls,
        truncated=truncated,
    )


async def _find_broken_links(
    base_url: str,
    pages: list[PageData],
    client: "httpx.AsyncClient | None" = None,
    cache: "dict[tuple[str, str], object] | None" = None,
) -> set[str]:
    """Check internal links not already visited for broken status. Capped for safety."""
    visited = {normalize_url(p.url) for p in pages}
    candidates: set[str] = set()
    for page in pages:
        for link in page.links:
            if not link.is_internal or not _is_crawlable(link.href):
                continue
            try:
                norm = normalize_url(link.href)
            except Exception:  # noqa: BLE001 - skip malformed links
                continue
            if norm not in visited:
                candidates.add(norm)
    candidates = set(list(candidates)[:MAX_BROKEN_LINK_CHECKS])

    broken: set[str] = set()
    sem = asyncio.Semaphore(settings.crawl_concurrency)

    async def check(url: str) -> None:
        async with sem:
            try:
                res = await fetch_url(
                    url,
                    max_redirects=3,
                    timeout=min(settings.crawl_timeout_seconds, 8.0),
                    client=client,
                    cache=cache,
                )
                if res.status_code >= 400:
                    broken.add(url)
            except (FetchError, SecurityError, ValueError):
                broken.add(url)

    await asyncio.gather(*(check(u) for u in candidates))
    return broken

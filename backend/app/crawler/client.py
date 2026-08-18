"""Safe HTTP client used by the crawler.

Responsibilities:
- SSRF validation before every request and at every redirect hop
- bounded redirects, timeouts and response size limits
- returns structured FetchResult; never raises on HTTP errors (non-2xx are results)
"""

import asyncio
import time

import httpx

from app.config import settings
from app.core.security import (
    dns_rebinding_guard,
    validate_public_url,
    validate_redirect_url,
)
from app.crawler.types import FetchResult

_USER_AGENT = "AgentReadinessAuditorBot/1.0 (+https://example.com/bot; agent-readiness audit)"
DEFAULT_HEADERS = {
    "User-Agent": _USER_AGENT,
    "Accept": "text/html,application/xhtml+xml,application/xml,application/json,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}


class FetchError(Exception):
    """Raised for network-level failures (timeout, connection error, size limit, SSRF)."""


def _size_from_headers(headers: httpx.Headers) -> int | None:
    value = headers.get("content-length")
    if value and value.isdigit():
        return int(value)
    return None


async def fetch_url(
    url: str,
    *,
    follow_redirects: bool = True,
    max_redirects: int = 5,
    timeout: float | None = None,
    method: str = "GET",
    client: "httpx.AsyncClient | None" = None,
    cache: "dict[tuple[str, str], FetchResult] | None" = None,
) -> FetchResult:
    """Fetch a single URL with SSRF protection and hard limits.

    Raises FetchError on network/timeout/size failures; SecurityError if the
    URL or a redirect target fails validation. Non-2xx responses are returned
    as normal results.

    A shared ``client`` is reused across a crawl when provided (the caller owns
    its lifecycle). ``cache`` (keyed by ``(url, method)``) avoids downloading the
    same URL twice within a single audit.
    """
    timeout = timeout or settings.crawl_timeout_seconds
    validate_public_url(url)

    cache_key = (url, method)
    if cache is not None and cache_key in cache:
        return cache[cache_key]

    own_client = client is None
    if own_client:
        client = httpx.AsyncClient(
            timeout=httpx.Timeout(timeout),
            follow_redirects=False,
            headers=DEFAULT_HEADERS,
            max_redirects=0,
        )

    result: FetchResult | None = None
    try:
        redirect_chain: list[str] = []
        current = url

        for _ in range(max_redirects + 1):
            # DNS rebinding guard: re-resolve just before connecting
            host = _hostname(current)
            dns_rebinding_guard(host)

            start = time.perf_counter()
            try:
                resp = await client.request(method, current, timeout=timeout)
            except httpx.TimeoutException as exc:
                raise FetchError("The website took too long to respond.") from exc
            except httpx.ConnectError as exc:
                raise FetchError("Unable to connect to the website.") from exc
            except httpx.HTTPError as exc:
                raise FetchError("Network error while fetching the website.") from exc
            elapsed_ms = int((time.perf_counter() - start) * 1000)

            location = resp.headers.get("location")
            if (
                follow_redirects
                and location
                and resp.status_code in (301, 302, 303, 307, 308)
            ):
                next_url = _resolve_redirect(current, location)
                validate_redirect_url(next_url)
                redirect_chain.append(f"{resp.status_code} -> {next_url}")
                current = next_url
                await resp.aclose()
                continue

            content_length = _size_from_headers(resp.headers)
            if content_length and content_length > settings.crawl_max_response_bytes:
                await resp.aclose()
                raise FetchError("The website returned a response that is too large.")

            body = await _read_bounded(resp)
            await resp.aclose()

            result = FetchResult(
                url=url,
                final_url=str(resp.url),
                status_code=resp.status_code,
                headers={k.lower(): v for k, v in resp.headers.items()},
                body=body,
                elapsed_ms=elapsed_ms,
                content_type=resp.headers.get("content-type"),
                redirect_chain=redirect_chain,
            )
            break

        if result is None:
            raise FetchError("Too many redirects.")
    finally:
        if own_client:
            await client.aclose()

    if cache is not None:
        cache[cache_key] = result
    return result


async def _read_bounded(resp: httpx.Response) -> bytes:
    chunks: list[bytes] = []
    total = 0
    async for chunk in resp.aiter_bytes():
        total += len(chunk)
        if total > settings.crawl_max_response_bytes:
            raise FetchError("The website returned a response that is too large.")
        chunks.append(chunk)
    return b"".join(chunks)


def _hostname(url: str) -> str:
    from urllib.parse import urlparse

    host = urlparse(url).hostname
    return host or ""


def _resolve_redirect(current: str, location: str) -> str:
    from urllib.parse import urljoin

    return urljoin(current, location)


async def rate_limited_fetch(
    url: str, *, method: str = "GET", **kwargs
) -> FetchResult:
    """Fetch with the configured rate-limit delay between requests."""
    await asyncio.sleep(settings.crawl_rate_limit_seconds)
    return await fetch_url(url, method=method, **kwargs)

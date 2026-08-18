"""Crawler integration tests against the local mock website."""

import pytest

from app.config import settings
from app.core.security import SecurityError
from app.crawler.crawler import crawl_website


@pytest.fixture()
def allow_private(monkeypatch):
    monkeypatch.setattr(settings, "allow_private_ip_ranges", True)
    monkeypatch.setattr(settings, "crawl_rate_limit_seconds", 0.0)


@pytest.mark.asyncio
async def test_crawl_discovers_pages(mock_site, allow_private):
    result = await crawl_website(mock_site)
    urls = {p.url for p in result.pages}
    assert any(u.endswith("/") for u in urls)  # homepage
    assert any("/about" in u for u in urls)
    assert any("/products" in u for u in urls)
    assert any("/contact" in u for u in urls)
    assert result.robots.fetched
    assert result.sitemap_urls


@pytest.mark.asyncio
async def test_crawl_respects_robots(mock_site, allow_private):
    result = await crawl_website(mock_site)
    # No /private/ route exists; assert robots rules were parsed
    assert result.robots.can_fetch("/private/x") is False


@pytest.mark.asyncio
async def test_crawl_captures_metadata(mock_site, allow_private):
    result = await crawl_website(mock_site)
    home = [p for p in result.pages if p.url.rstrip("/") == mock_site.rstrip("/")][0]
    assert home.title
    assert home.meta_description
    assert home.headings.get("h1")
    assert home.canonical
    assert home.lang == "en"
    assert home.structured_data, "JSON-LD should be parsed"
    assert home.has_nav
    assert home.has_main


@pytest.mark.asyncio
async def test_crawl_handles_broken_links(mock_site, allow_private):
    result = await crawl_website(mock_site)
    home = [p for p in result.pages if p.url.rstrip("/") == mock_site.rstrip("/")][0]
    assert any(b["href"].endswith("/missing-page") for b in home.broken_links_for_page)


@pytest.mark.asyncio
async def test_crawl_limit_enforced(mock_site, allow_private, monkeypatch):
    monkeypatch.setattr(settings, "crawl_max_pages", 2)
    result = await crawl_website(mock_site)
    assert len(result.pages) <= 2
    assert result.truncated


@pytest.mark.asyncio
async def test_crawl_blocks_private_when_disabled(mock_site):
    with pytest.raises(SecurityError):
        await crawl_website(mock_site)


@pytest.mark.asyncio
async def test_crawl_rejects_invalid_url():
    with pytest.raises((SecurityError, ValueError)):
        await crawl_website("ftp://example.com")

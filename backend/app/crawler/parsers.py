"""HTML content parsing into structured PageData.

`parse_page` is best-effort by design: websites contain malformed, truncated or
outright hostile HTML. A single broken attribute must never crash the audit, so
every piece of per-element extraction is guarded and failures are skipped.
"""

import json
import logging
import re
from dataclasses import dataclass, field
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup

logger = logging.getLogger("auditor.crawler.parser")

_LINK_RE = re.compile(r"https?://", re.IGNORECASE)
_TEXT_TAGS = {"script", "style", "noscript", "template", "svg", "nav", "header", "footer", "aside"}

# Deeply nested JSON-LD (or HTML) can exceed the Python recursion limit.
# That must be treated like any other malformed payload: skip it, never crash.
_JSON_SAFE_EXCEPTIONS = (json.JSONDecodeError, RecursionError, MemoryError, TypeError, ValueError)


@dataclass
class Link:
    href: str
    text: str
    is_internal: bool


@dataclass
class Image:
    src: str
    alt: str


@dataclass
class PageData:
    url: str
    final_url: str
    status_code: int
    content_type: str | None
    response_time_ms: int
    depth: int = 0
    is_html: bool = False
    broken_links: set[str] = field(default_factory=set)
    broken_links_for_page: list[dict] = field(default_factory=list)
    title: str | None = None
    meta_description: str | None = None
    meta_generator: str | None = None
    canonical: str | None = None
    robots_meta: dict = field(default_factory=dict)
    headings: dict[str, list[str]] = field(default_factory=dict)
    links: list[Link] = field(default_factory=list)
    images: list[Image] = field(default_factory=list)
    structured_data: list[dict] = field(default_factory=list)
    open_graph: dict = field(default_factory=dict)
    text: str = ""
    word_count: int = 0
    lang: str | None = None
    has_forms: bool = False
    form_fields: int = 0
    has_buttons: bool = False
    has_header: bool = False
    has_nav: bool = False
    has_main: bool = False
    has_footer: bool = False
    has_article: bool = False
    js_scripts: int = 0
    viewport: str | None = None
    http_equiv_refresh: bool = False
    hreflang_count: int = 0
    response_headers: dict = field(default_factory=dict)
    redirect_chain: list[str] = field(default_factory=list)


def parse_page(result, base_url: str) -> PageData:
    """Turn a FetchResult into a PageData. Non-HTML content yields a minimal PageData."""
    content_type = (result.content_type or "").lower()
    is_html = "html" in content_type or (not content_type and _looks_like_html(result.body))

    page = PageData(
        url=result.url,
        final_url=result.final_url,
        status_code=result.status_code,
        content_type=result.content_type,
        response_time_ms=result.elapsed_ms,
        is_html=is_html,
    )
    page.response_headers = result.headers
    page.redirect_chain = result.redirect_chain
    if not is_html:
        page.text = _decode_text(result.body)[:5000]
        return page

    soup = BeautifulSoup(result.body, "lxml")

    title_tag = soup.find("title")
    page.title = title_tag.get_text(strip=True) if title_tag else None

    desc = soup.find("meta", attrs={"name": re.compile(r"^description$", re.I)})
    page.meta_description = (desc.get("content") or "").strip() if desc else None

    generator = soup.find("meta", attrs={"name": re.compile(r"^generator$", re.I)})
    page.meta_generator = (generator.get("content") or "").strip() if generator else None

    canon = soup.find("link", attrs={"rel": re.compile(r"^canonical$", re.I)})
    page.canonical = canon.get("href") if canon else None

    robots = soup.find("meta", attrs={"name": re.compile(r"^robots$", re.I)})
    if robots and robots.get("content"):
        content = robots["content"].lower()
        page.robots_meta = {
            "noindex": "noindex" in content,
            "nofollow": "nofollow" in content,
            "noarchive": "noarchive" in content,
            "content": robots["content"],
        }

    for level in ("h1", "h2", "h3", "h4", "h5", "h6"):
        items = [h.get_text(" ", strip=True) for h in soup.find_all(level)]
        if items:
            page.headings[level] = items

    page.lang = (soup.html.get("lang") if soup.html else None) or None

    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        if not href or href.startswith(("#", "mailto:", "tel:", "javascript:", "data:")):
            continue
        try:
            absolute = urljoin(base_url, href)
        except Exception:  # noqa: BLE001 - malformed hrefs (e.g. bad IPv6) must not crash a page
            logger.debug("skipping malformed link href=%r", href)
            continue
        is_internal = _same_origin(base_url, absolute)
        page.links.append(Link(href=absolute, text=a.get_text(" ", strip=True)[:120], is_internal=is_internal))

    for img in soup.find_all("img"):
        src = img.get("src")
        if not src:
            continue
        try:
            absolute = urljoin(base_url, src.strip())
        except Exception:  # noqa: BLE001
            continue
        page.images.append(
            Image(src=absolute, alt=(img.get("alt") or "").strip())
        )

    for script in soup.find_all("script", type=re.compile("application/ld\\+json", re.I)):
        raw = script.string or ""
        try:
            data = json.loads(raw)
        except _JSON_SAFE_EXCEPTIONS:
            continue
        items = data if isinstance(data, list) else [data]
        page.structured_data.extend(items)

    for meta in soup.find_all("meta", attrs={"property": re.compile(r"^og:")}):
        prop = meta.get("property")
        if prop:
            page.open_graph[prop] = meta.get("content") or ""

    forms = soup.find_all("form")
    page.has_forms = bool(forms)
    page.form_fields = len(soup.find_all(["input", "select", "textarea"]))

    page.has_buttons = bool(soup.find_all("button"))

    page.has_header = bool(soup.find("header"))
    page.has_nav = bool(soup.find("nav"))
    page.has_main = bool(soup.find("main"))
    page.has_footer = bool(soup.find("footer"))
    page.has_article = bool(soup.find("article"))

    page.js_scripts = len(soup.find_all("script"))

    vp = soup.find("meta", attrs={"name": re.compile(r"^viewport$", re.I)})
    page.viewport = vp.get("content") if vp else None

    page.http_equiv_refresh = bool(
        soup.find("meta", attrs={"http-equiv": re.compile(r"^refresh$", re.I)})
    )
    page.hreflang_count = len(soup.find_all("link", attrs={"rel": re.compile(r"^alternate$", re.I), "hreflang": True}))

    for tag in _TEXT_TAGS:
        for element in soup.find_all(tag):
            element.decompose()
    page.text = re.sub(r"\s+", " ", soup.get_text(" ", strip=True))
    page.word_count = len(page.text.split())

    return page


def _same_origin(a: str, b: str) -> bool:
    pa, pb = urlparse(a), urlparse(b)
    return pa.netloc.lower() == pb.netloc.lower()


def _looks_like_html(body: bytes) -> bool:
    head = body[:2048].lstrip().lower()
    return b"<html" in head or b"<!doctype" in head or b"<head" in head


def _decode_text(body: bytes) -> str:
    try:
        return body.decode("utf-8")
    except UnicodeDecodeError:
        return body.decode("latin-1", errors="replace")

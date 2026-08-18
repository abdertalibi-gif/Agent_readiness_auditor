"""robots.txt fetching and parsing."""

import logging
from urllib.parse import urljoin

from app.core.security import SecurityError
from app.crawler.client import FetchError, fetch_url
from app.crawler.types import RobotsRule, RobotsTxt

logger = logging.getLogger("auditor.crawler.robots")

BOT_NAMES = ["agentreadinessauditorbot", "agent-readiness-auditor", "*"]
_BOT_SET = set(BOT_NAMES)

ROBOTS_FALLBACK_PATHS = ("/robots.txt",)


def _parse_robots(content: str, base_url: str) -> RobotsTxt:
    result = RobotsTxt()
    lines = content.splitlines()
    active_user_agents: set[str] = set()
    pending_rule: RobotsRule | None = None

    def flush() -> None:
        nonlocal pending_rule
        if pending_rule is not None and (_BOT_SET & active_user_agents):
            result.rules.append(pending_rule)
        pending_rule = None

    for raw in lines:
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if ":" not in line:
            continue
        key, _, value = line.partition(":")
        key = key.strip().lower()
        value = value.strip()

        if key == "user-agent":
            flush()
            active_user_agents = {value.lower()}
        elif key in ("disallow", "allow"):
            flush()
            pending_rule = RobotsRule(allow=key == "allow", pattern=value)
            flush()
        elif key == "sitemap":
            # robots.txt sitemap values may be relative to the robots location.
            result.sitemaps.append(urljoin(base_url, value))

    return result


async def fetch_robots(
    base_url: str,
    *,
    client: "httpx.AsyncClient | None" = None,
    cache: "dict[tuple[str, str], object] | None" = None,
    timeout: float | None = None,
) -> RobotsTxt:
    """Fetch and parse robots.txt for a site. Never raises for parsing issues."""
    from app.config import settings

    robots_url = _robots_url(base_url)
    try:
        res = await fetch_url(
            robots_url,
            max_redirects=3,
            client=client,
            cache=cache,
            timeout=timeout or settings.crawl_meta_timeout_seconds,
        )
    except (FetchError, SecurityError):
        return RobotsTxt(fetched=False, url=robots_url)

    if res.status_code >= 400:
        return RobotsTxt(fetched=False, url=robots_url)

    text = _decode(res.body)
    robots = _parse_robots(text, robots_url)
    robots.fetched = True
    robots.url = robots_url
    return robots


def _robots_url(base_url: str) -> str:
    from urllib.parse import urlparse

    parsed = urlparse(base_url)
    return f"{parsed.scheme}://{parsed.netloc}/robots.txt"


def _decode(body: bytes) -> str:
    for enc in ("utf-8", "latin-1"):
        try:
            return body.decode(enc)
        except UnicodeDecodeError:
            continue
    return body.decode("utf-8", errors="replace")

"""robots.txt parser tests."""


from app.crawler.robots import _parse_robots
from app.crawler.types import RobotsTxt


def test_robots_allow_deny():
    robots = _parse_robots(
        "User-agent: *\nDisallow: /private/\nAllow: /private/public/\n",
        "https://example.com",
    )
    robots.fetched = True
    assert not robots.can_fetch("/private/x")
    assert robots.can_fetch("/private/public/page")


def test_robots_wildcard():
    robots = _parse_robots("User-agent: *\nDisallow: /admin*\n", "https://example.com")
    robots.fetched = True
    assert not robots.can_fetch("/admin")
    assert not robots.can_fetch("/admin/users")
    assert robots.can_fetch("/products")


def test_robots_only_our_agent():
    content = "User-agent: otherbot\nDisallow: /\nUser-agent: *\nAllow: /\n"
    robots = _parse_robots(content, "https://example.com")
    robots.fetched = True
    # our user agents are "agentreadinessauditorbot" and "*"; the "*" group allows /
    assert robots.can_fetch("/anything")


def test_robots_no_rules_means_allow():
    robots = _parse_robots("", "https://example.com")
    assert robots.can_fetch("/")


def test_robots_sitemap_directive():
    robots = _parse_robots(
        "User-agent: *\nSitemap: https://example.com/sitemap.xml\n",
        "https://example.com",
    )
    assert robots.sitemaps == ["https://example.com/sitemap.xml"]


def test_can_fetch_when_not_fetched():
    robots = RobotsTxt(fetched=False)
    assert robots.can_fetch("/anything")

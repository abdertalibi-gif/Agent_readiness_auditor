"""URL normalization tests."""

from app.crawler.crawler import normalize_url


def test_normalize_trailing_slash():
    assert normalize_url("https://example.com") == "https://example.com/"


def test_normalize_fragment_stripped():
    assert normalize_url("https://example.com/page#section") == "https://example.com/page"


def test_normalize_query_kept():
    assert normalize_url("https://example.com/page?a=1") == "https://example.com/page?a=1"


def test_normalize_default_port():
    assert normalize_url("http://example.com:80/x") == "http://example.com/x"
    assert normalize_url("https://example.com:443/x") == "https://example.com/x"


def test_normalize_uppercase_host():
    assert normalize_url("https://EXAMPLE.com/Page") == "https://example.com/Page"

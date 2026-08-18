"""Security tests: URL validation and SSRF protection."""

import pytest

from app.config import settings
from app.core.security import (
    SecurityError,
    is_private_ip,
    validate_hostname_is_public,
    validate_public_url,
)


@pytest.mark.parametrize(
    "url",
    [
        "http://localhost",
        "https://localhost:8080/x",
        "https://127.0.0.1",
        "http://127.0.0.1:8000/admin",
        "https://[::1]",
        "http://0.0.0.0",
        "https://10.0.0.5",
        "https://192.168.1.1",
        "https://172.16.0.1",
        "http://169.254.169.254/latest/meta-data",  # link-local cloud metadata
        "https://100.64.0.1",
    ],
)
def test_validate_public_url_blocks_internal(url):
    with pytest.raises(SecurityError):
        validate_public_url(url)


@pytest.mark.parametrize(
    "url",
    [
        "ftp://example.com",
        "file:///etc/passwd",
        "javascript:alert(1)",
        "http://user:pass@example.com",
        "",
        "not-a-url",
        "http://",
    ],
)
def test_validate_public_url_blocks_bad_schemes(url):
    with pytest.raises(SecurityError):
        validate_public_url(url)


def test_validate_public_url_allows_public():
    url = validate_public_url("https://example.com/path?q=1")
    assert "example.com" in url


def test_is_private_ip():
    assert is_private_ip("127.0.0.1")
    assert is_private_ip("10.1.2.3")
    assert is_private_ip("192.168.0.1")
    assert is_private_ip("169.254.1.1")
    assert is_private_ip("::1")
    assert is_private_ip("fe80::1")
    assert not is_private_ip("8.8.8.8")
    assert not is_private_ip("93.184.216.34")
    assert is_private_ip("not-an-ip")


def test_blocked_hostname_list():
    assert "127.0.0.1" in settings.blocked_hostname_set


def test_validate_hostname_blocks_localhost(monkeypatch):
    monkeypatch.setattr(settings, "allow_private_ip_ranges", False)
    with pytest.raises(SecurityError):
        validate_hostname_is_public("localhost")

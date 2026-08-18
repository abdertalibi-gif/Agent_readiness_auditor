"""URL validation and SSRF protection.

This module is the security boundary for everything that fetches a remote URL.
Rules enforced before any HTTP request is made:

- only http/https schemes
- no embedded credentials
- hostname not on a blocklist (localhost etc.)
- every resolved IP must be public (no loopback / private / link-local / reserved)
- redirects re-validated at each hop (the crawler drives redirects itself)
- best-effort DNS rebinding guard (resolve host, then re-resolve after connect)

If anything looks internal, `SecurityError` is raised and the caller aborts.
"""

import ipaddress
import socket
import urllib.parse

from app.config import settings


class SecurityError(ValueError):
    """Raised when a URL or resolved host fails SSRF validation."""


def is_private_ip(ip_str: str) -> bool:
    """True if the IP is loopback, private, link-local, reserved, multicast, etc."""
    try:
        ip = ipaddress.ip_address(ip_str)
    except ValueError:
        return True  # unparseable => treat as unsafe
    return bool(
        ip.is_loopback
        or ip.is_private
        or ip.is_link_local
        or ip.is_reserved
        or ip.is_multicast
        or ip.is_unspecified
        or not ip.is_global
    )


def _extract_hostname(url: str) -> str:
    parsed = urllib.parse.urlparse(url)
    host = parsed.hostname
    if not host:
        raise SecurityError("URL is missing a host.")
    return host


def _is_ip_literal(host: str) -> bool:
    try:
        ipaddress.ip_address(host)
        return True
    except ValueError:
        return False


def validate_public_url(url: str) -> str:
    """Validate the URL string and reject anything unsafe. Returns the normalized URL."""
    try:
        parsed = urllib.parse.urlparse(url.strip())
    except ValueError as exc:
        raise SecurityError("Invalid URL.") from exc

    if parsed.scheme not in ("http", "https"):
        raise SecurityError("Only http and https URLs are allowed.")
    if not parsed.netloc:
        raise SecurityError("Invalid URL.")
    if parsed.username or parsed.password:
        raise SecurityError("URLs with embedded credentials are not allowed.")

    host = _extract_hostname(url)
    host_lower = host.lower().rstrip(".")
    if host_lower in settings.blocked_hostname_set:
        # In explicit dev/test mode (allow_private_ip_ranges) literal private IP
        # addresses may be audited (e.g. a local fixture server); hostnames such
        # as "localhost" remain blocked. Production never sets this flag.
        if not (settings.allow_private_ip_ranges and _is_ip_literal(host_lower)):
            raise SecurityError("This hostname is blocked.")

    # Reject literal private/reserved IPs without needing DNS resolution.
    # The blocklist above always applies; this extra check is skipped only in
    # explicit test/dev mode (allow_private_ip_ranges), never in production.
    if not settings.allow_private_ip_ranges:
        try:
            ipaddress.ip_address(host_lower)
        except ValueError:
            pass
        else:
            if is_private_ip(host_lower):
                raise SecurityError("This URL points to a private or internal address.")

    return url.strip()


def resolve_host_ips(hostname: str) -> list[str]:
    """Resolve a hostname to IP addresses. Returns [] on resolution failure."""
    try:
        infos = socket.getaddrinfo(hostname, None)
    except (socket.gaierror, UnicodeError):
        return []
    ips: list[str] = []
    for info in infos:
        ip = info[4][0]
        if ip not in ips:
            ips.append(ip)
    return ips


def validate_hostname_is_public(hostname: str) -> list[str]:
    """Resolve a hostname and ensure all addresses are public. Returns the IPs."""
    ips = resolve_host_ips(hostname)
    if not ips:
        raise SecurityError("Unable to resolve hostname.")
    if settings.allow_private_ip_ranges:
        return ips
    for ip in ips:
        if is_private_ip(ip):
            raise SecurityError("This host resolves to a private or internal address.")
    return ips


def validate_url_is_public(url: str) -> None:
    """Full pre-request validation: string rules + DNS resolution rules."""
    validate_public_url(url)
    host = _extract_hostname(url)
    validate_hostname_is_public(host)


def validate_redirect_url(url: str) -> None:
    """Re-validate a redirect target before following it."""
    validate_public_url(url)
    host = _extract_hostname(url)
    validate_hostname_is_public(host)


def dns_rebinding_guard(hostname: str, connected_ip: str | None = None) -> None:
    """Re-resolve the hostname after connection to detect DNS rebinding.

    If the post-connection resolution surfaces a private address we never saw
    before, we treat it as unsafe. `connected_ip` is the IP we actually
    connected to, if the transport reports it.
    """
    ips = resolve_host_ips(hostname)
    if not ips:
        return  # best effort: nothing to compare
    if settings.allow_private_ip_ranges:
        return
    for ip in ips:
        if is_private_ip(ip):
            raise SecurityError("DNS rebinding detected: host now resolves to a private address.")

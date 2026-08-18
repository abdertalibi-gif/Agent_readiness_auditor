"""SSRF integration tests: redirect-to-internal must be blocked at fetch time."""

import http.server
import socketserver
import threading

import pytest

from app.config import settings
from app.core.security import SecurityError
from app.crawler.client import fetch_url


class RedirectToLocalHandler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_GET(self):  # noqa: N802
        if self.path == "/to-private":
            self.send_response(302)
            self.send_header("Location", "http://127.0.0.1:1/internal")
            self.end_headers()
            return
        self.send_response(200)
        self.end_headers()


@pytest.fixture(scope="module")
def redirect_server():
    server = socketserver.ThreadingTCPServer(("127.0.0.1", 0), RedirectToLocalHandler)
    server.daemon_threads = True
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{server.server_address[1]}"
    server.shutdown()
    server.server_close()


@pytest.mark.asyncio
async def test_redirect_to_private_is_blocked(redirect_server):
    with pytest.raises(SecurityError):
        await fetch_url(f"{redirect_server}/to-private")


@pytest.mark.asyncio
async def test_fetch_blocks_private_directly():
    with pytest.raises(SecurityError):
        await fetch_url("http://169.254.169.254/latest/meta-data")


@pytest.mark.asyncio
async def test_blocklist_applies_even_when_private_allowed(monkeypatch):
    # Test/dev mode may allow private ranges, but the explicit hostname
    # blocklist (localhost, 127.0.0.1, ...) must always apply.
    monkeypatch.setattr(settings, "allow_private_ip_ranges", True)
    with pytest.raises(SecurityError):
        await fetch_url("http://localhost:8000/admin")

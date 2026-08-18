"""Shared fixtures: a local mock website (crawled for real), test DB, and an
ASGI client with the API dependency overridden to the test database.
"""

import asyncio
import http.server
import socketserver
import threading
import uuid
from pathlib import Path

import httpx
import pytest

from app.config import settings
from app.database import Base, get_db_session
from app.main import app

# ---- Fast test settings ---------------------------------------------------
settings.crawl_rate_limit_seconds = 0.0
settings.crawl_max_pages = 20
settings.crawl_max_depth = 3
settings.job_mode = "inline"
settings.ai_provider = "none"

TEST_DB_PATH = Path(__file__).parent / "test_auditor.db"
TEST_DB_URL = f"sqlite+aiosqlite:///{TEST_DB_PATH.as_posix()}"


# ---- Mock website ---------------------------------------------------------
def _page(base, path, title, desc, h1, body, links, extra_heads=""):
    link_html = "\n".join(f'<a href="{href}">{text}</a>' for href, text in links)
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>{title}</title>
  <meta name="description" content="{desc}">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="canonical" href="{base}{path}">
  {extra_heads}
</head>
<body>
  <header><nav><a href="/">Home</a> <a href="/about">About</a> <a href="/products">Products</a> <a href="/contact">Contact</a></nav></header>
  <main>
    <h1>{h1}</h1>
    <p>{body}</p>
    {link_html}
  </main>
  <footer>Copyright Acme Inc.</footer>
</body>
</html>"""


INDEX_JSONLD = """
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Organization","name":"Acme Inc.","url":"https://example.com","contactPoint":{"@type":"ContactPoint","email":"hello@example.com"}}
</script>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"WebSite","name":"Acme Inc.","url":"https://example.com"}
</script>
"""


def build_routes(base: str) -> dict[str, tuple[int, str, str]]:
    index_html = _page(
        base, "/",
        "Acme Inc. - Agent-ready products and services",
        "Acme builds automation software for teams.",
        "Automation software for modern teams",
        "We provide automation software and services that help teams move faster. "
        "Our platform offers solutions, products and services for businesses of all sizes. "
        "Learn about our company and what we offer.",
        [
            ("/about", "About us"),
            ("/products", "Our products"),
            ("/contact", "Contact us"),
            ("/pricing", "Pricing"),
            ("/missing-page", "A broken link"),
        ],
        extra_heads=INDEX_JSONLD,
    )
    about_html = _page(
        base, "/about",
        "About Acme Inc.",
        "Learn about Acme Inc.",
        "About our company",
        "Acme Inc. is a company that provides automation software and services.",
        [("/contact", "Contact us")],
    )
    products_html = _page(
        base, "/products",
        "Products - Acme Inc.",
        "Our automation products.",
        "Our products",
        "We offer several products including automation software, dashboards and services.",
        [("/pricing", "Pricing")],
    )
    contact_html = _page(
        base, "/contact",
        "Contact - Acme Inc.",
        "Contact Acme Inc. by email or phone.",
        "Contact us",
        "Reach us at hello@acme.example or call +1 555 0100. We offer services.",
        [],
    )
    pricing_html = _page(
        base, "/pricing",
        "Pricing - Acme Inc.",
        "Our pricing plans.",
        "Pricing",
        "Our pricing plans start at $29 per month. We offer services and support.",
        [],
    )
    robots = "User-agent: *\nDisallow: /private/\nSitemap: /sitemap.xml\n"
    sitemap = f"""<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>{base}/</loc></url>
  <url><loc>{base}/about</loc></url>
  <url><loc>{base}/products</loc></url>
  <url><loc>{base}/contact</loc></url>
  <url><loc>{base}/pricing</loc></url>
</urlset>"""

    return {
        "/": (200, "text/html", index_html),
        "/about": (200, "text/html", about_html),
        "/products": (200, "text/html", products_html),
        "/contact": (200, "text/html", contact_html),
        "/pricing": (200, "text/html", pricing_html),
        "/robots.txt": (200, "text/plain", robots),
        "/sitemap.xml": (200, "application/xml", sitemap),
        "/missing-page": (404, "text/html", "<html><head><title>404</title></head><body>not found</body></html>"),
        "/noindex": (200, "text/html", _page(base, "/noindex", "Noindex", "noindex page", "Noindex", "noindex content", [], '<meta name="robots" content="noindex,nofollow">')),
    }


class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *args):  # silence
        pass

    def do_GET(self):  # noqa: N802
        routes = ROUTES
        if self.path == "/redirect-me":
            self.send_response(302)
            self.send_header("Location", "/about")
            self.end_headers()
            return
        status, ctype, body = routes.get(self.path, (404, "text/html", "<h1>404</h1>"))
        payload = body.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(payload)))
        if self.path == "/noindex":
            self.send_header("X-Test-Header", "yes")
        self.end_headers()
        self.wfile.write(payload)


ROUTES: dict[str, tuple[int, str, str]] = {}


@pytest.fixture(scope="session")
def mock_site():
    server = socketserver.ThreadingTCPServer(("127.0.0.1", 0), Handler)
    server.daemon_threads = True
    port = server.server_address[1]
    base = f"http://127.0.0.1:{port}"
    global ROUTES
    ROUTES = build_routes(base)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield base
    server.shutdown()
    server.server_close()


# ---- Database -------------------------------------------------------------
@pytest.fixture(scope="session")
def test_engine():
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    if TEST_DB_PATH.exists():
        TEST_DB_PATH.unlink()
    engine = create_async_engine(TEST_DB_URL, connect_args={"check_same_thread": False, "timeout": 30})

    async def _setup():
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    asyncio.run(_setup())
    factory = async_sessionmaker(engine, expire_on_commit=False)
    yield engine, factory
    asyncio.run(engine.dispose())
    if TEST_DB_PATH.exists():
        TEST_DB_PATH.unlink()


@pytest.fixture()
def db_session_factory(test_engine):
    _, factory = test_engine
    return factory


@pytest.fixture()
def client(test_engine, monkeypatch):
    """Async client against the app with the test DB wired in."""

    from sqlalchemy.ext.asyncio import async_sessionmaker

    engine, factory = test_engine
    asyncio_sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async def override_get_db():
        async with asyncio_sessionmaker() as session:
            yield session

    monkeypatch.setattr("app.database.async_session_factory", asyncio_sessionmaker)
    monkeypatch.setattr("app.services.audit_service.async_session_factory", asyncio_sessionmaker)
    app.dependency_overrides[get_db_session] = override_get_db

    # API integration tests crawl a localhost fixture site.
    monkeypatch.setattr(settings, "allow_private_ip_ranges", True)

    transport = httpx.ASGITransport(app=app)
    return httpx.AsyncClient(transport=transport, base_url="http://testserver")


async def _register_and_login(client: httpx.AsyncClient, email: str) -> dict[str, str]:
    """Register + login a fresh account and return bearer auth headers."""
    reg = await client.post(
        "/api/auth/register",
        json={"name": "Test User", "email": email, "password": "StrongPass-123", "company_name": "Acme Inc."},
    )
    assert reg.status_code == 201, reg.text
    login = await client.post("/api/auth/login", json={"email": email, "password": "StrongPass-123"})
    assert login.status_code == 200, login.text
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


@pytest.fixture()
async def user_headers(client) -> dict[str, str]:
    """Bearer headers for a freshly registered user."""
    return await _register_and_login(client, f"user-{uuid.uuid4().hex[:8]}@example.com")


@pytest.fixture()
async def second_user_headers(client) -> dict[str, str]:
    """Bearer headers for a second user (used for ownership tests)."""
    return await _register_and_login(client, f"other-{uuid.uuid4().hex[:8]}@example.com")


@pytest.fixture()
async def audit_id_factory(client, user_headers):
    """Run a full audit against the mock site and wait for completion."""

    async def _run(base_url: str):
        resp = await client.post("/api/audits", json={"url": base_url}, headers=user_headers)
        assert resp.status_code == 201, resp.text
        audit = resp.json()
        audit_id = audit["id"]
        for _ in range(200):
            status_resp = await client.get(f"/api/audits/{audit_id}/status", headers=user_headers)
            status = status_resp.json()
            if status["status"] in ("COMPLETED", "PARTIAL", "FAILED", "CANCELLED"):
                return status
            await asyncio.sleep(0.05)
        raise TimeoutError("audit did not complete in time")

    return _run


@pytest.fixture()
async def audit_id(mock_site, audit_id_factory):
    """Run one audit against the mock site and return the completion status."""
    return await audit_id_factory(mock_site)

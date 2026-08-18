"""Debug a local fixture crawl with prints + hard timeout."""

import asyncio
import sys
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, r"C:\Users\Abde\Desktop\aiagent\agent-readiness-auditor\backend")

from app.config import settings  # noqa: E402

settings.allow_private_ip_ranges = True

HTML_PAGES = {
    "/": b"""<!doctype html><html><head><title>home</title></head><body>
        <a href="http://[::1/weird">bad colon link</a>
        <a href="/ok">ok</a>
        <h1>hi</h1>
      </body></html>""",
    "/ok": b"<!doctype html><html><head><title>ok</title></head><body><h1>ok</h1></body></html>",
}


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        body = HTML_PAGES.get(self.path, b"")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a):
        pass


async def main() -> None:
    from app.crawler.client import fetch_url
    from app.crawler.crawler import crawl_website

    server = ThreadingHTTPServer(("127.0.0.1", 8904), Handler)
    threading_task = asyncio.create_task(asyncio.to_thread(server.serve_forever))
    await asyncio.sleep(0.5)
    print("server up", flush=True)

    try:
        res = await asyncio.wait_for(
            fetch_url("http://127.0.0.1:8904/", max_redirects=2), timeout=8
        )
        print(f"fetch ok status={res.status_code} len={len(res.body)}", flush=True)
    except BaseException as exc:  # noqa: BLE001
        print(f"fetch failed {type(exc).__name__}: {exc}", flush=True)
        traceback.print_exc()

    try:
        crawl = await asyncio.wait_for(
            crawl_website("http://127.0.0.1:8904/", max_pages=3), timeout=15
        )
        print(f"crawl OK pages={len(crawl.pages)} errors={crawl.crawl_errors}", flush=True)
    except BaseException as exc:  # noqa: BLE001
        print(f"CRAWL-ESCAPE {type(exc).__name__}: {exc}", flush=True)
        traceback.print_exc()

    server.shutdown()
    threading_task.cancel()
    print("done", flush=True)


asyncio.run(main())
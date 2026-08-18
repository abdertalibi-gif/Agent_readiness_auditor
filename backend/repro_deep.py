"""Test non-ValueError crash sources: deep JSON-LD (RecursionError), deep HTML, lxml quirks."""

import json
import sys
import traceback

sys.path.insert(0, r"C:\Users\Abde\Desktop\aiagent\agent-readiness-auditor\backend")


def mk(body: bytes, content_type="text/html; charset=utf-8"):
    class _R:
        pass
    r = _R()
    r.url = "https://t.example/"
    r.final_url = "https://t.example/"
    r.status_code = 200
    r.content_type = content_type
    r.elapsed_ms = 5
    r.headers = {"content-type": content_type}
    r.body = body
    r.redirect_chain = []
    return r


# 1) Deeply nested JSON-LD -> RecursionError in json.loads
deep_json = "[" * 20000 + "]" * 20000
# 2) Deeply nested JSON inside script
deep_ld = f'<script type="application/ld+json">{deep_json}</script>'
# 3) Deeply nested HTML
deep_html = b"<html>" + (b"<div>" * 30000) + (b"x" * 50) + (b"</div>" * 30000) + b"</html>"
# 4) JSON-LD with cycles via huge arrays of nested objects
huge_ld = '{"@type":"X","n":' + "[" * 5000 + "1" + "]" * 5000 + "}"

cases = {
    "deep_jsonld": mk(deep_ld.encode()),
    "deep_html": mk(deep_html),
    "huge_ld": mk(('<script type="application/ld+json">' + huge_ld + "</script>").encode()),
}

from app.crawler.parsers import parse_page  # noqa: E402

for name, res in cases.items():
    try:
        page = parse_page(res, "https://t.example/")
        print(f"OK   {name}: ld={len(page.structured_data)} text={len(page.text)}")
    except Exception as exc:  # noqa: BLE001
        print(f"CRASH {name}: {type(exc).__name__}: {exc}  [NOT ValueError: {not isinstance(exc, ValueError)}]")
        if not isinstance(exc, ValueError):
            traceback.print_exc()
            print("-" * 60)

# Also confirm json.loads alone
try:
    json.loads(deep_json)
    print("json.loads deep: ok")
except Exception as exc:
    print(f"json.loads deep: {type(exc).__name__}: {exc}")
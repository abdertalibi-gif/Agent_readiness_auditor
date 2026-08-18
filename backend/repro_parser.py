"""Stress-test parse_page (the per-page HTML extractor) with adversarial content."""

import sys
import traceback

sys.path.insert(0, r"C:\Users\Abde\Desktop\aiagent\agent-readiness-auditor\backend")

from app.crawler.parsers import parse_page  # noqa: E402


def mk(body: bytes, content_type: str = "text/html; charset=utf-8", status=200, url="https://t.example/", final="https://t.example/"):
    class _R:
        pass
    r = _R()
    r.url = url
    r.final_url = final
    r.status_code = status
    r.content_type = content_type
    r.elapsed_ms = 5
    r.headers = {"content-type": content_type}
    r.body = body
    r.redirect_chain = []
    return r


CASES = {
    "nan_jsonld": b'<html><head><title>T</title><script type="application/ld+json">{"@type":"Organization","x":NaN}</script></head><body><h1>Hi</h1></body></html>',
    "inf_jsonld": b'<script type="application/ld+json">{"@type":"Product","price":Infinity}</script>',
    "str_jsonld": b'<script type="application/ld+json">"just a string"</script>',
    "num_jsonld": b'<script type="application/ld+json">12345</script>',
    "bool_jsonld": b'<script type="application/ld+json">null</script>',
    "broken_jsonld": b'<script type="application/ld+json">{"unclosed": </script>',
    "binary_garbage": bytes(range(256)) * 10,
    "no_html_tag": b"<div><p>partial document without html/head/body</p><img src='x.png'><a href='/2'>l</a></div>",
    "weird_attrs": b'<html lang="en"><a href="http://[::1">bad</a><a href="data:text/html,x">d</a></html>',
    "deep_nesting": b"<html>" + (b"<div>" * 5000) + (b"x" * 100) + (b"</div>" * 5000) + b"</html>",
    "huge_title": b"<title>" + (b"t" * 300000) + b"</title>",
    "script_string_as_comment": b'<script type="application/ld+json"><!-- {"@type":"X"} --></script>',
    "no_close_tags": b"<html><body><title>uno<div><p>lorem ipsum<h1>yo<img>",
}

for name, body in CASES.items():
    try:
        page = parse_page(mk(body), "https://t.example/")
        print(f"OK   {name:22s} title={str(page.title)[:20]!r} ld={len(page.structured_data)} text={len(page.text)}")
    except Exception as exc:  # noqa: BLE001
        print(f"PARSER CRASH {name:22s} => {type(exc).__name__}: {exc}")
        traceback.print_exc()
        print("-" * 60)
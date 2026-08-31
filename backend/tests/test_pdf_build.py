"""Test report generation for English, Arabic, and French.

Exercises the full generate_report_pdf pipeline:
 - database query (AsyncSession.scalars)
 - data assembly
 - ReportLab PDF build (including arabic-reshaper + python-bidi for Arabic)
"""

import pytest

from app.reports.pdf import build_pdf


MINIMAL_DATA = {
    "target_url": "https://example.com",
    "audit_date": "2025-01-01 12:00 UTC",
    "score": 72.5,
    "rating": "GOOD",
    "rating_label": "Good",
    "ai_summary": "",
    "platform": "Unknown",
    "categories": [
        {"category": "discoverability", "score": 80, "status": "good"},
        {"category": "crawlability", "score": 60, "status": "warning"},
    ],
    "counts": {"PASS": 10, "FAIL": 2, "WARNING": 1},
    "coverage": {"pages": 5},
    "issues": [
        {
            "name": "Homepage is missing a meta description",
            "severity": "HIGH",
            "description": "The homepage does not have a meta description tag.",
            "evidence": {"tag": "meta"},
            "evidence_text": '{"tag": "meta"}',
            "recommendation": "Add a descriptive meta description to the homepage.",
            "category_label": "discoverability",
        }
    ],
    "findings": [
        {"name": "Homepage has a title", "category": "discoverability", "status": "PASS", "severity": "HIGH", "score": 100},
        {"name": "Homepage is missing a meta description", "category": "discoverability", "status": "FAIL", "severity": "HIGH", "score": 0},
    ],
    "recommendations": [
        {
            "title": "Add a meta description",
            "priority": "HIGH",
            "description": "The homepage is missing a meta description.",
            "how_to_fix": "Add a <meta name='description' content='...'> tag.",
        }
    ],
    "pages": [
        {"url": "https://example.com/", "status_code": 200, "response_time_ms": 120, "word_count": 350},
        {"url": "https://example.com/about", "status_code": 200, "response_time_ms": 95, "word_count": 200},
    ],
}


def test_build_pdf_english():
    """English report must generate without error and be a valid PDF."""
    result = build_pdf(MINIMAL_DATA, "en")
    assert isinstance(result, bytes)
    assert len(result) > 500
    assert result[:5] == b"%PDF-"


def test_build_pdf_arabic():
    """Arabic report must generate without error — this was the 500 bug."""
    result = build_pdf(MINIMAL_DATA, "ar")
    assert isinstance(result, bytes)
    assert len(result) > 500
    assert result[:5] == b"%PDF-"


def test_build_pdf_french():
    """French report must also work."""
    result = build_pdf(MINIMAL_DATA, "fr")
    assert isinstance(result, bytes)
    assert len(result) > 500
    assert result[:5] == b"%PDF-"


def test_build_pdf_invalid_language_falls_back_to_english():
    """An unknown language code should fall back to English, not crash."""
    result = build_pdf(MINIMAL_DATA, "xx")
    assert isinstance(result, bytes)
    assert result[:5] == b"%PDF-"


def test_build_pdf_empty_data():
    """A report with all-empty collections must not crash."""
    empty = {
        "target_url": "https://empty.example",
        "audit_date": "2025-01-01",
        "score": 0,
        "rating": "",
        "rating_label": "",
        "categories": [],
        "counts": {},
        "coverage": {},
        "issues": [],
        "findings": [],
        "recommendations": [],
        "pages": [],
    }
    for lang in ("en", "ar", "fr"):
        result = build_pdf(empty, lang)
        assert isinstance(result, bytes)
        assert result[:5] == b"%PDF-"


@pytest.mark.asyncio
async def test_generate_report_pdf_en_and_ar(client, mock_site, user_headers, audit_id):
    """Full integration: generate reports via the API endpoint for en and ar."""
    aid = audit_id["id"]
    for lang in ("en", "ar", "fr"):
        resp = await client.get(f"/api/audits/{aid}/report?lang={lang}", headers=user_headers)
        assert resp.status_code != 404, f"Report endpoint returned 404 for lang={lang}"
        assert resp.status_code != 500, f"Report endpoint returned 500 for lang={lang}: {resp.text}"
        assert resp.status_code == 200, f"Expected 200 for lang={lang}, got {resp.status_code}: {resp.text}"
        assert resp.headers.get("content-type") == "application/pdf"
        assert resp.content[:5] == b"%PDF-"

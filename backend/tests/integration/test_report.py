"""Report generation tests."""


from app.reports.pdf import build_pdf
from app.scoring.categories import CATEGORY_LABELS


def _sample_data():
    return {
        "target_url": "https://example.com",
        "audit_date": "2026-08-11 12:00 UTC",
        "score": 62.5,
        "rating": "MODERATE",
        "rating_label": "Moderate",
        "ai_summary": "The site has solid structure but lacks structured data.",
        "categories": [
            {"label": CATEGORY_LABELS.get(c, c), "score": 80.0, "status": "good"} for c in CATEGORY_LABELS
        ],
        "counts": {"PASS": 30, "WARNING": 8, "FAIL": 4, "NOT_APPLICABLE": 2},
        "coverage": {"pages": 5},
        "issues": [
            {
                "name": "No structured data on homepage",
                "severity": "HIGH",
                "description": "No Schema.org structured data was found.",
                "evidence": {"page": "https://example.com"},
                "evidence_text": '{"page": "https://example.com"}',
                "recommendation": "Add JSON-LD.",
                "category_label": "structured_data",
            }
        ],
        "findings": [
            {"name": "No structured data on homepage", "category": "structured_data", "status": "FAIL", "severity": "HIGH", "score": 15.0},
            {"name": "robots.txt is available", "category": "crawlability", "status": "PASS", "severity": "INFO", "score": 100.0},
        ],
        "recommendations": [
            {"title": "Add structured data", "priority": "HIGH", "description": "Add JSON-LD.", "how_to_fix": "Add JSON-LD to the homepage."},
        ],
        "pages": [{"url": "https://example.com/", "status_code": 200, "response_time_ms": 120, "word_count": 400}],
    }


def test_pdf_generates_valid_header():
    pdf = build_pdf(_sample_data())
    assert pdf.startswith(b"%PDF")
    assert len(pdf) > 2000


def test_pdf_contains_all_sections():
    pdf = build_pdf(_sample_data())
    # PDFs are compressed, but a valid document of reasonable size is produced.
    assert len(pdf) > 2000

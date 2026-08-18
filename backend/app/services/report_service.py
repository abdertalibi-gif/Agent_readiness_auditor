"""Report generation service: assembles report data and renders the PDF."""

import asyncio
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Audit, AuditCheck, Page, Recommendation
from app.reports.pdf import build_pdf, now_iso

logger = logging.getLogger("auditor.reports")


async def generate_report_pdf(session: AsyncSession, audit: Audit) -> bytes:
    """Build the full report payload from the audit's persisted data and render PDF."""

    checks = (
        (await session.scalars(select(AuditCheck).where(AuditCheck.audit_id == audit.id))).all()
    )
    pages = (await session.scalars(select(Page).where(Page.audit_id == audit.id))).all()
    recommendations = (
        (await session.scalars(select(Recommendation).where(Recommendation.audit_id == audit.id).order_by(
            Recommendation.priority.asc()
        ))).all()
    )

    summary = audit.summary_json or {}
    categories = summary.get("categories", [])
    counts = summary.get("counts", {})
    coverage = summary.get("coverage", {})

    severity_order = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3, "INFO": 4}
    failed = sorted(
        [c for c in checks if c.status in ("FAIL", "WARNING")],
        key=lambda c: severity_order.get(c.severity, 5),
    )

    data = {
        "target_url": audit.target_url,
        "audit_date": now_iso(),
        "score": audit.score or 0.0,
        "rating": audit.rating or "",
        "rating_label": (summary.get("rating_label") or audit.rating or "").capitalize(),
        "ai_summary": summary.get("ai_summary"),
        "platform": summary.get("platform", "Unknown"),
        "categories": categories,
        "counts": counts,
        "coverage": coverage,
        "issues": [
            {
                "name": c.name,
                "severity": c.severity,
                "description": c.description,
                "evidence": c.evidence,
                "evidence_text": _evidence_text(c),
                "recommendation": c.recommendation,
                "category_label": c.category,
            }
            for c in failed
        ],
        "findings": [
            {
                "name": c.name,
                "category": c.category,
                "status": c.status,
                "severity": c.severity,
                "score": c.score,
            }
            for c in checks
        ],
        "recommendations": [
            {
                "title": r.title,
                "priority": r.priority,
                "description": r.description,
                "how_to_fix": r.how_to_fix,
            }
            for r in recommendations
        ],
        "pages": [
            {
                "url": p.url,
                "status_code": p.status_code,
                "response_time_ms": p.response_time_ms,
                "word_count": p.word_count,
            }
            for p in pages
        ],
    }
    # build_pdf is CPU-bound (ReportLab layout + rendering). Running it on the
    # event loop would block every other request for the whole render; offload
    # it to the default executor so the API stays responsive.
    return await asyncio.to_thread(build_pdf, data)


def _evidence_text(check: AuditCheck) -> str:
    if not check.evidence:
        return ""
    import json

    return json.dumps(check.evidence, default=str, ensure_ascii=False)[:500]

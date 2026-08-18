"""PDF report rendering with ReportLab.

Produces a professional, self-contained audit report:
Executive Summary -> Score -> Category Scores -> Critical Issues ->
Detailed Findings -> Recommendations -> Priority Roadmap -> Appendix.
"""

import io
import logging
from datetime import UTC, datetime

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from app.scoring.categories import category_label

logger = logging.getLogger("auditor.reports")

ACCENT = colors.HexColor("#4f46e5")
DARK = colors.HexColor("#111827")
GREY = colors.HexColor("#6b7280")
LIGHT = colors.HexColor("#f3f4f6")
RED = colors.HexColor("#dc2626")
AMBER = colors.HexColor("#d97706")
GREEN = colors.HexColor("#16a34a")

_SEVERITY_COLOR = {"CRITICAL": RED, "HIGH": RED, "MEDIUM": AMBER, "LOW": colors.HexColor("#2563eb"), "INFO": GREY}


def _styles() -> dict:
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle("TitleX", parent=base["Title"], fontSize=22, textColor=DARK, spaceAfter=2 * mm),
        "subtitle": ParagraphStyle("SubX", parent=base["Normal"], fontSize=11, textColor=GREY, spaceAfter=6 * mm),
        "h1": ParagraphStyle("H1X", parent=base["Heading1"], fontSize=15, textColor=ACCENT, spaceBefore=8 * mm, spaceAfter=3 * mm),
        "h2": ParagraphStyle("H2X", parent=base["Heading2"], fontSize=12, textColor=DARK, spaceBefore=4 * mm, spaceAfter=2 * mm),
        "body": ParagraphStyle("BodyX", parent=base["Normal"], fontSize=9.5, leading=14),
        "small": ParagraphStyle("SmallX", parent=base["Normal"], fontSize=8.5, leading=12, textColor=GREY),
        "score": ParagraphStyle("ScoreX", parent=base["Normal"], fontSize=34, textColor=ACCENT, alignment=1),
    }


def _rating_color(rating: str) -> colors.Color:
    return {"CRITICAL": RED, "POOR": AMBER, "MODERATE": AMBER, "GOOD": GREEN, "EXCELLENT": GREEN}.get(rating, GREY)


def build_pdf(data: dict) -> bytes:
    """`data` is the report payload (see services/report_service.py)."""
    styles = _styles()
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4, leftMargin=16 * mm, rightMargin=16 * mm, topMargin=14 * mm, bottomMargin=14 * mm,
    )
    story: list = []

    # Header
    story.append(Paragraph("Agent-Readiness Auditor", styles["title"]))
    story.append(
        Paragraph(
            f"{data.get('target_url', '')} &nbsp;|&nbsp; {data.get('audit_date', '')}",
            styles["subtitle"],
        )
    )

    # 1. Executive summary
    story.append(Paragraph("1. Executive Summary", styles["h1"]))
    summary = data.get("ai_summary") or (
        f"The website scored <b>{data.get('score', 0):.0f}/100</b> "
        f"(<b>{data.get('rating_label', '')}</b>) for Agent Readiness. "
        f"Priority: address the {data.get('counts', {}).get('FAIL', 0)} failed checks "
        f"to improve discoverability, structure and machine readability."
    )
    story.append(Paragraph(summary, styles["body"]))

    # 2. Overall score
    story.append(Paragraph("2. Overall Agent Readiness Score", styles["h1"]))
    story.append(Paragraph(f"{data.get('score', 0):.0f} / 100", styles["score"]))
    story.append(
        Paragraph(
            f"Rating: <b><font color='{_rating_color(data.get('rating', '')).hexval()}'>{data.get('rating_label', '')}</font></b>",
            styles["body"],
        )
    )
    platform = data.get("platform")
    if platform:
        story.append(Paragraph(f"Platform: <b>{platform}</b>", styles["body"]))
    story.append(Spacer(1, 3 * mm))

    # 3. Category scores (table + bars)
    story.append(Paragraph("3. Category Scores", styles["h1"]))
    categories = data.get("categories", [])
    rows = [["Category", "Score", "Status"]]
    for cat in categories:
        rows.append([cat.get("label", ""), f"{cat.get('score', 0):.0f}/100", cat.get("status", "")])
    table = Table(rows, colWidths=[90 * mm, 40 * mm, 50 * mm])
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), ACCENT),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#e5e7eb")),
                ("BACKGROUND", (0, 1), (-1, -1), colors.white),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT]),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
            ]
        )
    )
    story.append(table)
    story.append(Spacer(1, 4 * mm))

    # 4. Critical issues
    story.append(Paragraph("4. Critical Issues & High Priorities", styles["h1"]))
    issues = data.get("issues", [])
    if issues:
        for issue in issues[:10]:
            color = _SEVERITY_COLOR.get(issue.get("severity", "INFO"), GREY)
            story.append(
                Paragraph(
                    f"<font color='{color.hexval()}'>[{issue.get('severity', '')}]</font> "
                    f"<b>{issue.get('name', '')}</b> &nbsp;({issue.get('category_label', '')})",
                    styles["h2"],
                )
            )
            story.append(Paragraph(issue.get("description", "") or "", styles["body"]))
            if issue.get("evidence"):
                story.append(
                Paragraph(
                    f"<font color='{GREY.hexval()}'>Evidence:</font> {issue.get('evidence_text', '')}",
                    styles["small"],
                )
                )
            if issue.get("recommendation"):
                story.append(Paragraph(f"<b>Fix:</b> {issue['recommendation']}", styles["small"]))
            story.append(Spacer(1, 2 * mm))
    else:
        story.append(Paragraph("No critical or high-priority issues found.", styles["body"]))

    story.append(PageBreak())

    # 5. Detailed findings
    story.append(Paragraph("5. Detailed Findings", styles["h1"]))
    findings = data.get("findings", [])
    if findings:
        rows = [["Check", "Category", "Status", "Severity", "Score"]]
        for f in findings:
            rows.append(
                [
                    f.get("name", ""),
                    category_label(f.get("category", "")),
                    f.get("status", ""),
                    f.get("severity", ""),
                    f"{f.get('score', 0):.0f}",
                ]
            )
        t2 = Table(rows, colWidths=[60 * mm, 30 * mm, 22 * mm, 22 * mm, 18 * mm])
        t2.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), DARK),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#e5e7eb")),
                    ("FONTSIZE", (0, 0), (-1, -1), 8),
                    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT]),
                ]
            )
        )
        story.append(t2)
    else:
        story.append(Paragraph("No findings recorded.", styles["body"]))

    # 6. Recommendations
    story.append(Paragraph("6. Recommendations", styles["h1"]))
    recs = data.get("recommendations", [])
    if recs:
        for i, rec in enumerate(recs, start=1):
            story.append(
                Paragraph(
                    f"{i}. <b>{rec.get('title', '')}</b> &nbsp;<font color='{GREY.hexval()}'>({rec.get('priority', '')})</font>",
                    styles["h2"],
                )
            )
            if rec.get("description"):
                story.append(Paragraph(rec["description"], styles["body"]))
            if rec.get("how_to_fix"):
                story.append(Paragraph(f"<b>How:</b> {rec['how_to_fix']}", styles["small"]))
            story.append(Spacer(1, 2 * mm))
    else:
        story.append(Paragraph("No recommendations generated.", styles["body"]))

    # 7. Priority roadmap
    story.append(Paragraph("7. Priority Roadmap", styles["h1"]))
    priority_order = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"]
    for severity in priority_order:
        items = [f for f in findings if f.get("severity") == severity and f.get("status") != "PASS"]
        if items:
            story.append(Paragraph(f"{severity.capitalize()}", styles["h2"]))
            for f in items:
                story.append(
                    Paragraph(f"&bull; {f.get('name', '')}", styles["small"])
                )
    story.append(PageBreak())

    # 8. Appendix
    story.append(Paragraph("8. Appendix", styles["h1"]))
    story.append(
        Paragraph(
            f"Pages analyzed: <b>{data.get('coverage', {}).get('pages', 0)}</b>. "
            f"Checks: {data.get('counts', {})}.",
            styles["body"],
        )
    )
    pages = data.get("pages", [])
    if pages:
        rows = [["URL", "Status", "Time", "Words"]]
        for p in pages[:40]:
            rows.append(
                [
                    p.get("url", ""),
                    str(p.get("status_code", "")),
                    f"{p.get('response_time_ms', 0)}ms",
                    str(p.get("word_count", 0)),
                ]
            )
        t3 = Table(rows, colWidths=[90 * mm, 25 * mm, 25 * mm, 22 * mm])
        t3.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), DARK),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#e5e7eb")),
                    ("FONTSIZE", (0, 0), (-1, -1), 7.5),
                    ("WORDWRAP", (0, 0), (-1, -1), True),
                ]
            )
        )
        story.append(t3)

    story.append(Spacer(1, 6 * mm))
    story.append(
        Paragraph(
            "This report measures Agent Readiness, AI discoverability, machine readability and "
            "agent accessibility. It does not guarantee compatibility with any specific AI agent.",
            styles["small"],
        )
    )
    story.append(Spacer(1, 6 * mm))
    story.append(
        Paragraph(
            "تنبيه قانوني مهم:\n"
            "هذا التقرير عبارة عن تقييم آلي لمدى امتثال قوائم المنتجات لمتطلبات عرض المنتجات عبر الإنترنت "
            "منصوص عليها في المادة 19 من اللائحة الأوروبية للسلامة العامة للمنتجات (EU) 2023/988 (GPSR).\n\n"
            "يحدد هذا التقييم المشكلات المحتملة في بيانات المنتج استنادًا إلى الأدلة والمعلومات العامة "
            "التي تم اكتشافها في صفحة المنتج.\n\n"
            "هذا التقييم لا يُعد استشارة قانونية ولا يمثل موافقة أو اعتمادًا رسميًا من أي جهة تنظيمية.\n\n"
            "يبقى التاجر مسؤولًا عن ضمان الامتثال الكامل لجميع المتطلبات القانونية والفنية والتنظيمية "
            "المعمول بها.",
            styles["small"],
        )
    )
    doc.build(story)
    return buf.getvalue()


def now_iso() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%d %H:%M UTC")

"""PDF report rendering with ReportLab.

Produces a professional, self-contained audit report:
Executive Summary -> Score -> Category Scores -> Critical Issues ->
Detailed Findings -> Recommendations -> Priority Roadmap -> Appendix.

The report can be rendered in English (default), French or Arabic. Arabic text
is reshaped (Arabic presentation forms) and reordered (Unicode bidi) so it
prints correctly with an RTL-aware font (Amiri). All copy is pulled from
``app.reports.translations`` and analyzer strings are localized through
``app.reports.check_translations`` without changing any stored data.
"""

import io
import logging
import re
from datetime import UTC, datetime
from pathlib import Path

import arabic_reshaper
from bidi.algorithm import get_display
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from app.reports import check_translations
from app.reports.translations import (
    category_label,
    category_status_label,
    check_status_label,
    norm_lang,
    platform_label,
    priority_label,
    rating_label,
    severity_label,
    text,
)

logger = logging.getLogger("auditor.reports")

ACCENT = colors.HexColor("#4f46e5")
DARK = colors.HexColor("#111827")
GREY = colors.HexColor("#6b7280")
LIGHT = colors.HexColor("#f3f4f6")
RED = colors.HexColor("#dc2626")
AMBER = colors.HexColor("#d97706")
GREEN = colors.HexColor("#16a34a")

_SEVERITY_COLOR = {"CRITICAL": RED, "HIGH": RED, "MEDIUM": AMBER, "LOW": colors.HexColor("#2563eb"), "INFO": GREY}

_FONT_DIR = Path(__file__).resolve().parent / "fonts"
_FONT_REGISTERED = False

# Language -> (regular face, bold face)
_LANG_FONT = {
    "en": ("Helvetica", "Helvetica-Bold"),
    "fr": ("Helvetica", "Helvetica-Bold"),
    "ar": ("Amiri", "Amiri-Bold"),
}

# Arabic glyphs are smaller on the same point size; bump sizes/leading for RTL.
_LANG_SIZES = {
    "en": {"h1": 15, "h2": 12, "body": 9.5, "leading": 14, "small": 8.5, "small_leading": 12},
    "fr": {"h1": 15, "h2": 12, "body": 9.5, "leading": 14, "small": 8.5, "small_leading": 12},
    "ar": {"h1": 16, "h2": 13, "body": 11, "leading": 17, "small": 9.5, "small_leading": 14},
}

_TAG_RE = re.compile(r"(<[^>]+>|&[a-zA-Z#0-9]+;)")

_reshaper = arabic_reshaper.ArabicReshaper(
    configuration={"delete_harakat": False, "support_ligatures": True}
)


def _register_fonts() -> None:
    """Register the Amiri TTF fonts once, with a family mapping so ReportLab's
    ``<b>`` markup resolves to the bold face."""
    global _FONT_REGISTERED
    if _FONT_REGISTERED:
        return
    regular = _FONT_DIR / "Amiri-Regular.ttf"
    bold = _FONT_DIR / "Amiri-Bold.ttf"
    if regular.exists() and bold.exists():
        pdfmetrics.registerFont(TTFont("Amiri", str(regular)))
        pdfmetrics.registerFont(TTFont("Amiri-Bold", str(bold)))
        pdfmetrics.registerFontFamily("Amiri", normal="Amiri", bold="Amiri-Bold", italic="Amiri", boldItalic="Amiri-Bold")
    _FONT_REGISTERED = True


def _process(text_value: str, lang: str) -> str:
    """Shape and reorder text for RTL rendering (Arabic) while preserving the
    ReportLab markup tags and HTML entities intact."""
    if lang != "ar" or not text_value:
        return text_value
    parts = _TAG_RE.split(text_value)
    out = []
    for part in parts:
        if not part:
            continue
        if _TAG_RE.fullmatch(part):
            out.append(part)
        else:
            out.append(get_display(_reshaper.reshape(part)))
    return "".join(out)


def _styles(lang: str) -> dict:
    _register_fonts()
    base = getSampleStyleSheet()
    font, bold = _LANG_FONT[lang]
    sizes = _LANG_SIZES[lang]
    rtl = lang == "ar"
    align_right = 2 if rtl else 0
    return {
        "title": ParagraphStyle(
            "TitleX", parent=base["Title"], fontSize=22, textColor=DARK, spaceAfter=2 * mm,
            fontName=bold, alignment=1 if rtl else 0,
        ),
        "subtitle": ParagraphStyle(
            "SubX", parent=base["Normal"], fontSize=11, textColor=GREY, spaceAfter=6 * mm,
            fontName=font, alignment=align_right,
        ),
        "h1": ParagraphStyle(
            "H1X", parent=base["Heading1"], fontSize=sizes["h1"], textColor=ACCENT,
            spaceBefore=8 * mm, spaceAfter=3 * mm, fontName=bold, alignment=align_right,
        ),
        "h2": ParagraphStyle(
            "H2X", parent=base["Heading2"], fontSize=sizes["h2"], textColor=DARK,
            spaceBefore=4 * mm, spaceAfter=2 * mm, fontName=bold, alignment=align_right,
        ),
        "body": ParagraphStyle(
            "BodyX", parent=base["Normal"], fontSize=sizes["body"], leading=sizes["leading"],
            fontName=font, alignment=align_right,
        ),
        "small": ParagraphStyle(
            "SmallX", parent=base["Normal"], fontSize=sizes["small"], leading=sizes["small_leading"],
            textColor=GREY, fontName=font, alignment=align_right,
        ),
        "score": ParagraphStyle(
            "ScoreX", parent=base["Normal"], fontSize=34, textColor=ACCENT, alignment=1, fontName=bold,
        ),
    }


def _rating_color(rating: str) -> colors.Color:
    return {"CRITICAL": RED, "POOR": AMBER, "MODERATE": AMBER, "GOOD": GREEN, "EXCELLENT": GREEN}.get(rating, GREY)


def _hex(color: colors.Color) -> str:
    """ReportLab's ``hexval()`` returns '0xrrggbb'; ReportLab markup needs '#rrggbb'."""
    return f"#{color.hexval()[2:]}"


def _table_fonts(lang: str) -> tuple[str, str]:
    return _LANG_FONT[lang]


def build_pdf(data: dict, language: str = "en") -> bytes:
    """`data` is the report payload (see services/report_service.py)."""
    lang = norm_lang(language)
    _register_fonts()
    styles = _styles(lang)
    regular, bold = _table_fonts(lang)
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4, leftMargin=16 * mm, rightMargin=16 * mm, topMargin=14 * mm, bottomMargin=14 * mm,
    )
    story: list = []

    # Header
    story.append(Paragraph(_process(text("doc_title", lang), lang), styles["title"]))
    story.append(
        Paragraph(
            _process(
                f"{data.get('target_url', '')} &nbsp;|&nbsp; {data.get('audit_date', '')}",
                lang,
            ),
            styles["subtitle"],
        )
    )

    # 1. Executive summary
    story.append(Paragraph(_process(text("section_exec_summary", lang), lang), styles["h1"]))
    # The stored AI summary is generated in English; only use it for English
    # reports. Other languages fall back to the localized template.
    summary = data.get("ai_summary") if lang == "en" else ""
    if not summary:
        summary = text(
            "exec_summary_fallback",
            lang,
            score=f"{data.get('score', 0):.0f}",
            rating_label=rating_label(data.get("rating", ""), lang),
            fail_count=data.get("counts", {}).get("FAIL", 0),
        )
    story.append(Paragraph(_process(summary, lang), styles["body"]))

    # 2. Overall score
    story.append(Paragraph(_process(text("section_score", lang), lang), styles["h1"]))
    story.append(Paragraph(f"{data.get('score', 0):.0f} / 100", styles["score"]))
    rating = data.get("rating", "")
    rating_line = text(
        "rating_label",
        lang,
        color=_hex(_rating_color(rating)),
        rating_label=rating_label(rating, lang),
    )
    story.append(Paragraph(_process(rating_line, lang), styles["body"]))
    platform = data.get("platform")
    if platform:
        story.append(
            Paragraph(
                _process(text("platform_label", lang, platform=platform_label(str(platform), lang)), lang),
                styles["body"],
            )
        )
    story.append(Spacer(1, 3 * mm))

    # 3. Category scores (table + bars)
    story.append(Paragraph(_process(text("section_categories", lang), lang), styles["h1"]))
    categories = data.get("categories", [])
    rows = [
        [
            text("cat_table_header", lang),
            text("score_table_header", lang),
            text("status_table_header", lang),
        ]
    ]
    for cat in categories:
        rows.append(
            [
                _process(category_label(cat.get("category", ""), lang), lang),
                _process(f"{cat.get('score', 0):.0f}/100", lang),
                _process(category_status_label(cat.get("status", ""), lang), lang),
            ]
        )
    table = Table(rows, colWidths=[90 * mm, 40 * mm, 50 * mm])
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), ACCENT),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), bold),
                ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#e5e7eb")),
                ("BACKGROUND", (0, 1), (-1, -1), colors.white),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT]),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("FONTNAME", (0, 1), (-1, -1), regular),
                ("ALIGN", (0, 0), (-1, -1), "RIGHT" if lang == "ar" else "LEFT"),
            ]
        )
    )
    story.append(table)
    story.append(Spacer(1, 4 * mm))

    # 4. Critical issues
    story.append(Paragraph(_process(text("section_issues", lang), lang), styles["h1"]))
    issues = data.get("issues", [])
    if issues:
        for issue in issues[:10]:
            color = _SEVERITY_COLOR.get(issue.get("severity", "INFO"), GREY)
            severity = severity_label(issue.get("severity", ""), lang)
            name = check_translations.localize(issue.get("name", ""), lang)
            cat_label = category_label(issue.get("category_label", ""), lang)
            story.append(
                Paragraph(
                    _process(
                        f"<font color='{_hex(color)}'>[{severity}]</font> "
                        f"<b>{name}</b> &nbsp;({cat_label})",
                        lang,
                    ),
                    styles["h2"],
                )
            )
            desc = check_translations.localize(issue.get("description", "") or "", lang)
            story.append(Paragraph(_process(desc, lang), styles["body"]))
            if issue.get("evidence"):
                story.append(
                    Paragraph(
                        _process(
                            f"<font color='{_hex(GREY)}'>"
                            f"{text('evidence_label', lang)}</font> {issue.get('evidence_text', '')}",
                            lang,
                        ),
                        styles["small"],
                    )
                )
            if issue.get("recommendation"):
                fix = text(
                    "fix_label",
                    lang,
                    recommendation=check_translations.localize(issue["recommendation"], lang),
                )
                story.append(Paragraph(_process(fix, lang), styles["small"]))
            story.append(Spacer(1, 2 * mm))
    else:
        story.append(Paragraph(_process(text("no_issues", lang), lang), styles["body"]))

    story.append(PageBreak())

    # 5. Detailed findings
    story.append(Paragraph(_process(text("section_findings", lang), lang), styles["h1"]))
    findings = data.get("findings", [])
    if findings:
        rows = [
            [
                text("check_table_header", lang),
                text("cat_table_header", lang),
                text("status_table_header", lang),
                text("severity_table_header", lang),
                text("score_table_header", lang),
            ]
        ]
        for f in findings:
            rows.append(
                [
                    _process(check_translations.localize(f.get("name", ""), lang), lang),
                    _process(category_label(f.get("category", ""), lang), lang),
                    _process(check_status_label(f.get("status", ""), lang), lang),
                    _process(severity_label(f.get("severity", ""), lang), lang),
                    _process(f"{f.get('score', 0):.0f}", lang),
                ]
            )
        t2 = Table(rows, colWidths=[60 * mm, 30 * mm, 22 * mm, 22 * mm, 18 * mm])
        t2.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), DARK),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                    ("FONTNAME", (0, 0), (-1, 0), bold),
                    ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#e5e7eb")),
                    ("FONTSIZE", (0, 0), (-1, -1), 8),
                    ("FONTNAME", (0, 1), (-1, -1), regular),
                    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT]),
                    ("ALIGN", (0, 0), (-1, -1), "RIGHT" if lang == "ar" else "LEFT"),
                ]
            )
        )
        story.append(t2)
    else:
        story.append(Paragraph(_process(text("no_findings", lang), lang), styles["body"]))

    # 6. Recommendations
    story.append(Paragraph(_process(text("section_recommendations", lang), lang), styles["h1"]))
    recs = data.get("recommendations", [])
    if recs:
        for i, rec in enumerate(recs, start=1):
            title = check_translations.localize(rec.get("title", ""), lang)
            priority = priority_label(rec.get("priority", ""), lang)
            story.append(
                Paragraph(
                    _process(
                        f"{i}. <b>{title}</b> &nbsp;<font color='{_hex(GREY)}'>({priority})</font>",
                        lang,
                    ),
                    styles["h2"],
                )
            )
            if rec.get("description"):
                desc = check_translations.localize(rec["description"], lang)
                story.append(Paragraph(_process(desc, lang), styles["body"]))
            if rec.get("how_to_fix"):
                how = text("how_label", lang, how_to_fix=check_translations.localize(rec["how_to_fix"], lang))
                story.append(Paragraph(_process(how, lang), styles["small"]))
            story.append(Spacer(1, 2 * mm))
    else:
        story.append(Paragraph(_process(text("no_recommendations", lang), lang), styles["body"]))

    # 7. Priority roadmap
    story.append(Paragraph(_process(text("section_roadmap", lang), lang), styles["h1"]))
    priority_order = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"]
    for severity in priority_order:
        items = [f for f in findings if f.get("severity") == severity and f.get("status") != "PASS"]
        if items:
            story.append(Paragraph(_process(severity_label(severity, lang), lang), styles["h2"]))
            for f in items:
                name = check_translations.localize(f.get("name", ""), lang)
                story.append(Paragraph(_process(f"&bull; {name}", lang), styles["small"]))
    story.append(Paragraph(_process(text("priority_roadmap_note", lang), lang), styles["small"]))
    story.append(PageBreak())

    # 8. Appendix
    story.append(Paragraph(_process(text("section_appendix", lang), lang), styles["h1"]))
    pages_analyzed = text(
        "pages_analyzed",
        lang,
        pages=data.get("coverage", {}).get("pages", 0),
        checks=data.get("counts", {}),
    )
    story.append(Paragraph(_process(pages_analyzed, lang), styles["body"]))
    pages = data.get("pages", [])
    if pages:
        rows = [
            [
                text("url_table_header", lang),
                text("status_table_header", lang),
                text("time_table_header", lang),
                text("words_table_header", lang),
            ]
        ]
        for p in pages[:40]:
            rows.append(
                [
                    _process(p.get("url", ""), lang),
                    _process(str(p.get("status_code", "")), lang),
                    _process(f"{p.get('response_time_ms', 0)}ms", lang),
                    _process(str(p.get("word_count", 0)), lang),
                ]
            )
        t3 = Table(rows, colWidths=[90 * mm, 25 * mm, 25 * mm, 22 * mm])
        t3.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), DARK),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                    ("FONTNAME", (0, 0), (-1, 0), bold),
                    ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#e5e7eb")),
                    ("FONTSIZE", (0, 0), (-1, -1), 7.5),
                    ("FONTNAME", (0, 1), (-1, -1), regular),
                    ("WORDWRAP", (0, 0), (-1, -1), True),
                    ("ALIGN", (0, 0), (-1, -1), "RIGHT" if lang == "ar" else "LEFT"),
                ]
            )
        )
        story.append(t3)

    story.append(Spacer(1, 6 * mm))
    story.append(
        Paragraph(_process(text("footer_disclaimer", lang), lang), styles["small"])
    )
    story.append(Spacer(1, 6 * mm))
    story.append(
        Paragraph(_process(text("legal_notice_gpsr", lang), lang), styles["small"])
    )
    doc.build(story)
    return buf.getvalue()


def now_iso() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%d %H:%M UTC")
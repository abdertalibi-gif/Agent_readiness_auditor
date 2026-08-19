"""Multilingual catalog for the generated PDF report.

The stored audit data (check names, descriptions, recommendations, categories,
ratings) is authored in English. This module provides display-time translations
so a report can be generated in the user's current language without changing
any persisted data (backward compatible).

Supported languages: en (source), fr, ar. Anything else falls back to English.
"""

from __future__ import annotations

SUPPORTED_PDF_LANGS = ("en", "fr", "ar")


def norm_lang(language: str | None) -> str:
    """Normalize a requested language to one of the supported PDF languages."""
    if language and language.lower() in SUPPORTED_PDF_LANGS:
        return language.lower()
    return "en"


# ---------------------------------------------------------------------------
# Static PDF copy (titles, section headers, labels, footer)
# ---------------------------------------------------------------------------

PDF_TEXT: dict[str, dict[str, str]] = {
    "doc_title": {
        "en": "Agent-Readiness Auditor",
        "fr": "Agent-Readiness Auditor",
        "ar": "مدقّق جاهزية الوكلاء الذكيين",
    },
    "report_subtitle": {
        "en": "Agent Readiness Report",
        "fr": "Rapport de préparation des agents",
        "ar": "تقرير جاهزية الوكلاء الذكيين",
    },
    "section_exec_summary": {
        "en": "1. Executive Summary",
        "fr": "1. Résumé exécutif",
        "ar": "١. الملخص التنفيذي",
    },
    "section_score": {
        "en": "2. Overall Agent Readiness Score",
        "fr": "2. Score global de préparation des agents",
        "ar": "٢. النتيجة الإجمالية لجاهزية الوكلاء",
    },
    "section_categories": {
        "en": "3. Category Scores",
        "fr": "3. Scores par catégorie",
        "ar": "٣. نتائج الفئات",
    },
    "section_issues": {
        "en": "4. Critical Issues & High Priorities",
        "fr": "4. Problèmes critiques et priorités élevées",
        "ar": "٤. المشاكل الحرجة والأولويات العالية",
    },
    "section_findings": {
        "en": "5. Detailed Findings",
        "fr": "5. Constatations détaillées",
        "ar": "٥. النتائج التفصيلية",
    },
    "section_recommendations": {
        "en": "6. Recommendations",
        "fr": "6. Recommandations",
        "ar": "٦. التوصيات",
    },
    "section_roadmap": {
        "en": "7. Priority Roadmap",
        "fr": "7. Feuille de route prioritaire",
        "ar": "٧. خارطة الطريق حسب الأولوية",
    },
    "section_appendix": {
        "en": "8. Appendix",
        "fr": "8. Annexe",
        "ar": "٨. الملحق",
    },
    "exec_summary_fallback": {
        "en": (
            "The website scored <b>{score}/100</b> (<b>{rating_label}</b>) for Agent Readiness. "
            "Priority: address the {fail_count} failed checks to improve discoverability, "
            "structure and machine readability."
        ),
        "fr": (
            "Le site a obtenu <b>{score}/100</b> (<b>{rating_label}</b>) pour la préparation "
            "aux agents. Priorité : corriger les {fail_count} vérifications échouées pour "
            "améliorer la découvrabilité, la structure et la lisibilité machine."
        ),
        "ar": (
            "حصل الموقع على <b>{score}/100</b> (<b>{rating_label}</b>) في جاهزية الوكلاء. "
            "الأولوية: معالجة الفحوصات الـ {fail_count} الفاشلة لتحسين قابلية الاكتشاف "
            "والبنية وسهولة القراءة الآلية."
        ),
    },
    "rating_label": {
        "en": "Rating: <b><font color='{color}'>{rating_label}</font></b>",
        "fr": "Note : <b><font color='{color}'>{rating_label}</font></b>",
        "ar": "التقييم: <b><font color='{color}'>{rating_label}</font></b>",
    },
    "platform_label": {
        "en": "Platform: <b>{platform}</b>",
        "fr": "Plateforme : <b>{platform}</b>",
        "ar": "المنصة: <b>{platform}</b>",
    },
    "evidence_label": {
        "en": "Evidence:",
        "fr": "Preuve :",
        "ar": "الدليل:",
    },
    "fix_label": {
        "en": "<b>Fix:</b> {recommendation}",
        "fr": "<b>Correctif :</b> {recommendation}",
        "ar": "<b>الإصلاح:</b> {recommendation}",
    },
    "no_issues": {
        "en": "No critical or high-priority issues found.",
        "fr": "Aucun problème critique ou de priorité élevée détecté.",
        "ar": "لم يتم العثور على مشاكل حرجة أو ذات أولوية عالية.",
    },
    "no_findings": {
        "en": "No findings recorded.",
        "fr": "Aucune constatation enregistrée.",
        "ar": "لا توجد نتائج مسجلة.",
    },
    "how_label": {
        "en": "<b>How:</b> {how_to_fix}",
        "fr": "<b>Comment :</b> {how_to_fix}",
        "ar": "<b>كيف:</b> {how_to_fix}",
    },
    "no_recommendations": {
        "en": "No recommendations generated.",
        "fr": "Aucune recommandation générée.",
        "ar": "لم يتم توليد أي توصيات.",
    },
    "pages_analyzed": {
        "en": "Pages analyzed: <b>{pages}</b>. Checks: {checks}.",
        "fr": "Pages analysées : <b>{pages}</b>. Vérifications : {checks}.",
        "ar": "الصفحات التي تم تحليلها: <b>{pages}</b>. الفحوصات: {checks}.",
    },
    "footer_disclaimer": {
        "en": (
            "This report measures Agent Readiness, AI discoverability, machine readability "
            "and agent accessibility. It does not guarantee compatibility with any specific AI agent."
        ),
        "fr": (
            "Ce rapport mesure la préparation aux agents, la découvrabilité IA, la lisibilité "
            "machine et l'accessibilité aux agents. Il ne garantit pas la compatibilité avec un agent IA spécifique."
        ),
        "ar": (
            "يقيس هذا التقرير جاهزية الوكلاء، وقابلية الاكتشاف الذكية، وسهولة القراءة الآلية، "
            "وإمكانية وصول الوكلاء. ولا يضمن التوافق مع أي وكيل ذكاء اصطناعي محدد."
        ),
    },
    "legal_notice": {
        "en": (
            "Important legal notice: This report is an automated technical analysis and does "
            "not constitute professional legal advice."
        ),
        "fr": (
            "Avis juridique important : ce rapport est une analyse technique automatisée et "
            "ne constitue pas un conseil juridique professionnel."
        ),
        "ar": (
            "تنبيه قانوني مهم: هذا التقرير تحليل تقني آلي ولا يُعدّ استشارة قانونية مهنية."
        ),
    },
    "cat_table_header": {
        "en": "Category",
        "fr": "Catégorie",
        "ar": "الفئة",
    },
    "score_table_header": {
        "en": "Score",
        "fr": "Score",
        "ar": "النتيجة",
    },
    "status_table_header": {
        "en": "Status",
        "fr": "Statut",
        "ar": "الحالة",
    },
    "check_table_header": {
        "en": "Check",
        "fr": "Vérification",
        "ar": "الفحص",
    },
    "severity_table_header": {
        "en": "Severity",
        "fr": "Gravité",
        "ar": "الخطورة",
    },
    "url_table_header": {
        "en": "URL",
        "fr": "URL",
        "ar": "الرابط",
    },
    "time_table_header": {
        "en": "Time",
        "fr": "Temps",
        "ar": "الوقت",
    },
    "words_table_header": {
        "en": "Words",
        "fr": "Mots",
        "ar": "الكلمات",
    },
    "priority_roadmap_note": {
        "en": "Priorities are ordered from highest to lowest impact.",
        "fr": "Les priorités sont classées de l'impact le plus élevé au plus faible.",
        "ar": "تُرتَّب الأولويات من الأعلى تأثيراً إلى الأدنى.",
    },
}


# ---------------------------------------------------------------------------
# Structured value translations (ratings, category statuses, severities)
# ---------------------------------------------------------------------------

RATINGS: dict[str, dict[str, str]] = {
    "EXCELLENT": {"en": "Excellent", "fr": "Excellent", "ar": "ممتاز"},
    "GOOD": {"en": "Good", "fr": "Bon", "ar": "جيد"},
    "MODERATE": {"en": "Moderate", "fr": "Modéré", "ar": "متوسط"},
    "POOR": {"en": "Poor", "fr": "Faible", "ar": "ضعيف"},
    "CRITICAL": {"en": "Critical", "fr": "Critique", "ar": "حرج"},
}

CATEGORY_STATUS: dict[str, dict[str, str]] = {
    "good": {"en": "Good", "fr": "Bon", "ar": "جيد"},
    "warning": {"en": "Warning", "fr": "Avertissement", "ar": "تحذير"},
    "critical": {"en": "Critical", "fr": "Critique", "ar": "حرج"},
    "not_measured": {"en": "Not measured", "fr": "Non mesuré", "ar": "غير مُقاس"},
}

CHECK_STATUS: dict[str, dict[str, str]] = {
    "PASS": {"en": "Pass", "fr": "Réussi", "ar": "ناجح"},
    "WARNING": {"en": "Warning", "fr": "Avertissement", "ar": "تحذير"},
    "FAIL": {"en": "Fail", "fr": "Échec", "ar": "فاشل"},
    "NOT_APPLICABLE": {"en": "N/A", "fr": "N/A", "ar": "غير قابل للتطبيق"},
}

SEVERITIES: dict[str, dict[str, str]] = {
    "CRITICAL": {"en": "Critical", "fr": "Critique", "ar": "حرج"},
    "HIGH": {"en": "High", "fr": "Élevée", "ar": "عالية"},
    "MEDIUM": {"en": "Medium", "fr": "Moyenne", "ar": "متوسطة"},
    "LOW": {"en": "Low", "fr": "Faible", "ar": "منخفضة"},
    "INFO": {"en": "Info", "fr": "Info", "ar": "معلومات"},
}

PRIORITIES: dict[str, dict[str, str]] = {
    "CRITICAL": {"en": "Critical", "fr": "Critique", "ar": "حرجة"},
    "HIGH": {"en": "High", "fr": "Élevée", "ar": "عالية"},
    "MEDIUM": {"en": "Medium", "fr": "Moyenne", "ar": "متوسطة"},
    "LOW": {"en": "Low", "fr": "Faible", "ar": "منخفضة"},
    "INFO": {"en": "Info", "fr": "Info", "ar": "معلومات"},
}

CATEGORIES: dict[str, dict[str, str]] = {
    "discoverability": {"en": "Discoverability", "fr": "Découvrabilité", "ar": "قابلية الاكتشاف"},
    "crawlability": {"en": "Crawlability", "fr": "Accessibilité au crawl", "ar": "قابلية الزحف"},
    "semantic_structure": {"en": "Semantic Structure", "fr": "Structure sémantique", "ar": "البنية الدلالية"},
    "structured_data": {"en": "Structured Data", "fr": "Données structurées", "ar": "البيانات المنظمة"},
    "content_accessibility": {"en": "Content Accessibility", "fr": "Accessibilité du contenu", "ar": "إمكانية الوصول للمحتوى"},
    "navigation_linking": {"en": "Navigation & Linking", "fr": "Navigation et liens", "ar": "التنقل والروابط"},
    "technical_quality": {"en": "Technical Quality", "fr": "Qualité technique", "ar": "الجودة التقنية"},
    "performance_accessibility": {"en": "Performance & Accessibility", "fr": "Performance et accessibilité", "ar": "الأداء وإمكانية الوصول"},
}

PLATFORMS: dict[str, dict[str, str]] = {
    "unknown": {"en": "Unknown", "fr": "Inconnue", "ar": "غير معروفة"},
    "wordpress": {"en": "WordPress", "fr": "WordPress", "ar": "ووردبريس"},
    "shopify": {"en": "Shopify", "fr": "Shopify", "ar": "شوبيفاي"},
    "squarespace": {"en": "Squarespace", "fr": "Squarespace", "ar": "سكويرسبيس"},
    "wix": {"en": "Wix", "fr": "Wix", "ar": "ويكس"},
}


def _pick(catalog: dict[str, dict[str, str]], key: str, lang: str) -> str:
    entry = catalog.get(key)
    if not entry:
        return key
    return entry.get(lang) or entry.get("en") or key


def rating_label(rating: str, lang: str) -> str:
    return _pick(RATINGS, rating, lang)


def category_status_label(status: str, lang: str) -> str:
    return _pick(CATEGORY_STATUS, status, lang)


def check_status_label(status: str, lang: str) -> str:
    return _pick(CHECK_STATUS, status, lang)


def severity_label(severity: str, lang: str) -> str:
    return _pick(SEVERITIES, severity, lang)


def priority_label(priority: str, lang: str) -> str:
    return _pick(PRIORITIES, priority, lang)


def category_label(category: str, lang: str) -> str:
    return _pick(CATEGORIES, category, lang)


def platform_label(platform: str, lang: str) -> str:
    key = platform.strip().lower().replace(" ", "")
    return _pick(PLATFORMS, key, lang)


def text(key: str, lang: str, **values: str) -> str:
    template = PDF_TEXT.get(key, {}).get(lang) or PDF_TEXT.get(key, {}).get("en") or key
    if values:
        try:
            return template.format(**values)
        except (KeyError, ValueError):
            return template
    return template
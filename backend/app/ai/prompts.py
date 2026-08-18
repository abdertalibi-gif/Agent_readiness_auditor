"""Prompts for grounded AI analysis.

All prompts instruct the model to reason ONLY from the supplied evidence.
Never instruct the model to invent findings — deterministic checks already
exist; AI is additive.
"""

SYSTEM_BASE = (
    "You are the analysis engine of an 'Agent Readiness' auditor. You help humans "
    "understand why technical findings matter for AI agents (assistants, crawlers, "
    "LLM-powered tools) that must discover, understand, navigate and use a website. "
    "Be specific, factual, concise and grounded ONLY in the evidence provided. "
    "Do not invent facts about the website. Do not claim any AI agent compatibility "
    "can be guaranteed. Never mention that you are an AI model."
)


def explanation_prompt(check_name: str, evidence: dict, why_matters: str | None) -> str:
    return (
        f"Audit finding: {check_name}\n"
        f"Evidence: {_fmt(evidence)}\n"
        f"Context (why this matters): {why_matters or 'General impact on agent usability.'}\n\n"
        "Explain in 2-3 sentences why this finding matters specifically for AI agents, "
        "and what a human should do first. Ground your answer in the evidence only."
    )


def summary_prompt(target_url: str, score: float, rating: str, categories: list[dict], top_issues: list[str]) -> str:
    cat_lines = "\n".join(
        f"- {c['label']}: {c['score']}/100 ({c['status']})" for c in categories
    )
    issues = "\n".join(f"- {i}" for i in top_issues[:8])
    return (
        f"Website audited: {target_url}\n"
        f"Overall Agent Readiness Score: {score}/100 ({rating})\n"
        f"Category scores:\n{cat_lines}\n"
        f"Most important issues:\n{issues}\n\n"
        "Write an executive summary (max 120 words) a business stakeholder can understand. "
        "Focus on the 3 most impactful improvements. Use only the facts above."
    )


def purpose_prompt(target_url: str, text_snippet: str) -> str:
    return (
        f"Website homepage text (first 1500 chars):\n{text_snippet[:1500]}\n\n"
        "Based ONLY on this text, answer in 3 short bullets: "
        "(1) what this company/site appears to do, "
        "(2) whether that is stated clearly or vaguely, "
        "(3) one concrete improvement to make the purpose clearer."
    )


def _fmt(evidence: dict) -> str:
    import json

    return json.dumps(evidence, default=str, ensure_ascii=False)[:1000]

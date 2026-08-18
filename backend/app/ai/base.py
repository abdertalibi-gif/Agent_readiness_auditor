"""AI provider abstraction.

AI is used only where it adds value:
- explaining why an issue matters for AI agents
- assessing whether business information is clearly understandable
- summarizing the audit

Deterministic checks never depend on the AI layer; if AI is unavailable the
audit still completes with engine-generated explanations.
"""

from typing import Protocol


class LLMProvider(Protocol):
    async def complete(self, system: str, user: str, max_tokens: int = 500) -> str: ...


class NoopProvider:
    """Returns empty responses so the pipeline can run without AI."""

    async def complete(self, system: str, user: str, max_tokens: int = 500) -> str:
        return ""


def get_provider() -> LLMProvider:
    from app.config import settings

    if settings.is_ai_enabled and settings.ai_provider == "openai":
        from app.ai.openai_llm import OpenAIProvider

        return OpenAIProvider(api_key=settings.ai_api_key, model=settings.ai_model)
    return NoopProvider()

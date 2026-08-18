"""OpenAI provider. Kept behind the LLMProvider protocol so it can be swapped."""

import logging

from app.config import settings

logger = logging.getLogger("auditor.ai")


class OpenAIProvider:
    def __init__(self, api_key: str, model: str):
        self._api_key = api_key
        self._model = model
        self._client = None

    def _client_factory(self):
        from openai import AsyncOpenAI

        return AsyncOpenAI(api_key=self._api_key)

    async def complete(self, system: str, user: str, max_tokens: int = 500) -> str:
        if self._client is None:
            self._client = self._client_factory()
        resp = await self._client.chat.completions.create(
            model=self._model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            max_tokens=max_tokens,
            temperature=0.2,
            timeout=settings.ai_timeout_seconds,
        )
        return (resp.choices[0].message.content or "").strip()

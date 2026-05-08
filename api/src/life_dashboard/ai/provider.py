"""AI provider abstraction.

AIProvider is a structural Protocol — any object with matching stream_chat and
complete methods satisfies it. This keeps the service layer decoupled from any
specific SDK.

Current implementations: AnthropicProvider.
Planned: OpenAIProvider, OllamaProvider (both will be drop-in replacements).
"""
from __future__ import annotations

from typing import AsyncIterator, Protocol, runtime_checkable


@runtime_checkable
class AIProvider(Protocol):
    """Minimal interface every AI backend must satisfy."""

    def stream_chat(
        self,
        messages: list[dict[str, str]],
        system: str,
        *,
        max_tokens: int = 4096,
    ) -> AsyncIterator[str]:
        """Yield text delta strings as the model generates them.

        Defined as a plain def returning AsyncIterator so both async generator
        functions and regular async methods that return an async iterator
        satisfy the Protocol.
        """
        ...

    async def complete(
        self,
        messages: list[dict[str, str]],
        system: str,
        *,
        max_tokens: int = 1024,
    ) -> str:
        """Non-streaming call; returns the full response text.

        Used for background tasks (e.g. memory refresh) where streaming
        is not needed.
        """
        ...


class AnthropicProvider:
    """Anthropic Claude backend.

    CHAT_MODEL is used for interactive streaming responses.
    FAST_MODEL is used for background non-streaming tasks (memory refresh,
    auto-titling) where cost and latency matter more than capability.
    """

    CHAT_MODEL = "claude-sonnet-4-6"
    FAST_MODEL = "claude-haiku-4-5-20251001"

    def __init__(self, api_key: str) -> None:
        # Import lazily so the module can be imported even if anthropic is not
        # installed (e.g. in test environments that mock the provider).
        from anthropic import AsyncAnthropic
        self._client = AsyncAnthropic(api_key=api_key)

    async def stream_chat(
        self,
        messages: list[dict[str, str]],
        system: str,
        *,
        max_tokens: int = 4096,
    ) -> AsyncIterator[str]:  # type: ignore[override]
        """Async generator that yields text deltas from the streaming API."""
        async with self._client.messages.stream(
            model=self.CHAT_MODEL,
            max_tokens=max_tokens,
            system=system,
            messages=messages,  # type: ignore[arg-type]
        ) as stream:
            async for text in stream.text_stream:
                yield text

    async def complete(
        self,
        messages: list[dict[str, str]],
        system: str,
        *,
        max_tokens: int = 1024,
    ) -> str:
        response = await self._client.messages.create(
            model=self.FAST_MODEL,
            max_tokens=max_tokens,
            system=system,
            messages=messages,  # type: ignore[arg-type]
        )
        if response.content and hasattr(response.content[0], "text"):
            return response.content[0].text
        return ""

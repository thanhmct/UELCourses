"""Pluggable LLM providers (Ollama / Claude / None). Selected by env LLM_PROVIDER."""
from __future__ import annotations

import os


class ProviderError(Exception):
    pass


class LLMProvider:
    name = "base"

    def available(self) -> bool:
        return True

    def generate(self, system: str, prompt: str) -> str:  # pragma: no cover - interface
        raise NotImplementedError


class NoneProvider(LLMProvider):
    name = "none"

    def available(self) -> bool:
        return False

    def generate(self, system: str, prompt: str) -> str:
        raise ProviderError("Chưa cấu hình LLM (LLM_PROVIDER=none).")


class OllamaProvider(LLMProvider):
    name = "ollama"

    def __init__(self, url: str | None = None, model: str | None = None, timeout: float = 120.0) -> None:
        self.url = (url or os.getenv("OLLAMA_URL") or "http://localhost:11434").rstrip("/")
        self.model = model or os.getenv("OLLAMA_MODEL") or "qwen2.5:7b-instruct"
        self.timeout = timeout

    def generate(self, system: str, prompt: str) -> str:
        import httpx

        try:
            r = httpx.post(
                f"{self.url}/api/chat",
                json={
                    "model": self.model,
                    "messages": [{"role": "system", "content": system}, {"role": "user", "content": prompt}],
                    "stream": False,
                    "format": "json",
                    "options": {"temperature": 0},
                },
                timeout=self.timeout,
            )
            r.raise_for_status()
            return r.json()["message"]["content"]
        except Exception as exc:  # noqa: BLE001
            raise ProviderError(f"Ollama lỗi: {exc}") from exc


class ClaudeProvider(LLMProvider):
    name = "claude"
    DEFAULT_MODEL = "claude-sonnet-5-5"

    def __init__(self, api_key: str | None = None, model: str | None = None, client=None) -> None:
        self.api_key = api_key or os.getenv("ANTHROPIC_API_KEY")
        self.model = model or os.getenv("CLAUDE_MODEL") or self.DEFAULT_MODEL
        self._client = client

    def available(self) -> bool:
        return bool(self.api_key) or self._client is not None

    def generate(self, system: str, prompt: str) -> str:
        if not self.available():
            raise ProviderError("Thiếu ANTHROPIC_API_KEY.")
        try:
            if self._client is None:
                import anthropic

                self._client = anthropic.Anthropic(api_key=self.api_key)
            msg = self._client.messages.create(
                model=self.model,
                max_tokens=1500,
                system=system,
                messages=[{"role": "user", "content": prompt}],
            )
            return "".join(getattr(b, "text", "") for b in msg.content if getattr(b, "type", "") == "text")
        except ProviderError:
            raise
        except Exception as exc:  # noqa: BLE001
            raise ProviderError(f"Claude API lỗi: {exc}") from exc


def get_provider(name: str | None = None) -> LLMProvider:
    name = (name or os.getenv("LLM_PROVIDER") or "none").strip().lower()
    if name == "ollama":
        return OllamaProvider()
    if name in ("claude", "anthropic"):
        return ClaudeProvider()
    return NoneProvider()

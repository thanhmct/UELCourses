"""Pluggable LLM providers (Ollama / Claude / Codex/OpenAI / None)."""
from __future__ import annotations

import os
import re

from app.config import get_settings


class ProviderError(Exception):
    def __init__(self, message: str = "Nhà cung cấp AI không phản hồi.", *, retryable: bool = False):
        super().__init__(message)
        self.retryable = retryable


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

    def __init__(self, url: str | None = None, model: str | None = None, timeout: float | None = None) -> None:
        self.url = (url or os.getenv("OLLAMA_URL") or "http://localhost:11434").rstrip("/")
        self.model = model or os.getenv("OLLAMA_MODEL") or "qwen2.5:7b-instruct"
        self.timeout = timeout or get_settings().llm_timeout_seconds

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
                    "options": {"temperature": 0, "num_predict": get_settings().llm_max_tokens},
                },
                timeout=self.timeout,
            )
            r.raise_for_status()
            return r.json()["message"]["content"]
        except Exception:  # noqa: BLE001
            raise ProviderError() from None


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

                self._client = anthropic.Anthropic(
                    api_key=self.api_key, timeout=get_settings().llm_timeout_seconds, max_retries=0,
                )
            msg = self._client.messages.create(
                model=self.model,
                max_tokens=get_settings().llm_max_tokens,
                system=system,
                messages=[{"role": "user", "content": prompt}],
            )
            return "".join(getattr(b, "text", "") for b in msg.content if getattr(b, "type", "") == "text")
        except ProviderError:
            raise
        except Exception:  # noqa: BLE001
            raise ProviderError() from None


class CodexProvider(LLMProvider):
    name = "codex"
    DEFAULT_MODEL = "gpt-6-sol"
    DEFAULT_BASE_URL = "https://api.openai.com/v1"

    def __init__(
        self,
        api_key: str | None = None,
        model: str | None = None,
        base_url: str | None = None,
        timeout: float | None = None,
        client=None,
    ) -> None:
        self.api_key = api_key or os.getenv("CODEX_API_KEY")
        self.model = model or os.getenv("CODEX_MODEL") or self.DEFAULT_MODEL
        self.base_url = (base_url or os.getenv("CODEX_BASE_URL") or self.DEFAULT_BASE_URL).rstrip("/")
        self.timeout = timeout or get_settings().llm_timeout_seconds
        self._client = client

    def available(self) -> bool:
        return bool(self.api_key) or self._client is not None

    def _reasoning_model(self) -> bool:
        return bool(re.match(r"^(?:gpt-(?:[5-9]|\d{2})|o\d)", self.model))

    def generate(self, system: str, prompt: str) -> str:
        import httpx

        if not self.available():
            raise ProviderError("Thiếu CODEX_API_KEY.")
        payload = {
            "model": self.model,
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": prompt}],
            "response_format": {"type": "json_object"},
        }
        if self._reasoning_model():
            # gpt-5+/o-series reject max_tokens and non-default temperature.
            payload["max_completion_tokens"] = get_settings().llm_max_tokens
            payload["reasoning_effort"] = os.getenv("CODEX_REASONING_EFFORT") or "low"
        else:
            payload["temperature"] = 0
            payload["max_tokens"] = get_settings().llm_max_tokens
        try:
            if self._client is not None:
                response = self._client.chat.completions.create(**payload, timeout=self.timeout)
                return response.choices[0].message.content
            response = httpx.post(
                f"{self.base_url}/chat/completions",
                headers={"Authorization": f"Bearer {self.api_key}"},
                json=payload,
                timeout=self.timeout,
            )
            response.raise_for_status()
            return response.json()["choices"][0]["message"]["content"]
        except (httpx.TimeoutException, httpx.NetworkError):
            raise ProviderError(retryable=True) from None
        except httpx.HTTPStatusError as exc:
            raise ProviderError(retryable=exc.response.status_code in {429, 500, 502, 503, 504}) from None
        except Exception:  # noqa: BLE001
            raise ProviderError() from None


def get_provider(name: str | None = None) -> LLMProvider:
    settings = get_settings()
    name = (name or os.getenv("LLM_PROVIDER") or settings.llm_provider).strip().lower()
    if name == "ollama":
        return OllamaProvider(os.getenv("OLLAMA_URL") or settings.ollama_url,
                              os.getenv("OLLAMA_MODEL") or settings.ollama_model)
    if name in ("claude", "anthropic"):
        return ClaudeProvider(os.getenv("ANTHROPIC_API_KEY", settings.anthropic_api_key),
                              os.getenv("CLAUDE_MODEL") or settings.claude_model)
    if name in ("codex", "openai"):
        return CodexProvider(os.getenv("CODEX_API_KEY", settings.codex_api_key),
                             os.getenv("CODEX_MODEL") or settings.codex_model,
                             os.getenv("CODEX_BASE_URL") or settings.codex_base_url)
    return NoneProvider()

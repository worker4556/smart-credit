"""Клиент локальной LLM с открытыми весами (Ollama). Опционален: без него всё работает на правилах и шаблонах."""
from __future__ import annotations

import json
import logging
import os

import httpx

log = logging.getLogger(__name__)

OLLAMA_URL = os.getenv("OLLAMA_URL", "")  # пусто — LLM выключен
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen3:4b")
LLM_TIMEOUT = float(os.getenv("LLM_TIMEOUT_SECONDS", "8"))


def enabled() -> bool:
    return bool(OLLAMA_URL)


def status() -> dict:
    return {"enabled": enabled(), "model": OLLAMA_MODEL if enabled() else None}


def chat(system: str, user: str, schema: dict | None = None, temperature: float = 0.1) -> str | dict | None:
    """Один запрос к /api/chat. schema — JSON Schema для структурированного ответа. Любая ошибка → None."""
    if not enabled():
        return None
    body = {
        "model": OLLAMA_MODEL,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        "stream": False,
        "think": False,
        "options": {"temperature": temperature},
    }
    if schema:
        body["format"] = schema
    try:
        resp = httpx.post(f"{OLLAMA_URL}/api/chat", json=body, timeout=LLM_TIMEOUT)
        resp.raise_for_status()
        content = resp.json().get("message", {}).get("content", "").strip()
        if not content:
            return None
        return json.loads(content) if schema else content
    except Exception as exc:  # LLM опционален: таймаут, нет модели, битый JSON → запасной путь
        log.warning("LLM unavailable, falling back: %s", exc)
        return None

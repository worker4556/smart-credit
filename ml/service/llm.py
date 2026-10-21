"""Клиент локальной LLM с открытыми весами (Ollama). Опционален: без него всё работает на правилах и шаблонах."""
from __future__ import annotations

import json
import logging
import os
import time

import httpx

log = logging.getLogger(__name__)

OLLAMA_URL = os.getenv("OLLAMA_URL", "")  # пусто — LLM выключен
DEFAULT_MODEL = "qwen3:1.7b"                                            # открытые веса, Apache 2.0
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", DEFAULT_MODEL)
TEXT_TIMEOUT = float(os.getenv("LLM_TEXT_TIMEOUT_SECONDS", "30"))      # пересказ и помощник
INTENT_TIMEOUT = float(os.getenv("LLM_INTENT_TIMEOUT_SECONDS", "15"))  # разбор фразы клиента
READY_TTL = 10.0                                                       # кэш проверки готовности, с

_ready_cache: dict[str, tuple[float, bool]] = {}


def enabled() -> bool:
    return bool(OLLAMA_URL)


def ready() -> bool:
    """Модель скачана и видна Ollama. Пока качается — False, и все тексты идут из шаблонов."""
    if not enabled():
        return False
    key = f"{OLLAMA_URL}|{OLLAMA_MODEL}"
    cached = _ready_cache.get(key)
    if cached and time.monotonic() - cached[0] < READY_TTL:
        return cached[1]
    try:
        resp = httpx.get(f"{OLLAMA_URL}/api/tags", timeout=2)
        resp.raise_for_status()
        names = {m.get("name") for m in resp.json().get("models", [])}
        ok = OLLAMA_MODEL in names or f"{OLLAMA_MODEL}:latest" in names
    except Exception:
        ok = False
    _ready_cache[key] = (time.monotonic(), ok)
    return ok


def reset_ready_cache() -> None:
    _ready_cache.clear()


def status() -> dict:
    return {"enabled": enabled(), "ready": ready(), "model": OLLAMA_MODEL if enabled() else None}


def chat(system: str, user: str, schema: dict | None = None, temperature: float = 0.1,
         timeout: float | None = None, max_tokens: int = 200) -> str | dict | None:
    """Один запрос к /api/chat. schema — JSON Schema для структурированного ответа. Любая ошибка → None."""
    if not ready():
        return None
    body = {
        "model": OLLAMA_MODEL,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        "stream": False,
        "think": False,
        "keep_alive": "24h",
        "options": {"temperature": temperature, "num_ctx": 2048, "num_predict": max_tokens},
    }
    if schema:
        body["format"] = schema
    try:
        resp = httpx.post(f"{OLLAMA_URL}/api/chat", json=body, timeout=timeout or TEXT_TIMEOUT)
        resp.raise_for_status()
        content = resp.json().get("message", {}).get("content", "").strip()
        if not content:
            return None
        return json.loads(content) if schema else content
    except Exception as exc:  # LLM опционален: таймаут, нет модели, битый JSON → запасной путь
        log.warning("LLM unavailable, falling back: %s", exc)
        return None

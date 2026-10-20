"""Клиент Ollama: готовность модели, кэш проверки, параметры для CPU."""
from types import SimpleNamespace

import httpx
from fastapi.testclient import TestClient

from service import llm
from service.main import app

client = TestClient(app)


def fake_tags(monkeypatch, models):
    monkeypatch.setattr(llm, "OLLAMA_URL", "http://fake")
    calls = SimpleNamespace(count=0)

    def get(url, timeout=None):
        calls.count += 1
        assert url == "http://fake/api/tags"
        return httpx.Response(200, json={"models": [{"name": m} for m in models]}, request=httpx.Request("GET", url))
    monkeypatch.setattr(llm.httpx, "get", get)
    return calls


def fake_chat(monkeypatch, reply):
    sent = SimpleNamespace(body=None, timeout=None)

    def post(url, json=None, timeout=None):
        sent.body, sent.timeout = json, timeout
        return httpx.Response(200, json={"message": {"content": reply}}, request=httpx.Request("POST", url))
    monkeypatch.setattr(llm.httpx, "post", post)
    return sent


def test_not_ready_while_model_downloading(monkeypatch):
    fake_tags(monkeypatch, models=[])
    monkeypatch.setattr(llm.httpx, "post", lambda *a, **k: (_ for _ in ()).throw(AssertionError("chat без модели")))
    assert llm.ready() is False
    assert llm.status() == {"enabled": True, "ready": False, "model": llm.OLLAMA_MODEL}
    assert llm.chat("s", "u") is None


def test_ready_is_cached(monkeypatch):
    calls = fake_tags(monkeypatch, models=[llm.OLLAMA_MODEL])
    assert llm.ready() and llm.ready()
    assert calls.count == 1


def test_chat_sends_cpu_options(monkeypatch):
    fake_tags(monkeypatch, models=[llm.OLLAMA_MODEL])
    sent = fake_chat(monkeypatch, reply="ok")
    assert llm.chat("s", "u", max_tokens=150, timeout=7) == "ok"
    assert sent.body["options"]["num_ctx"] == 2048 and sent.body["options"]["num_predict"] == 150
    assert sent.body["keep_alive"] == "24h" and sent.timeout == 7


def test_ollama_down_means_not_ready(monkeypatch):
    monkeypatch.setattr(llm, "OLLAMA_URL", "http://fake")
    monkeypatch.setattr(llm.httpx, "get", lambda *a, **k: (_ for _ in ()).throw(httpx.ConnectError("down")))
    assert llm.ready() is False


def test_health_reports_llm_readiness(monkeypatch):
    fake_tags(monkeypatch, models=[])
    assert client.get("/health").json()["llm"]["ready"] is False


def test_default_timeouts():
    assert (llm.TEXT_TIMEOUT, llm.INTENT_TIMEOUT) == (30.0, 15.0)

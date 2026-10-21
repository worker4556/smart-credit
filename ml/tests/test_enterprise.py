"""Эксплуатация: аудит решений, сквозной request_id, метрики Prometheus, служебный токен."""
import copy

from conftest import PERSONAS
from fastapi.testclient import TestClient

from service import main as ml_main
from service.main import app

client = TestClient(app)


def p(key):
    return copy.deepcopy(PERSONAS[key]["decision"])


# ---------- аудит ----------

def test_decision_has_reproducible_audit():
    a1 = client.post("/v1/decision", json=p("P1")).json()["audit"]
    a2 = client.post("/v1/decision", json=p("P1")).json()["audit"]
    assert a1["policy_version"] == "policy-2026.10-2" and a1["engine_version"]
    assert len(a1["input_hash"]) == 64 and a1["input_hash"] == a2["input_hash"]
    assert a1["decided_at"].endswith("Z")


def test_audit_hash_changes_with_input():
    changed = p("P1")
    changed["request"]["amount"] = 900_000
    assert (client.post("/v1/decision", json=p("P1")).json()["audit"]["input_hash"]
            != client.post("/v1/decision", json=changed).json()["audit"]["input_hash"])


def test_precheck_and_route_are_audited_too():
    assert client.post("/v1/precheck", json=p("P1")).json()["audit"]["input_hash"]
    assert client.post("/v1/route", json={"applicant": p("P3")}).json()["audit"]["input_hash"]


# ---------- request_id ----------

def test_request_id_is_echoed_or_generated():
    r = client.get("/health", headers={"X-Request-ID": "abc-123"})
    assert r.headers["X-Request-ID"] == "abc-123"
    assert len(client.get("/health").headers["X-Request-ID"]) >= 16


# ---------- метрики ----------

def test_metrics_count_decisions_by_outcome():
    client.post("/v1/decision", json=p("P3"))
    text = client.get("/metrics").text
    assert 'ml_decisions_total{outcome="REJECTED"}' in text
    assert "ml_http_requests_total" in text and "ml_http_request_duration_seconds_sum" in text


def test_metrics_count_text_sources():
    d = client.post("/v1/decision", json=p("P3")).json()
    client.post("/v1/explain", json={"decision": d, "use_llm": False})
    assert 'ml_texts_total{source="TEMPLATE"}' in client.get("/metrics").text


# ---------- служебный токен ----------

def test_service_token_required_when_configured(monkeypatch):
    monkeypatch.setattr(ml_main, "SERVICE_TOKEN", "s3cret")
    assert client.post("/v1/decision", json=p("P1")).status_code == 401
    assert client.post("/v1/decision", json=p("P1"), headers={"X-Service-Token": "wrong"}).status_code == 401
    assert client.post("/v1/decision", json=p("P1"), headers={"X-Service-Token": "s3cret"}).status_code == 200
    assert client.get("/health").status_code == 200 and client.get("/metrics").status_code == 200


def test_no_token_configured_means_open(monkeypatch):
    monkeypatch.setattr(ml_main, "SERVICE_TOKEN", "")
    assert client.post("/v1/decision", json=p("P1")).status_code == 200

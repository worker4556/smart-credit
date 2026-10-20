"""HTTP-контракт сервиса (docs/api-contract.md, раздел C)."""
from conftest import PERSONAS, precheck_applicant
from fastapi.testclient import TestClient

from service.main import app

client = TestClient(app)


def test_health():
    body = client.get("/health").json()
    assert body["status"] == "ok" and body["policy_version"]
    assert body["llm"]["enabled"] is False


def test_intent():
    r = client.post("/v1/intent", json={"text": "нужно 800 тыс. на закупку к сезону", "use_llm": False})
    assert r.status_code == 200
    assert r.json()["amount"] == 800_000 and r.json()["product"] == "WORKING_CAPITAL"


def test_precheck():
    r = client.post("/v1/precheck", json=precheck_applicant("P2").model_dump())
    assert r.status_code == 200
    body = r.json()
    assert body["chance"] == "MEDIUM" and body["valid_days"] == 30 and "не решение банка" in body["disclaimer"]


def test_decision_with_offers():
    body = client.post("/v1/decision", json=PERSONAS["P1"]["decision"]).json()
    assert body["outcome"] == "APPROVED" and body["cost"]["full_cost"] == 196_774
    assert body["offers"][0]["kind"] == "REQUESTED"


def test_route_and_recalculate():
    a = PERSONAS["P3"]["decision"]
    first = client.post("/v1/route", json={"applicant": a}).json()
    again = client.post("/v1/route", json={"applicant": a, "assume_done": ["S_TAX"]}).json()
    assert first["projection"]["score"] == 77
    assert "S_TAX" not in [s["code"] for s in again["steps"]]


def test_explain_decision():
    d = client.post("/v1/decision", json=PERSONAS["P3"]["decision"]).json()
    e = client.post("/v1/explain", json={"decision": d, "use_llm": False}).json()
    assert e["source"] == "TEMPLATE" and "налоговая задолженность" in e["text"]


def test_explain_requires_payload():
    assert client.post("/v1/explain", json={}).status_code == 422


def test_reasons_dictionary():
    items = {i["code"] for i in client.get("/v1/reasons").json()["items"]}
    assert {"B_TURNOVER", "S_TAX", "S_90_12", "L_TURNOVER", "D_MISMATCH", "D_DOC"} <= items


def test_validation_error():
    assert client.post("/v1/decision", json={"request": {"product": "LEASING", "amount": 1}}).status_code == 422


def test_quote_endpoint():
    body = client.post("/v1/quote", json={"product": "WORKING_CAPITAL", "amount": 850000, "term_months": 24}).json()
    assert body["monthly_payment"] == 43_261 and len(body["schedule"]) == 24


def test_route_rejects_unknown_specialist_code():
    r = client.post("/v1/route", json={"applicant": PERSONAS["P1"]["decision"],
                                       "specialist_decision": {"outcome": "REJECTED", "reason_code": "NOPE"}})
    assert r.status_code == 422

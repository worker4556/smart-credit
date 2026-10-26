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


def _p1(**req):
    body = PERSONAS["P1"]["decision"]
    return {**body, "request": {**body["request"], **req}}


def test_term_outside_range_is_422_not_clamped():
    for path in ("/v1/precheck", "/v1/decision", "/v1/score", "/v1/limit"):
        r = client.post(path, json=_p1(term_months=60))
        assert r.status_code == 422, path
        err = r.json()["detail"][0]
        assert err["loc"] == ["body", "request", "term_months"] and "от 3 до 36" in err["msg"]


def test_amount_below_minimum_is_422():
    r = client.post("/v1/decision", json=_p1(amount=50_000))
    assert r.status_code == 422 and r.json()["detail"][0]["loc"][-1] == "amount"


def test_route_and_quote_validate_term():
    r = client.post("/v1/route", json={"applicant": _p1(term_months=60)})
    assert r.status_code == 422 and r.json()["detail"][0]["loc"] == ["body", "applicant", "request", "term_months"]
    q = client.post("/v1/quote", json={"product": "WORKING_CAPITAL", "amount": 850_000, "term_months": 60})
    assert q.status_code == 422
    assert client.post("/v1/quote", json={"product": "OVERDRAFT", "amount": 300_000, "term_months": 6}).status_code == 422


def test_new_application_after_route_counts_completed_steps():
    # P3: маршрут пройден (налоговый долг погашен и т. д.) — новая заявка оценивается с учётом этих шагов
    a = PERSONAS["P3"]["decision"]
    route = client.post("/v1/route", json={"applicant": a}).json()
    done = [s["code"] for s in route["steps"]]
    before = client.post("/v1/decision", json=a).json()
    after = client.post("/v1/decision", json={**a, "assume_done": done}).json()
    assert before["outcome"] == "REJECTED"
    assert after["outcome"] != "REJECTED" and after["score"]["score"] > before["score"]["score"]


def test_turnover_growth_step_reaches_requested_amount():
    # P3: после всех шагов сумму держит оборот — отмеченный рост оборота открывает запрошенную сумму
    a = PERSONAS["P3"]["decision"]
    done = [s["code"] for s in client.post("/v1/route", json={"applicant": a}).json()["steps"]]
    route = client.post("/v1/route", json={"applicant": a, "assume_done": done}).json()
    assert [s["code"] for s in route["steps"]] == ["L_TURNOVER"]
    final = client.post("/v1/route", json={"applicant": a, "assume_done": done + ["L_TURNOVER"]}).json()
    assert final["status"] == "READY"
    after = client.post("/v1/decision", json={**a, "assume_done": done + ["L_TURNOVER"]}).json()
    assert after["outcome"] == "APPROVED" and after["amount"] == a["request"]["amount"]

import pytest
from fastapi.testclient import TestClient

from service.features import FEATURES, ScoringFeatures, derive
from service.main import app
from service.scorecard import load_scorecard

client = TestClient(app)

SOKOLOVA = dict(legal_form="IP", okved="56.10", company_age_months=25, annual_revenue=4_800_000,
                requested_amount=1_500_000, term_months=36, product_code="EQUIPMENT",
                active_loans_count=1, existing_monthly_payments=60_000)
VECTOR = dict(legal_form="OOO", okved="46.90", company_age_months=79, annual_revenue=48_000_000,
              requested_amount=5_000_000, term_months=36, active_loans_count=1,
              existing_monthly_payments=120_000, revenue_confirmed=True)


def score(**overrides):
    return load_scorecard().score(ScoringFeatures(**{**SOKOLOVA, **overrides}))


def test_health():
    body = client.get("/health").json()
    assert body["status"] == "ok"
    assert body["model_version"] == "scorecard-1.0"


def test_every_bin_has_points():
    sc = load_scorecard()
    for f in FEATURES:
        assert set(sc.points[f.name]) == set(f.bins), f.name
        assert sc.points[f.name][f.reference] == 0


@pytest.mark.parametrize("field,worse,better", [
    ("max_dpd_12m", 95, 0),
    ("tax_debt", 200_000, 0),
    ("mass_address", True, False),
    ("company_age_months", 3, 60),
    ("requested_amount", 4_000_000, 500_000),
])
def test_risk_direction(field, worse, better):
    assert score(**{field: worse})["score"] < score(**{field: better})["score"]


def test_pd_is_consistent_with_grade():
    r = score()
    assert 0 < r["pd"] < 1
    assert r["grade"] in "ABCDE"
    assert sum(f["points"] for f in r["factors"]) + load_scorecard().base_points == r["score"]


def test_demo_personas():
    assert client.post("/v1/score", json={"features": VECTOR}).json()["grade"] == "A"
    assert client.post("/v1/score", json={"features": {**SOKOLOVA, "max_dpd_12m": 95}}).json()["chance"] == "LOW"


def test_precheck_suggests_revenue_confirmation_for_sokolova():
    r = client.post("/v1/precheck", json={"features": SOKOLOVA, "max_term_months": 60}).json()
    assert r["chance"] == "MEDIUM"
    kinds = {("revenue" if h["change"].get("revenue_confirmed") else "amount" if h["change"].get("amount") else "term") for h in r["hints"]}
    assert "revenue" in kinds
    assert all(h["chance_percent"] > r["chance_percent"] for h in r["hints"])


def test_debt_burden_uses_annuity():
    d = derive(ScoringFeatures(**SOKOLOVA))
    assert 50_000 < d["_monthly_payment"] < 60_000
    assert d["debt_burden"] == pytest.approx((60_000 + d["_monthly_payment"]) / 400_000, rel=1e-3)


def test_validation_error():
    assert client.post("/v1/score", json={"features": {**SOKOLOVA, "requested_amount": -1}}).status_code == 422


def test_recommend_moves_fitting_product_up():
    items = client.post("/v1/recommend", json={"purpose": "CASH_GAP", "amount": 5_000_000, "term_months": 12}).json()["items"]
    assert items[0]["product_code"] == "CREDIT_LINE" and items[0]["fit"] == "BEST"


def test_explain_falls_back_to_template():
    r = client.post("/v1/explain", json={"outcome": "COUNTER_OFFER", "requested_amount": 1_500_000,
                                         "offer": {"amount": 1_150_000, "term_months": 36, "rate": 19.5},
                                         "reasons": ["AMOUNT_ABOVE_LIMIT"]}).json()
    assert r["source"] == "TEMPLATE"
    assert "1 150 000 ₽" in r["text"]
    assert r["recommendations"]

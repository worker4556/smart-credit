"""«Погода»: стоимость в рублях при росте ставки и при просрочке. На решение не влияет."""
from conftest import applicant, precheck_applicant
from fastapi.testclient import TestClient

from service.decision import decide, offers, precheck
from service.finance import weather
from service.main import app

client = TestClient(app)


def test_weather_working_capital_p1(policy):
    w = weather(policy, "WORKING_CAPITAL", 850_000, 24)
    rows = {r.code: r for r in w.rows}
    assert (rows["BASE"].monthly_payment, rows["BASE"].full_cost) == (43_261, 196_774)
    assert (rows["RATE_UP"].rate, rows["RATE_UP"].monthly_payment, rows["RATE_UP"].full_cost) == (22.0, 44_096, 216_814)
    assert rows["RATE_UP"].delta_full_cost == 20_040
    assert rows["OVERDUE_30"].full_cost == 196_774 + 1_298
    assert rows["OVERDUE_30"].note.startswith("Просрочка попадёт")
    assert w.disclaimer == "Это иллюстрация рисков, а не условия банка."


def test_weather_overdraft_p5(policy):
    rows = {r.code: r for r in weather(policy, "OVERDRAFT", 300_000, None).rows}
    assert (rows["BASE"].monthly_payment, rows["BASE"].full_cost) == (5_425, 69_000)
    assert (rows["RATE_UP"].monthly_payment, rows["RATE_UP"].full_cost) == (5_918, 75_000)
    assert rows["OVERDUE_30"].full_cost == 69_000 + 9_000


def test_weather_uses_decision_rate_and_absent_without_amount(policy):
    d = decide(policy, applicant("P2"))
    assert d.weather.rows[0].rate == d.cost.rate and d.weather.rows[0].full_cost == 500_852
    assert decide(policy, applicant("P3")).weather is None
    assert decide(policy, applicant("P5")).weather is None
    assert all(o.weather for o in offers(policy, applicant("P2"), d))


def test_weather_in_precheck(policy):
    p = precheck(policy, precheck_applicant("P1"))
    assert p.weather.rows[0].full_cost == p.cost.full_cost


def test_weather_endpoint():
    body = client.post("/v1/weather", json={"product": "WORKING_CAPITAL", "amount": 850000, "term_months": 24}).json()
    assert body["rows"][0]["full_cost"] == 196_774


def test_weather_endpoint_rejects_overdraft_term():
    r = client.post("/v1/weather", json={"product": "OVERDRAFT", "amount": 300000, "term_months": 6})
    assert r.status_code == 422 and "12 мес" in r.text

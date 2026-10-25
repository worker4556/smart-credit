"""Приёмочные сценарии спецификации (раздел 3, пути A–H): цифры должны совпадать до рубля."""
from conftest import applicant, precheck_applicant, with_statement

from service.decision import decide, offers, precheck
from service.route import build_route


def codes(reasons):
    return [r.code for r in reasons]


# ---------- A. P1 Ольга — одобрено ----------

def test_p1_approved_exact_cost(policy):
    d = decide(policy, applicant("P1"))
    assert d.outcome == "APPROVED"
    assert d.score.score == 100
    assert (d.amount, d.term_months) == (850_000, 24)
    assert d.cost.monthly_payment == 43_261
    assert d.cost.full_cost == 196_774
    assert not d.specialist.required


def test_p1_precheck_high_and_within_estimate(policy):
    p = precheck(policy, precheck_applicant("P1"))
    assert p.chance == "HIGH" and p.score == 100
    assert p.amount_range.high >= 850_000
    assert p.cost.full_cost == 196_774
    assert p.offers[0].kind == "REQUESTED"


# ---------- B + G. P2 «Полка» — иные условия у специалиста ----------

def test_p2_counter_offer_turnover_bound(policy):
    d = decide(policy, applicant("P2"))
    assert d.score.score == 72
    assert d.outcome == "COUNTER_OFFER"
    assert d.amount == 2_850_000
    assert d.cost.monthly_payment == 184_575
    assert d.cost.full_cost == 500_852
    assert d.limit.binding == "TURNOVER"
    assert codes(d.reasons)[0] == "L_TURNOVER"
    assert d.specialist.required and "AMOUNT_ABOVE_2M" in d.specialist.triggers


def test_p2_same_score_other_product_other_limit(policy):
    """Скоринг ≠ решение: при тех же 72 баллах овердрафт — до 760 тыс. (40% оборота)."""
    from service.decision import limit
    assert limit(policy, applicant("P2"), "OVERDRAFT").limit == 760_000


def test_p2_precheck_medium_with_range(policy):
    p = precheck(policy, precheck_applicant("P2"))
    assert p.chance == "MEDIUM"
    assert (p.amount_range.low, p.amount_range.high) == (2_550_000, 2_850_000)
    assert {"B_AMOUNT", "B_TURNOVER"} <= set(codes(p.reasons))


def test_p2_route_turnover_not_score(policy):
    r = build_route(policy, applicant("P2"))
    assert r.holds == "TURNOVER"
    assert [s.code for s in r.steps] == ["L_TURNOVER"]
    assert r.steps[0].target_turnover == 2_000_000


# ---------- C. P5 Андрей — нужны данные → одобрено ----------

def test_p5_info_requested_on_mismatch(policy):
    d = decide(policy, applicant("P5"))
    assert d.outcome == "INFO_REQUESTED"
    assert codes(d.reasons) == ["D_MISMATCH"]


def test_p5_precheck_shows_hidden_turnover(policy):
    p = precheck(policy, precheck_applicant("P5"))
    assert p.chance == "MEDIUM"
    assert p.amount_range.high == 220_000
    assert codes(p.reasons)[0] == "D_MISMATCH"


def test_p5_approved_after_statement(policy):
    d = decide(policy, with_statement("P5"))
    assert d.outcome == "APPROVED"
    assert d.score.score == 92
    assert d.limit.limit == 360_000
    assert d.amount == 300_000
    assert d.cost.monthly_payment == 5_425
    assert d.cost.fee == 3_000


# ---------- F + D. P3 Тимур — слабая предоценка, отказ, маршрут ~3 мес ----------

def test_p3_precheck_low_because_of_tax_stop(policy):
    p = precheck(policy, precheck_applicant("P3"))
    assert p.chance == "LOW"
    assert codes(p.reasons)[0] == "S_TAX"


def test_p3_rejected_tax_stop_and_four_factors(policy):
    d = decide(policy, applicant("P3"))
    assert d.outcome == "REJECTED"
    assert codes(d.reasons) == ["S_TAX", "B_TURNOVER", "B_AMOUNT", "O_DEBT", "O_HISTORY"]
    assert d.score.score == 53


def test_p3_route_three_months_to_77(policy):
    r = build_route(policy, applicant("P3"))
    assert r.status == "ACTIVE"
    assert [(s.code, s.points_gain) for s in r.steps] == [("S_TAX", 0), ("O_DEBT", 8), ("B_TURNOVER", 12)]
    assert r.horizon_text == "~3 мес."
    assert r.projection.score == 77
    assert r.projection.limit == 1_100_000
    assert r.projection.outcome == "COUNTER_OFFER"
    assert r.projection.cost.full_cost == 254_649


def test_p3_recalculate_after_steps_is_real(policy):
    """«Пересчитать»: после отмеченных шагов прогноз меняется по тем же правилам."""
    r = build_route(policy, applicant("P3"), assume_done=["S_TAX", "O_DEBT"])
    assert r.current_score == 61
    assert [s.code for s in r.steps] == ["B_TURNOVER"]


# ---------- E. P4 Марина — отказ без быстрого пути ----------

def test_p4_precheck_medium_from_self_report(policy):
    p = precheck(policy, precheck_applicant("P4"))
    assert p.score == 64
    assert p.chance == "MEDIUM"
    assert p.owner_note


def test_p4_rejected_90_in_12(policy):
    d = decide(policy, applicant("P4"))
    assert d.outcome == "REJECTED"
    assert codes(d.reasons)[0] == "S_90_12"


def test_p4_route_eight_months_cannot_speed_up(policy):
    r = build_route(policy, applicant("P4"))
    assert r.holds == "TIME_WINDOW"
    assert r.horizon_text == "~8 мес., ускорить нельзя"
    assert r.steps[0].code == "S_90_12"
    assert r.advice  # не подавать заявки в другие банки
    assert r.reachable


# ---------- H. 115-ФЗ ----------

def test_zsk_suspended_no_route(policy):
    d = decide(policy, applicant("ZSK"))
    assert d.outcome == "SUSPENDED_115FZ"
    assert codes(d.reasons) == ["Z_115"]
    r = build_route(policy, applicant("ZSK"))
    assert r.status == "NO_ROUTE" and r.holds == "NONCREDIT"


def test_offers_never_more_than_three(policy):
    for key in ("P1", "P2", "P5"):
        a = applicant(key)
        assert len(offers(policy, a, decide(policy, a))) <= 3


def test_overdraft_offered_as_second_product_by_purpose(policy):
    # P2 «Полка»: закупка товара — к оборотному кредиту добавляется овердрафт в пределах лимита (40% оборота)
    a = precheck_applicant("P2")
    purchase = a.model_copy(update={"request": a.request.model_copy(update={"purpose": "PURCHASE"})})
    equipment = a.model_copy(update={"request": a.request.model_copy(update={"purpose": "EQUIPMENT"})})
    with_od = precheck(policy, purchase).offers
    without = precheck(policy, equipment).offers
    od = [o for o in with_od if o.product == "OVERDRAFT"]
    assert od and od[0].kind == "OTHER_PRODUCT" and od[0].term_months == 12 and od[0].amount <= 3_000_000
    assert not any(o.product == "OVERDRAFT" for o in without)
    assert len(with_od) <= 3

"""Отдельные правила политики: порядок применения, стопы, триггеры, неустранимые причины."""
from conftest import applicant

from service.decision import decide
from service.route import build_route


def mutate(a, part, **kw):
    return a.model_copy(update={part: getattr(a, part).model_copy(update=kw)})


def test_factor_weights_sum_to_100(policy):
    assert sum(f["max_points"] for f in policy.factors.values()) == 100


def test_115fz_wins_over_everything(policy):
    a = mutate(applicant("P3"), "company", zsk_level="RED")
    assert decide(policy, a).outcome == "SUSPENDED_115FZ"


def test_missing_document_before_stops(policy):
    a = mutate(applicant("P3"), "checks", missing_documents=["GUARANTOR_CONSENT"])
    d = decide(policy, a)
    assert d.outcome == "INFO_REQUESTED" and d.reasons[0].code == "D_DOC"


def test_unresolved_mismatch_goes_to_specialist(policy):
    a = mutate(applicant("P5"), "checks", mismatch_unresolved=True)
    d = decide(policy, a)
    assert d.outcome != "INFO_REQUESTED"
    assert "MISMATCH_UNRESOLVED" in d.specialist.triggers


def test_borderline_score_goes_to_specialist(policy):
    a = mutate(applicant("P4"), "owner", months_since_90plus=None)  # эпизод 90+ вне окна: стопа нет, 51 балл
    d = decide(policy, a)
    assert 50 <= d.score.score <= 59
    assert d.outcome == "COUNTER_OFFER"
    assert "BORDERLINE_SCORE" in d.specialist.triggers


def test_counter_band_halves_limit(policy):
    a = mutate(applicant("P4"), "owner", months_since_90plus=None)
    d = decide(policy, a)
    assert 50 <= d.score.score <= 59
    assert d.amount == 300_000  # лимит 600 тыс. × 0,5


def test_low_score_rejected(policy):
    a = applicant("P4")
    a = mutate(a, "owner", months_since_90plus=None, personal_monthly_payments=200_000)
    a = mutate(a, "company", fssp_debt=500_000)
    d = decide(policy, a)
    assert d.score.score < 50 and d.outcome == "REJECTED"


def test_bankruptcy_no_route(policy):
    a = mutate(applicant("P1"), "company", bankruptcy=True)
    assert decide(policy, a).outcome == "REJECTED"
    r = build_route(policy, a)
    assert r.status == "NO_ROUTE" and r.holds == "STOP_PERMANENT"


def test_payment_bound_offers_longer_term(policy):
    """Иные условия «другой срок»: всю сумму даёт более длинный срок."""
    a = mutate(applicant("P2"), "account", business_monthly_payments=300_000)
    a = mutate(a, "request", amount=1_000_000, term_months=6)
    d = decide(policy, a)
    assert d.outcome == "COUNTER_OFFER"
    assert d.amount == 1_000_000 and d.term_months > 6


def test_precheck_does_not_use_bki_stops(policy):
    """До подачи данных БКИ нет: стоп 90+ не может сработать со слов клиента."""
    from conftest import precheck_applicant
    from service.decision import precheck
    p = precheck(policy, precheck_applicant("P4"))
    assert "S_90_12" not in [r.code for r in p.reasons]


def test_inactive_company_is_permanent_stop(policy):
    a = mutate(applicant("P1"), "company", status="LIQUIDATED")
    d = decide(policy, a)
    assert d.outcome == "REJECTED" and d.reasons[0].code == "S_INACTIVE"
    assert build_route(policy, a).holds == "STOP_PERMANENT"


def test_quote_schedule_matches_cost(policy):
    from service.finance import quote
    q = quote(policy, "WORKING_CAPITAL", 850_000, 24)
    assert q.monthly_payment == 43_261 and q.full_cost == 196_774
    assert len(q.schedule) == 24 and q.schedule[-1].balance == 0
    assert abs(sum(r.principal for r in q.schedule) - 850_000) <= 24
    od = quote(policy, "OVERDRAFT", 300_000, None)
    assert od.monthly_payment == 5_425 and od.fee == 3_000 and od.schedule == []


def test_route_from_specialist_decision(policy):
    """Путь G: система одобрила бы P1, специалист отказал по B_COURTS — маршрут от его причины."""
    from service.route import SpecialistDecision
    a = mutate(applicant("P1"), "company", fssp_debt=40_000)
    r = build_route(policy, a, specialist=SpecialistDecision(outcome="REJECTED", reason_code="B_COURTS"))
    assert r.based_on == "SPECIALIST"
    assert r.steps[0].code == "B_COURTS"
    assert r.status != "READY" and r.current_available_amount == 0


def test_route_specialist_permanent_reason(policy):
    from service.route import SpecialistDecision
    r = build_route(policy, applicant("P1"), specialist=SpecialistDecision(outcome="REJECTED", reason_code="S_INDUSTRY"))
    assert r.status == "NO_ROUTE"

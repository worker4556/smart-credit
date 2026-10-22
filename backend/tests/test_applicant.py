from __future__ import annotations

import uuid
from datetime import date

from app.db.models import Application
from app.services.applicants import build_applicant
from app.services.applications import route_done_steps
from app.services.credit import precheck_from_ml, route_from_ml
from app.services.personas import get_persona_by_key


def application_data(**overrides) -> dict:
    data = {
        "goal": "Закупить товар или материалы",
        "amount": 850_000,
        "term": 24,
        "monthly_revenue": 950_000,
        "has_loans": "Да",
        "loan_payment": 20_000,
        "had_overdue_2y": False,
        "collateral": "",
        "consent1": True,
        "consent2": True,
        "docs": {},
    }
    data.update(overrides)
    return data


def application(**overrides) -> Application:
    return Application(
        number="A-000001",
        company_id=uuid.uuid4(),
        status="DRAFT",
        data=application_data(**overrides),
    )


def test_build_applicant_p1_precheck_uses_self_reported_owner() -> None:
    persona = get_persona_by_key("P1")
    assert persona is not None

    applicant = build_applicant(application(), persona, "PRECHECK")

    assert applicant["request"] == {
        "product": "WORKING_CAPITAL",
        "amount": 850_000,
        "term_months": 24,
        "has_guarantor": False,
    }
    assert "zsk_level" not in applicant["company"]
    assert applicant["owner"] == {
        "source": "SELF_REPORTED",
        "had_overdue_2y": False,
        "personal_monthly_payments": 20_000,
    }
    assert applicant["checks"]["declared_monthly_revenue"] == 950_000
    assert applicant["account"]["turnover_monthly"] == [
        920_000,
        960_000,
        940_000,
        980_000,
        930_000,
        970_000,
    ]


def test_build_applicant_overdraft_has_no_term() -> None:
    persona = get_persona_by_key("P5")
    assert persona is not None

    applicant = build_applicant(
        application(
            goal="Перекрыть кассовый разрыв",
            amount=300_000,
            term=12,
            monthly_revenue=900_000,
            has_loans="Нет",
            loan_payment=0,
        ),
        persona,
        "PRECHECK",
    )

    assert applicant["request"]["product"] == "OVERDRAFT"
    assert applicant["request"]["term_months"] is None
    assert applicant["owner"]["personal_monthly_payments"] == 0


def test_build_applicant_decision_uses_bki_owner() -> None:
    persona = get_persona_by_key("P3")
    assert persona is not None

    applicant = build_applicant(
        application(
            goal="Закупить товар или материалы",
            amount=1_200_000,
            term=24,
            monthly_revenue=750_000,
            has_loans="Да",
            loan_payment=25_000,
            had_overdue_2y=True,
        ),
        persona,
        "DECISION",
    )

    assert applicant["company"]["zsk_level"] == "GREEN"
    assert applicant["owner"]["source"] == "BKI"
    assert applicant["owner"]["max_dpd_24m"] == 20


def test_precheck_from_ml_maps_contract_fields() -> None:
    payload = {
        "chance": "MEDIUM",
        "amount_range": {"low": 2_550_000, "high": 2_850_000},
        "requested_amount": 3_000_000,
        "cost": {
            "product": "WORKING_CAPITAL",
            "amount": 3_000_000,
            "term_months": 18,
            "rate": 20.0,
            "monthly_payment": 194_290,
            "full_cost": 527_213,
        },
        "reasons": [
            {"code": "L_TURNOVER", "text": "Сумму ограничивает оборот"},
            {"code": "B_TURNOVER", "text": "Поступления нерегулярны"},
        ],
        "offers": [
            {
                "kind": "WITHIN_ESTIMATE",
                "product": "WORKING_CAPITAL",
                "amount": 2_850_000,
                "term_months": 18,
                "cost": {
                    "rate": 20.0,
                    "monthly_payment": 184_575,
                    "full_cost": 500_852,
                },
                "weather": {
                    "rows": [],
                    "disclaimer": "Это иллюстрация рисков.",
                },
            }
        ],
        "owner_note": "Кредитную историю проверим после подачи.",
        "disclaimer": "Это оценка, а не решение банка.",
        "weather": {
            "rows": [],
            "disclaimer": "Это иллюстрация рисков.",
        },
    }

    result = precheck_from_ml(
        payload,
        text="Шансы на 3 000 000 ₽ — средние.",
        valid_until=date(2026, 11, 20),
        request={
            "product": "WORKING_CAPITAL",
            "amount": 3_000_000,
            "term_months": 18,
        },
    )

    assert result.chance == "MEDIUM"
    assert (result.amount_low, result.amount_high) == (2_550_000, 2_850_000)
    assert result.requested_amount == 3_000_000
    assert result.reasons[0].code == "L_TURNOVER"
    assert result.goal_offers[0].monthly == 184_575
    assert result.goal_offers[0].full_cost == 500_852
    # «Почему подходит» объясняет вариант, а не повторяет причину отказа
    assert result.goal_offers[0].kind == "WITHIN_ESTIMATE"
    assert result.goal_offers[0].why == "Сумма в пределах предварительной оценки — шансы на одобрение выше"
    assert result.valid_until == date(2026, 11, 20)


def test_precheck_from_ml_falls_back_to_single_low_offer() -> None:
    payload = {
        "chance": "LOW",
        "amount_range": {"low": 0, "high": 0},
        "requested_amount": 1_200_000,
        "cost": {
            "product": "WORKING_CAPITAL",
            "amount": 1_200_000,
            "term_months": 24,
            "rate": 20.0,
            "monthly_payment": 61_074,
            "full_cost": 265_776,
        },
        "reasons": [{"code": "S_TAX", "text": "Есть налоговая задолженность"}],
        "offers": [],
        "owner_note": None,
        "disclaimer": "Это оценка.",
        "weather": None,
    }

    result = precheck_from_ml(
        payload,
        text="Шансы низкие.",
        valid_until=date(2026, 11, 20),
        request={
            "product": "WORKING_CAPITAL",
            "amount": 1_200_000,
            "term_months": 24,
        },
    )

    assert len(result.goal_offers) == 1
    assert result.goal_offers[0].amount == 1_200_000
    assert result.goal_offers[0].chance == "LOW"
    assert result.goal_offers[0].monthly == 61_074


def test_route_from_ml_maps_contract_fields_and_done_steps() -> None:
    payload = {
        "status": "ACTIVE",
        "holds": "STOP",
        "based_on": "SYSTEM",
        "steps": [
            {
                "code": "S_TAX",
                "action": "Погасить сальдо ЕНС",
                "term": "недели",
                "points_gain": 0,
                "bki_delay_business_days": None,
            },
            {
                "code": "O_DEBT",
                "action": "Закрыть кредитки",
                "term": "недели",
                "points_gain": 8,
                "bki_delay_business_days": 2,
            },
        ],
        "horizon_text": "~3 мес.",
        "message": "Шаги снимают ограничения.",
        "advice": ["Сначала налоги"],
        "projection": {"available_amount": 1_100_000},
        "disclaimer": "Это ориентир.",
    }

    result = route_from_ml(
        payload,
        text="До вершины: погасите налоги.",
        done_steps=["S_TAX"],
    )

    assert result.status == "ACTIVE"
    assert result.holds == "STOP"
    assert result.horizon_text == "~3 мес."
    assert result.projected_amount == 1_100_000
    assert result.steps[0].code == "S_TAX"
    assert result.steps[0].done is True
    assert result.steps[1].points_gain == 8
    assert result.steps[1].bki_delay_business_days == 2
    assert result.text == "До вершины: погасите налоги."


def test_route_done_steps_reads_saved_marks() -> None:
    application = Application(
        number="A-000001",
        company_id=uuid.uuid4(),
        route={"status": "ACTIVE", "_done": ["S_TAX", "O_DEBT"]},
    )

    assert route_done_steps(application) == ["S_TAX", "O_DEBT"]

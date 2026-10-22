from __future__ import annotations

from datetime import date

import pytest
from pydantic import ValidationError

from app.schemas.applications import (
    OUTCOME_BY_STATUS,
    ApplicationData,
    ApplicationResponse,
    ApplicationRoute,
    IntentResponse,
    LoanOffer,
    PrecheckResponse,
    Quote,
    Weather,
    WeatherRow,
)


def valid_application_data() -> dict:
    return {
        "goal": "Закупить товар или материалы",
        "amount": 850_000,
        "term": 24,
        "monthlyRevenue": 950_000,
        "hasLoans": "Да",
        "loanPayment": 20_000,
        "hadOverdue2y": False,
        "collateral": "Ничего",
        "consent1": True,
        "consent2": True,
        "docs": {},
    }


def weather() -> Weather:
    return Weather(
        rows=[
            WeatherRow(
                code="BASE",
                title="Сейчас",
                rate=20.0,
                monthly_payment=43_261,
                full_cost=196_774,
                delta_full_cost=0,
            )
        ],
        disclaimer="Это иллюстрация рисков, а не условия банка.",
    )


def test_application_data_accepts_contract_camel_case_and_ignores_extra() -> None:
    data = ApplicationData.model_validate(
        {
            **valid_application_data(),
            "inn": "631200000001",
            "company": {"name": "Игнорируется"},
        }
    )

    assert data.monthly_revenue == 950_000
    assert data.has_loans == "Да"
    assert data.loan_payment == 20_000
    assert "inn" not in data.model_dump()

    payload = data.model_dump(by_alias=True)
    assert payload["monthlyRevenue"] == 950_000
    assert payload["hasLoans"] == "Да"
    assert payload["loanPayment"] == 20_000
    assert payload["hadOverdue2y"] is False


def test_application_data_rejects_invalid_values() -> None:
    with pytest.raises(ValidationError):
        ApplicationData.model_validate(
            {**valid_application_data(), "hasLoans": "Может быть"}
        )

    with pytest.raises(ValidationError):
        ApplicationData.model_validate(
            {**valid_application_data(), "amount": 0}
        )

    with pytest.raises(ValidationError):
        ApplicationData.model_validate(
            {**valid_application_data(), "loanPayment": -1}
        )


def test_precheck_serializes_nested_weather_and_offers_to_camel_case() -> None:
    precheck = PrecheckResponse(
        chance="MEDIUM",
        amount_low=2_550_000,
        amount_high=2_850_000,
        requested_amount=3_000_000,
        reasons=[{"code": "L_TURNOVER", "text": "Сумму ограничивает оборот"}],
        text="Шансы на 3 000 000 ₽ — средние.",
        owner_note="Кредитную историю проверим после подачи.",
        disclaimer="Это оценка по текущим данным, а не решение банка.",
        valid_until=date(2026, 11, 20),
        weather=weather(),
        goal_offers=[
            LoanOffer(
                product="WORKING_CAPITAL",
                name="Деньги на текущие расходы",
                amount=2_850_000,
                term_months=18,
                rate=20.0,
                monthly=184_575,
                full_cost=500_852,
                why="Сумму ограничивает оборот, а не баллы",
                chance="MEDIUM",
                weather=weather(),
            )
        ],
    )

    payload = precheck.model_dump(by_alias=True, mode="json")

    assert payload["amountLow"] == 2_550_000
    assert payload["amountHigh"] == 2_850_000
    assert payload["requestedAmount"] == 3_000_000
    assert payload["ownerNote"] == "Кредитную историю проверим после подачи."
    assert payload["validUntil"] == "2026-11-20"
    assert payload["weather"]["rows"][0]["monthlyPayment"] == 43_261
    assert payload["goalOffers"][0]["termMonths"] == 18
    assert payload["goalOffers"][0]["fullCost"] == 500_852


def test_application_response_serializes_decision_and_activity() -> None:
    response = ApplicationResponse(
        application_id="00000000-0000-0000-0000-000000000001",
        number="A-000123",
        status="COUNTER_OFFER",
        outcome="partial",
        submitted=True,
        next_action="Посмотрите предложение банка",
        decision_text="Банк может предложить 2 850 000 ₽ на 18 мес.",
        decision_amount=2_850_000,
        decision_term=18,
        decision_rate=20.0,
        decision_monthly=184_575,
        decision_full_cost=500_852,
        decision_weather=weather(),
        reasons=["Сумму ограничивает оборот, а не баллы"],
        route_available=False,
        assistant_available=True,
        activity=[{"at": "14:02", "text": "Заявка отправлена"}],
    )

    payload = response.model_dump(by_alias=True, mode="json", exclude_none=True)

    assert payload["applicationId"] == "00000000-0000-0000-0000-000000000001"
    assert payload["nextAction"] == "Посмотрите предложение банка"
    assert payload["decisionAmount"] == 2_850_000
    assert payload["decisionTerm"] == 18
    assert payload["decisionWeather"]["rows"][0]["deltaFullCost"] == 0
    assert payload["activity"][0]["at"] == "14:02"
    assert "infoRequest" not in payload


def test_application_route_serializes_steps_and_projection() -> None:
    route = ApplicationRoute(
        status="ACTIVE",
        holds="STOP",
        based_on="SYSTEM",
        steps=[
            {
                "code": "S_TAX",
                "action": "Погасить сальдо ЕНС",
                "term": "недели",
                "points_gain": 0,
                "done": False,
            },
            {
                "code": "O_DEBT",
                "action": "Закрыть кредитки или снизить лимиты",
                "term": "недели",
                "points_gain": 8,
                "done": False,
                "bki_delay_business_days": 2,
            },
        ],
        horizon_text="~3 мес.",
        message="Шаги ниже снимают ограничения.",
        advice=["Погасить налоги"],
        projected_amount=1_100_000,
        disclaimer="Это ориентир, а не обещание одобрения.",
        text="Маршрут к одобрению.",
    )

    payload = route.model_dump(by_alias=True)

    assert payload["horizonText"] == "~3 мес."
    assert payload["projectedAmount"] == 1_100_000
    assert payload["steps"][1]["pointsGain"] == 8
    assert payload["steps"][1]["bkiDelayBusinessDays"] == 2
    assert payload["basedOn"] == "SYSTEM"


def test_quote_and_intent_use_frontend_camel_case() -> None:
    quote = Quote(
        monthly=43_261,
        total=1_038_274,
        full_cost=196_774,
        rate=20.0,
        term_months=24,
        disclaimer="Расчёт предварительный.",
    )
    intent = IntentResponse(
        goal="Закупить товар или материалы",
        amount=800_000,
        term=None,
        missing=["term"],
        product_reason="Оборотный кредит: вся сумма сразу.",
        needs_confirmation=True,
        source="LLM",
    )

    quote_payload = quote.model_dump(by_alias=True)
    intent_payload = intent.model_dump(by_alias=True)

    assert quote_payload["fullCost"] == 196_774
    assert quote_payload["termMonths"] == 24
    assert intent_payload["productReason"] == "Оборотный кредит: вся сумма сразу."
    assert intent_payload["needsConfirmation"] is True
    assert intent_payload["term"] is None


def test_outcome_mapping_covers_all_contract_statuses() -> None:
    assert OUTCOME_BY_STATUS["DRAFT"] == "review"
    assert OUTCOME_BY_STATUS["SPECIALIST_REVIEW"] == "specialist"
    assert OUTCOME_BY_STATUS["COUNTER_OFFER"] == "partial"
    assert OUTCOME_BY_STATUS["INFO_REQUESTED"] == "info"
    assert OUTCOME_BY_STATUS["DECLINED_BY_CLIENT"] == "rejected"
    assert OUTCOME_BY_STATUS["SUSPENDED_115FZ"] == "suspended"

from __future__ import annotations

from datetime import date
from typing import Any

from app.schemas.applications import (
    ApplicationRoute,
    IntentResponse,
    LoanOffer,
    PrecheckResponse,
    Quote,
    Reason,
    RouteStep,
)

CASH_GAP_GOAL = "Перекрыть кассовый разрыв"

PRODUCT_NAME = {
    "WORKING_CAPITAL": "Деньги на текущие расходы",
    "OVERDRAFT": "Овердрафт",
}

GOAL_BY_PURPOSE = {
    "PURCHASE": "Закупить товар или материалы",
    "CASH_GAP": CASH_GAP_GOAL,
    "CONTRACT": "Закупить товар или материалы",
    "EQUIPMENT": "Купить оборудование или технику",
    "EXPANSION": "Закрыть текущие расходы",
    "OTHER": "Закрыть текущие расходы",
}

MISSING_FIELD = {
    "purpose": "goal",
    "amount": "amount",
    "term_months": "term",
    "term": "term",
}


def product_for(goal: str) -> str:
    return "OVERDRAFT" if goal == CASH_GAP_GOAL else "WORKING_CAPITAL"


def quote_from_ml(payload: dict[str, Any]) -> Quote:
    return Quote(
        monthly=int(payload["monthly_payment"]),
        total=int(payload["total_paid"]),
        full_cost=int(payload["full_cost"]),
        rate=float(payload["rate"]),
        term_months=int(payload["term_months"]),
        disclaimer=str(payload.get("note") or ""),
    )


OFFER_WHY = {
    "REQUESTED": "Ровно та сумма и срок, что вы просили",
    "WITHIN_ESTIMATE": "Сумма в пределах предварительной оценки — шансы на одобрение выше",
    "OTHER_TERM": "Та же сумма, срок подобран под ваш оборот",
    "OTHER_PRODUCT": "Другой продукт, который подходит под вашу задачу",
}


def _loan_offer(
    payload: dict[str, Any],
    chance: str,
    why: str | None,
) -> LoanOffer:
    # Причины отказа не объясняют, почему вариант подходит: берём пояснение по типу варианта
    why = OFFER_WHY.get(str(payload.get("kind")), None)
    cost = payload["cost"]
    product = payload["product"]
    return LoanOffer(
        kind=payload.get("kind"),
        product=product,
        name=PRODUCT_NAME[product],
        amount=int(payload["amount"]),
        term_months=int(payload["term_months"]),
        rate=float(cost["rate"]),
        monthly=int(cost["monthly_payment"]),
        full_cost=int(cost["full_cost"]),
        why=why,
        chance=chance,
        weather=payload.get("weather"),
    )


def _fallback_offer(
    payload: dict[str, Any],
    request: dict[str, Any],
    reasons: list[Reason],
) -> LoanOffer:
    cost = payload.get("cost") or {}
    product = cost.get("product") or request["product"]
    amount = int(payload.get("requested_amount") or request["amount"])
    term = cost.get("term_months") or request.get("term_months") or 12
    return LoanOffer(
        product=product,
        name=PRODUCT_NAME[product],
        amount=amount,
        term_months=int(term),
        rate=float(cost.get("rate") or 0),
        monthly=int(cost.get("monthly_payment") or 0),
        full_cost=int(cost.get("full_cost") or 0),
        why=None,
        chance="LOW",
        weather=payload.get("weather"),
    )


def precheck_from_ml(
    payload: dict[str, Any],
    *,
    text: str,
    valid_until: date,
    request: dict[str, Any],
) -> PrecheckResponse:
    chance = payload["chance"]
    reasons = [
        Reason(code=str(item["code"]), text=str(item["text"]))
        for item in payload.get("reasons") or []
        if isinstance(item, dict) and item.get("code") and item.get("text")
    ]
    offers = [
        _loan_offer(item, chance, reasons[0].text if reasons else None)
        for item in payload.get("offers") or []
        if isinstance(item, dict)
    ]
    if not offers:
        offers = [_fallback_offer(payload, request, reasons)]

    amount_range = payload["amount_range"]
    return PrecheckResponse(
        chance=chance,
        amount_low=int(amount_range["low"]),
        amount_high=int(amount_range["high"]),
        requested_amount=int(payload["requested_amount"]),
        reasons=reasons,
        text=text,
        owner_note=payload.get("owner_note"),
        disclaimer=str(payload["disclaimer"]),
        valid_until=valid_until,
        weather=payload.get("weather"),
        goal_offers=offers,
    )


def route_from_ml(
    payload: dict[str, Any],
    *,
    text: str,
    done_steps: list[str],
) -> ApplicationRoute:
    done = set(done_steps)
    steps = [
        RouteStep(
            code=str(item["code"]),
            action=str(item["action"]),
            term=str(item["term"]),
            points_gain=int(item.get("points_gain") or 0),
            done=str(item["code"]) in done,
            bki_delay_business_days=item.get("bki_delay_business_days"),
            target_turnover=item.get("target_turnover"),
        )
        for item in payload.get("steps") or []
        if isinstance(item, dict)
    ]
    projection = payload.get("projection") or {}
    projected = projection.get("available_amount")
    return ApplicationRoute(
        status=payload.get("status", "NO_ROUTE"),
        holds=payload.get("holds", "NONE"),
        based_on=payload.get("based_on", "SYSTEM"),
        steps=steps,
        horizon_text=str(payload.get("horizon_text") or ""),
        message=str(payload.get("message") or ""),
        advice=[str(item) for item in payload.get("advice") or []],
        projected_amount=int(projected) if projected is not None else None,
        disclaimer=str(payload.get("disclaimer") or ""),
        text=text,
    )


def intent_from_ml(payload: dict[str, Any]) -> IntentResponse:
    purpose = payload.get("purpose")
    goal = GOAL_BY_PURPOSE.get(purpose) if purpose else None

    missing: list[str] = []
    for field in payload.get("missing") or []:
        mapped = MISSING_FIELD.get(field)
        if mapped and mapped not in missing:
            missing.append(mapped)

    amount = payload.get("amount")
    term = payload.get("term_months")
    source = payload.get("source")
    if source not in {"LLM", "RULES"}:
        source = "RULES"

    return IntentResponse(
        goal=goal,
        amount=int(amount) if isinstance(amount, (int, float)) and amount > 0 else None,
        term=int(term) if isinstance(term, (int, float)) and term > 0 else None,
        missing=missing,
        product_reason=payload.get("product_reason"),
        needs_confirmation=bool(payload.get("needs_confirmation", True)),
        source=source,
    )

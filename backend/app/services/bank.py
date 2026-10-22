from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException, status
from sqlmodel import Session, select

from app.errors import FieldError
from app.db.models import Application, Company, utcnow
from app.db.ops import change_status
from app.schemas.bank import (
    BankApplication,
    BankDecisionRequest,
    BankFactor,
    BankQueueItem,
    BankRecommendation,
)
from app.services import applications as application_service
from app.services import ml
from app.services.applicants import build_applicant
from app.services.credit import product_for
from app.services.personas import get_persona_by_key

STATUS_BY_SPECIALIST = {
    "APPROVED": "APPROVED",
    "COUNTER_OFFER": "COUNTER_OFFER",
    "INFO_REQUESTED": "INFO_REQUESTED",
    "REJECTED": "REJECTED",
}


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def queue(session: Session) -> list[BankQueueItem]:
    statement = select(Application).where(Application.status == "SPECIALIST_REVIEW")
    applications = sorted(
        session.exec(statement).all(),
        key=lambda item: _aware(item.updated_at),
    )
    result: list[BankQueueItem] = []
    for application in applications:
        company = session.get(Company, application.company_id)
        decision = application.decision or {}
        result.append(
            BankQueueItem(
                application_id=str(application.id),
                number=application.number,
                company_name=company.name if company else "",
                amount=int(
                    application.data.get("amount")
                    or decision.get("requested_amount")
                    or 0
                ),
                triggers=list(
                    (decision.get("specialist") or {}).get("triggers") or []
                ),
                waiting_minutes=max(
                    0,
                    int((utcnow() - _aware(application.updated_at)).total_seconds() // 60),
                ),
            )
        )
    return result


def _applicant(application: Application, company: Company) -> dict[str, Any]:
    persona = get_persona_by_key(company.persona_key)
    if persona is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Нет демо-данных компании",
        )
    return build_applicant(application, persona, stage="DECISION")


def _limits(
    application: Application,
    company: Company,
    request_id: str | None,
) -> dict[str, int]:
    applicant = _applicant(application, company)
    result: dict[str, int] = {}
    for product in ("WORKING_CAPITAL", "OVERDRAFT"):
        request = {**applicant["request"], "product": product}
        if product == "OVERDRAFT":
            request["term_months"] = 12
        payload = {**applicant, "request": request}
        result[product] = int(ml.limit(payload, request_id=request_id)["limit"])
    return result


def bank_application(
    session: Session,
    application: Application,
    company: Company,
    *,
    request_id: str | None,
) -> BankApplication:
    response = application_service.response(session, application)
    decision = application.decision or {}
    score = decision.get("score") or {}

    factors = [
        BankFactor(
            label=str(item.get("label") or ""),
            points=int(item.get("points") or 0),
            max_points=int(item.get("max_points") or 0),
        )
        for item in score.get("factors") or []
        if isinstance(item, dict)
    ]
    stops = [
        str(item.get("text"))
        for item in score.get("stops") or []
        if isinstance(item, dict) and item.get("text")
    ]
    return BankApplication(
        **response.model_dump(),
        factors=factors,
        stops=stops,
        limits=_limits(application, company, request_id),
        recommendation=BankRecommendation(
            outcome=str(decision.get("outcome") or ""),
            amount=decision.get("amount"),
        ),
        events=response.activity,
    )


def _reason(
    code: str,
    *,
    request_id: str | None,
) -> dict[str, Any]:
    items = ml.reasons(request_id=request_id).get("items") or []
    for item in items:
        if isinstance(item, dict) and item.get("code") == code:
            return item
    raise FieldError("Такой причины нет в справочнике", "reasonCode")


def _cost(
    application: Application,
    decision: dict[str, Any],
    *,
    amount: int,
    term: int | None,
    request_id: str | None,
) -> dict[str, Any]:
    current = decision.get("cost") or {}
    if (
        current
        and current.get("amount") == amount
        and current.get("term_months") == term
    ):
        return current
    product = current.get("product") or product_for(
        str(application.data.get("goal") or "")
    )
    quote = ml.quote(product, amount, term, request_id=request_id)
    return {
        key: quote[key]
        for key in (
            "product",
            "amount",
            "term_months",
            "rate",
            "monthly_payment",
            "fee",
            "full_cost",
        )
    }


def specialist_decision(
    session: Session,
    application: Application,
    data: BankDecisionRequest,
    *,
    request_id: str | None,
) -> Application:
    if application.status != "SPECIALIST_REVIEW":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Решение специалиста доступно только для заявок на рассмотрении",
        )

    reason = _reason(data.reason_code, request_id=request_id)
    decision = dict(application.decision or {})
    decision["outcome"] = data.outcome
    decision["specialist_decision"] = {
        "outcome": data.outcome,
        "amount": data.amount,
        "term": data.term,
        "reasonCode": data.reason_code,
        "comment": data.comment,
        "at": utcnow().isoformat(),
    }
    decision["reasons"] = [
        {
            "code": data.reason_code,
            "kind": reason.get("kind") or "FACTOR",
            "category": reason.get("category") or "SPECIALIST",
            "text": reason.get("text") or data.comment or data.reason_code,
        },
        *[
            item
            for item in decision.get("reasons") or []
            if isinstance(item, dict) and item.get("code") != data.reason_code
        ],
    ]

    if data.outcome in {"APPROVED", "COUNTER_OFFER"}:
        requested = int(decision.get("requested_amount") or 0)
        amount = data.amount or decision.get("amount") or requested
        term = data.term or decision.get("term_months")
        if not amount or amount <= 0:
            raise FieldError("Укажите сумму решения", "amount")
        decision["amount"] = int(amount)
        decision["term_months"] = int(term) if term else None
        decision["cost"] = _cost(
            application,
            decision,
            amount=int(amount),
            term=int(term) if term else None,
            request_id=request_id,
        )
    else:
        decision["amount"] = None
        decision["term_months"] = None
        decision["cost"] = None

    if data.outcome == "INFO_REQUESTED":
        application.info_requests += 1

    try:
        explanation = ml.explain(
            {"decision": decision},
            use_llm=False,
            request_id=request_id,
        )
        text = str(explanation.get("text") or "")
        if text:
            application.decision_text = text
    except ml.MLError:
        pass

    application.decision = decision
    change_status(
        session,
        application,
        STATUS_BY_SPECIALIST[data.outcome],
        actor="SPECIALIST",
        reason=data.comment or None,
        payload={"reasonCode": data.reason_code, "outcome": data.outcome},
    )
    session.commit()
    session.refresh(application)
    return application

from __future__ import annotations

from typing import Any, Literal

from app.db.models import Application
from app.schemas.applications import ApplicationData
from app.services.credit import product_for

Stage = Literal["PRECHECK", "DECISION"]


def build_applicant(
    application: Application,
    persona: dict[str, Any],
    stage: Stage,
) -> dict[str, Any]:
    data = ApplicationData.model_validate(application.data)
    decision = persona["decision"]
    company = dict(decision["company"])
    account = dict(decision["account"])
    if application.statement_uploaded and persona.get("statement_external_turnover"):
        account["external_turnover_monthly"] = persona["statement_external_turnover"]

    product = product_for(data.goal)
    if stage == "PRECHECK":
        company.pop("zsk_level", None)
        owner = {
            "source": "SELF_REPORTED",
            "had_overdue_2y": data.had_overdue_2y,
            "personal_monthly_payments": (
                data.loan_payment if data.has_loans == "Да" else 0
            ),
        }
    else:
        owner = dict(decision["owner"])

    return {
        "request": {
            "product": product,
            "amount": data.amount,
            "term_months": None if product == "OVERDRAFT" else data.term,
            "has_guarantor": company.get("legal_form") == "OOO",
        },
        "company": company,
        "account": account,
        "owner": owner,
        "checks": {
            "declared_monthly_revenue": data.monthly_revenue,
            "missing_documents": [],
            "mismatch_unresolved": (
                application.info_requests >= 1 and not application.statement_uploaded
            ),
            "disputed": False,
        },
        # Заявка подана после пройденного маршрута: ML применяет эффект выполненных шагов к данным
        "assume_done": data.route_done,
    }


def specialist_for_route(application: Application) -> dict[str, Any] | None:
    """Решение специалиста для ML /route (путь G): маршрут строится от него, а не от системы."""
    specialist = (application.decision or {}).get("specialist_decision")
    if not isinstance(specialist, dict) or not specialist.get("reasonCode"):
        return None
    return {
        "outcome": specialist["outcome"],
        "reason_code": specialist["reasonCode"],
        "amount": specialist.get("amount"),
    }

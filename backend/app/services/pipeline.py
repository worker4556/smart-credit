from __future__ import annotations

import logging
import time
import uuid
from typing import Any

from sqlmodel import Session

from app.db.base import engine
from app.db.models import Application, ApplicationEvent, Company
from app.db.ops import change_status, utcnow
from app.services import ml
from app.services.applicants import build_applicant
from app.services.applications import STATUS_TEXT
from app.services.personas import get_persona_by_key

log = logging.getLogger(__name__)

STATUS_BY_OUTCOME = {
    "APPROVED": "APPROVED",
    "COUNTER_OFFER": "COUNTER_OFFER",
    "INFO_REQUESTED": "INFO_REQUESTED",
    "REJECTED": "REJECTED",
    "SUSPENDED_115FZ": "SUSPENDED_115FZ",
}


def process_application(
    application_id: uuid.UUID,
    request_id: str | None = None,
    *,
    resume: bool = False,
) -> None:
    try:
        _process(application_id, request_id, resume=resume)
    except Exception:
        log.exception("Не удалось обработать заявку %s", application_id)


def _process(
    application_id: uuid.UUID,
    request_id: str | None,
    *,
    resume: bool,
) -> None:
    with Session(engine) as session:
        application = session.get(Application, application_id)
        if application is None:
            return
        if application.status == "SUBMITTED":
            change_status(
                session,
                application,
                "IN_REVIEW",
                reason="Проверяем данные",
            )
            session.commit()
        elif application.status != "IN_REVIEW" or not resume:
            return

        company = session.get(Company, application.company_id)
        persona = get_persona_by_key(company.persona_key) if company else None
        if persona is None:
            change_status(
                session,
                application,
                "SPECIALIST_REVIEW",
                reason="Нет данных компании для автоматической оценки",
            )
            session.commit()
            return

    time.sleep(1.5)

    with Session(engine) as session:
        application = session.get(Application, application_id)
        if application is None or application.status != "IN_REVIEW":
            return
        _add_event(session, application, "Оцениваем заявку")
        session.commit()

        applicant = build_applicant(application, persona, stage="DECISION")
        try:
            decision = ml.decision(applicant, request_id=request_id)
        except ml.MLError:
            log.exception("ML не смог оценить заявку %s", application_id)
            application.decision = {
                "specialist": {
                    "required": True,
                    "triggers": ["ML_UNAVAILABLE"],
                }
            }
            change_status(
                session,
                application,
                "SPECIALIST_REVIEW",
                reason="Не удалось автоматически оценить — передали специалисту",
            )
            session.commit()
            return

        application.decision = decision
        application.decision_text = _explain(
            {"decision": decision},
            request_id,
            use_llm=False,
        )
        status = _status_for_decision(decision)
        if status == "INFO_REQUESTED":
            application.info_requests += 1
        change_status(
            session,
            application,
            status,
            reason=STATUS_TEXT.get(status, "Решение по заявке"),
            payload={
                "outcome": decision.get("outcome"),
                "triggers": (decision.get("specialist") or {}).get("triggers", []),
            },
        )
        session.commit()

    time.sleep(1.5)

    with Session(engine) as session:
        application = session.get(Application, application_id)
        if application is None or application.decision is None:
            return

        if application.status == "REJECTED":
            _build_route(session, application, applicant, request_id)

        text_llm = _explain({"decision": application.decision}, request_id, use_llm=True)
        if text_llm:
            application.decision_text = text_llm
            application.updated_at = utcnow()
            session.add(application)
            session.commit()


def _status_for_decision(decision: dict[str, Any]) -> str:
    specialist = decision.get("specialist") or {}
    if specialist.get("required"):
        return "SPECIALIST_REVIEW"
    outcome = decision.get("outcome")
    return STATUS_BY_OUTCOME.get(str(outcome), "SPECIALIST_REVIEW")


def _explain(
    payload: dict[str, Any],
    request_id: str | None,
    *,
    use_llm: bool,
) -> str | None:
    try:
        explanation = ml.explain(
            payload,
            use_llm=use_llm,
            request_id=request_id,
        )
    except ml.MLError:
        if use_llm:
            log.warning("Не удалось получить текст решения от ML")
        return None
    return str(explanation.get("text") or "") or None


def disburse_application(application_id: uuid.UUID) -> None:
    time.sleep(1.5)
    with Session(engine) as session:
        application = session.get(Application, application_id)
        if application is None or application.status != "SIGNED":
            return
        change_status(
            session,
            application,
            "DISBURSED",
            reason="Деньги перечислены",
        )
        session.commit()


def _build_route(
    session: Session,
    application: Application,
    applicant: dict[str, Any],
    request_id: str | None,
) -> None:
    try:
        route = ml.route(
            {
                "applicant": applicant,
                "assume_done": [],
                "specialist_decision": None,
            },
            request_id=request_id,
        )
    except ml.MLError:
        log.exception("Не удалось построить маршрут для заявки %s", application.id)
        return

    application.route = route
    application.route_text = _explain(
        {"route": route},
        request_id,
        use_llm=False,
    )
    application.updated_at = utcnow()
    session.add(application)
    _add_event(session, application, "Маршрут к одобрению готов")
    session.commit()


def _add_event(session: Session, application: Application, text: str) -> None:
    session.add(
        ApplicationEvent(
            application_id=application.id,
            from_status=application.status,
            to_status=application.status,
            actor="system",
            reason=text,
        )
    )

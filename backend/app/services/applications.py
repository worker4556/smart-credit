from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException, status
from sqlmodel import Session, select

from app.errors import FieldError
from app.db.models import Application, ApplicationEvent
from app.db.ops import change_status, next_number, utcnow
from app.schemas.applications import (
    OUTCOME_BY_STATUS,
    ActivityEvent,
    ApplicationData,
    ApplicationResponse,
    InfoRequest,
    PrecheckResponse,
    Weather,
)
from app.services.credit import precheck_from_ml

STATUS_TEXT = {
    "DRAFT": "Черновик создан",
    "SUBMITTED": "Заявка отправлена",
    "IN_REVIEW": "Проверяем данные",
    "INFO_REQUESTED": "Нужны документы",
    "SPECIALIST_REVIEW": "Заявку рассматривает специалист",
    "APPROVED": "Заявка одобрена",
    "COUNTER_OFFER": "Банк предложил другие условия",
    "OFFER_ACCEPTED": "Предложение принято",
    "SIGNED": "Договор подписан",
    "DISBURSED": "Деньги перечислены",
    "REJECTED": "Заявка отклонена",
    "DECLINED_BY_CLIENT": "Клиент отказался",
    "WITHDRAWN": "Заявка отозвана",
    "EXPIRED": "Заявка истекла",
    "SUSPENDED_115FZ": "Заявка приостановлена",
}

DEADLINES = {
    "APPROVED": 30,
    "COUNTER_OFFER": 30,
    "INFO_REQUESTED": 14,
}

NEXT_ACTION = {
    "DRAFT": "Заполните заявку",
    "SUBMITTED": "Проверяем заявку",
    "IN_REVIEW": "Проверяем заявку",
    "INFO_REQUESTED": "Загрузите документы",
    "SPECIALIST_REVIEW": "Заявку рассматривает специалист",
    "APPROVED": "Посмотрите предложение банка",
    "COUNTER_OFFER": "Посмотрите предложение банка",
    "REJECTED": "Откройте маршрут к следующей заявке",
}


def create_application(
    session: Session,
    company_id: uuid.UUID,
    data: ApplicationData,
    *,
    actor: str = "CLIENT",
) -> Application:
    application = Application(
        number=next_number(session),
        company_id=company_id,
        status="DRAFT",
        data=data.model_dump(),
    )
    session.add(application)
    session.flush()
    session.add(
        ApplicationEvent(
            application_id=application.id,
            to_status="DRAFT",
            actor=actor,
            reason=STATUS_TEXT["DRAFT"],
        )
    )
    session.commit()
    session.refresh(application)
    return application


def update_application(
    session: Session,
    application: Application,
    data: ApplicationData,
) -> Application:
    if application.status != "DRAFT":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Редактировать можно только черновик заявки",
        )
    application.data = data.model_dump()
    application.version += 1
    application.updated_at = datetime.now(timezone.utc)
    session.add(application)
    session.commit()
    session.refresh(application)
    return application


def add_document(
    session: Session,
    application: Application,
    *,
    filename: str,
    doc_id: str,
    statement: bool,
) -> tuple[Application, bool]:
    if application.status not in {"DRAFT", "INFO_REQUESTED"}:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Документ можно загрузить только в черновик или по запросу банка",
        )

    data = dict(application.data)
    docs = dict(data.get("docs") or {})
    docs[doc_id or filename] = filename
    data["docs"] = docs
    application.data = data

    if application.status == "INFO_REQUESTED":
        statement = True
    if statement:
        application.statement_uploaded = True

    reprocess = application.status == "INFO_REQUESTED"
    if reprocess:
        change_status(
            session,
            application,
            "IN_REVIEW",
            actor="CLIENT",
            reason="Документ загружен",
        )
    else:
        application.version += 1
        application.updated_at = datetime.now(timezone.utc)

    session.add(application)
    session.commit()
    session.refresh(application)
    return application, reprocess


def save_route(
    session: Session,
    application: Application,
    payload: dict[str, Any],
    *,
    text: str,
    done_steps: list[str],
) -> Application:
    route = dict(payload)
    previous = (application.route or {}).get("steps") if isinstance(application.route, dict) else None
    route["steps"] = merge_done_steps(previous or [], payload.get("steps") or [], done_steps)
    route["_done"] = list(dict.fromkeys(done_steps))
    application.route = route
    application.route_text = text
    application.updated_at = datetime.now(timezone.utc)
    session.add(application)
    session.commit()
    session.refresh(application)
    return application


def merge_done_steps(previous: list[Any], current: list[Any], done_steps: list[str]) -> list[Any]:
    """ML после пересчёта возвращает только оставшиеся шаги. Выполненные шаги сохраняем в маршруте
    (в прежнем порядке, перед оставшимися), чтобы при следующем входе клиент видел свой прогресс."""
    done = set(done_steps)
    current_codes = {str(step.get("code")) for step in current if isinstance(step, dict)}
    kept = [
        step for step in previous
        if isinstance(step, dict) and str(step.get("code")) in done and str(step.get("code")) not in current_codes
    ]
    return kept + list(current)


def route_stage(application: Application) -> str:
    """Маршрут черновика — по предоценке (ответы клиента, без бюро), после подачи — по данным решения."""
    return "PRECHECK" if application.status == "DRAFT" else "DECISION"


def route_done_steps(application: Application) -> list[str]:
    route = application.route or {}
    value = route.get("_done") if isinstance(route, dict) else None
    return [str(item) for item in value or []]


def submit_application(
    session: Session,
    application: Application,
    data: ApplicationData,
) -> Application:
    if application.status != "DRAFT":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Отправить можно только черновик заявки",
        )
    if not (data.consent1 and data.consent2):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Для отправки нужны оба согласия",
        )
    application.data = data.model_dump()
    application.version += 1
    # Маршрут черновика строился по словам клиента; после решения банка он строится заново
    application.route = None
    application.route_text = None
    change_status(
        session,
        application,
        "SUBMITTED",
        actor="CLIENT",
        reason=STATUS_TEXT["SUBMITTED"],
    )
    session.commit()
    session.refresh(application)
    return application


def accept_offer(
    session: Session,
    application: Application,
    *,
    amount: int | None,
    term: int | None,
) -> Application:
    if application.status not in {"APPROVED", "COUNTER_OFFER"}:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Принять предложение можно только после одобрения",
        )
    decision = application.decision or {}
    offered_amount = decision.get("amount")
    offered_term = decision.get("term_months")
    accepted_amount = amount if amount is not None else offered_amount
    accepted_term = term if term is not None else offered_term
    if not isinstance(accepted_amount, (int, float)) or accepted_amount <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="В предложении нет суммы для принятия",
        )
    if isinstance(offered_amount, (int, float)) and accepted_amount > offered_amount:
        raise FieldError("Сумма больше предложенной банком", "amount")
    if accepted_term is not None:
        if not isinstance(accepted_term, (int, float)) or accepted_term <= 0:
            raise FieldError("Срок должен быть больше 0", "term")
        if isinstance(offered_term, (int, float)) and accepted_term > offered_term:
            raise FieldError("Срок больше предложенного банком", "term")

    data = dict(application.data)
    data["accepted"] = {
        "amount": int(accepted_amount),
        "term": int(accepted_term) if accepted_term is not None else None,
    }
    application.data = data
    change_status(
        session,
        application,
        "OFFER_ACCEPTED",
        actor="CLIENT",
        reason="Клиент принял предложение",
        payload=data["accepted"],
    )
    session.commit()
    session.refresh(application)
    return application


def decline_offer(session: Session, application: Application) -> Application:
    if application.status != "COUNTER_OFFER":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Отклонить можно только встречное предложение",
        )
    change_status(
        session,
        application,
        "DECLINED_BY_CLIENT",
        actor="CLIENT",
        reason="Клиент отклонил предложение",
    )
    session.commit()
    session.refresh(application)
    return application


def sign_offer(session: Session, application: Application) -> Application:
    if application.status != "OFFER_ACCEPTED":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Подписать можно только принятое предложение",
        )
    change_status(
        session,
        application,
        "SIGNED",
        actor="CLIENT",
        reason="Договор подписан",
    )
    session.commit()
    session.refresh(application)
    return application


def withdraw_application(session: Session, application: Application) -> Application:
    if application.status not in {"SUBMITTED", "SPECIALIST_REVIEW"}:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Отозвать заявку можно только до решения",
        )
    change_status(
        session,
        application,
        "WITHDRAWN",
        actor="CLIENT",
        reason="Клиент отозвал заявку",
    )
    session.commit()
    session.refresh(application)
    return application


def expire_if_needed(session: Session, application: Application) -> None:
    days = DEADLINES.get(application.status)
    if days is None:
        return
    event = session.exec(
        select(ApplicationEvent)
        .where(
            ApplicationEvent.application_id == application.id,
            ApplicationEvent.to_status == application.status,
        )
        .order_by(ApplicationEvent.at.desc())
    ).first()
    if event is None:
        return
    changed_at = event.at
    if changed_at.tzinfo is None:
        changed_at = changed_at.replace(tzinfo=timezone.utc)
    if utcnow() - changed_at < timedelta(days=days):
        return
    change_status(
        session,
        application,
        "EXPIRED",
        actor="SYSTEM",
        reason="Срок ответа истёк",
    )
    session.commit()
    session.refresh(application)


def get_application(
    session: Session,
    company_id: uuid.UUID,
    application_id: uuid.UUID,
) -> Application:
    application = session.get(Application, application_id)
    if not application or application.company_id != company_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Заявка не найдена",
        )
    expire_if_needed(session, application)
    return application


def list_applications(session: Session, company_id: uuid.UUID) -> list[Application]:
    statement = (
        select(Application)
        .where(Application.company_id == company_id)
        .order_by(Application.created_at.desc())
    )
    applications = list(session.exec(statement).all())
    for application in applications:
        expire_if_needed(session, application)
    return applications


def application_data(application: Application) -> ApplicationData:
    return ApplicationData.model_validate(application.data)


def _activity(session: Session, application_id: uuid.UUID) -> list[ActivityEvent]:
    statement = (
        select(ApplicationEvent)
        .where(ApplicationEvent.application_id == application_id)
        .order_by(ApplicationEvent.at)
    )
    events = session.exec(statement).all()
    return [
        ActivityEvent(
            at=(event.at if event.at.tzinfo else event.at.replace(tzinfo=timezone.utc)).isoformat(),
            text=event.reason or STATUS_TEXT.get(event.to_status, event.to_status),
        )
        for event in events
    ]


def _weather(value: Any) -> Weather | None:
    if not isinstance(value, dict):
        return None
    try:
        return Weather.model_validate(value)
    except ValueError:
        return None


def response_for(
    application: Application,
    activity: list[ActivityEvent] | None = None,
    info_request: InfoRequest | None = None,
) -> ApplicationResponse:
    decision = application.decision or {}
    cost = decision.get("cost") or {}
    weather = _weather(decision.get("weather"))

    reasons = [
        str(item.get("text"))
        for item in decision.get("reasons") or []
        if isinstance(item, dict) and item.get("text")
    ]

    hide_decision = application.status in {
        "REJECTED",
        "INFO_REQUESTED",
        "SUSPENDED_115FZ",
    }
    amount = None if hide_decision else decision.get("amount")
    term = None if hide_decision else decision.get("term_months")
    rate = None if hide_decision else cost.get("rate")
    monthly = None if hide_decision else cost.get("monthly_payment")
    full_cost = None if hide_decision else cost.get("full_cost")
    if hide_decision:
        weather = None

    if info_request is None and application.status == "INFO_REQUESTED":
        info_request = InfoRequest(
            text="Загрузите выписку другого банка за 6 месяцев",
            due_date=(application.updated_at + timedelta(days=14)).date(),
        )

    return ApplicationResponse(
        precheck=_stored_precheck(application),
        application_id=str(application.id),
        number=application.number,
        status=application.status,
        outcome=OUTCOME_BY_STATUS.get(application.status, "review"),
        submitted=application.status != "DRAFT",
        goal=(application.data or {}).get("goal"),
        amount=(application.data or {}).get("amount"),
        term=(application.data or {}).get("term"),
        next_action=NEXT_ACTION.get(application.status),
        decision_text=application.decision_text,
        decision_amount=int(amount) if isinstance(amount, (int, float)) else None,
        decision_term=int(term) if isinstance(term, (int, float)) and term > 0 else None,
        decision_rate=float(rate) if isinstance(rate, (int, float)) else None,
        decision_monthly=int(monthly) if isinstance(monthly, (int, float)) else None,
        decision_full_cost=(
            int(full_cost) if isinstance(full_cost, (int, float)) else None
        ),
        decision_weather=weather,
        reasons=reasons,
        info_request=info_request,
        route_available=bool(application.route)
        or application.status in {"REJECTED", "COUNTER_OFFER", "DECLINED_BY_CLIENT"},
        assistant_available=True,
        activity=activity or [],
    )


def _stored_precheck(application: Application) -> PrecheckResponse | None:
    """Предоценка, которую клиент уже получил на шаге «Предложение»; только для черновика."""
    stored = application.precheck or {}
    payload = stored.get("ml")
    if application.status != "DRAFT" or not isinstance(payload, dict):
        return None
    data = application.data or {}
    try:
        return precheck_from_ml(
            payload,
            text=str(stored.get("text") or ""),
            valid_until=date.fromisoformat(str(stored["valid_until"])),
            request={
                "product": (payload.get("cost") or {}).get("product") or "WORKING_CAPITAL",
                "amount": data.get("amount") or payload.get("requested_amount"),
                "term_months": data.get("term"),
            },
        )
    except (KeyError, TypeError, ValueError):
        return None


def response(session: Session, application: Application) -> ApplicationResponse:
    return response_for(
        application,
        activity=_activity(session, application.id),
    )

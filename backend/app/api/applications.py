from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Annotated

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Form,
    HTTPException,
    Request,
    UploadFile,
    status,
)
from sqlmodel import Session

from app.api.deps import SessionDep, get_user_company, require_roles
from app.api.errors import ml_error
from app.config import settings
from app.db.models import Company, User
from app.schemas.applications import (
    AcceptOfferRequest,
    ApplicationData,
    ApplicationResponse,
    ApplicationRoute,
    AssistantAnswer,
    AssistantRequest,
    PrecheckResponse,
    RouteRecalculateRequest,
)
from app.services import applications as service
from app.services import ml
from app.services.applicants import build_applicant, specialist_for_route
from app.services.credit import precheck_from_ml, route_from_ml
from app.services.personas import get_persona_by_key
from app.services.pipeline import disburse_application, process_application
from app.services.request_id import request_id

router = APIRouter(prefix="/applications", tags=["applications"])

ClientUser = Annotated[User, Depends(require_roles("CLIENT"))]


def _company(session: Session, user: User) -> Company:
    company = get_user_company(session, user)
    if not company:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Компания не найдена",
        )
    return company


@router.get("", response_model=list[ApplicationResponse])
def list_applications(
    session: SessionDep,
    user: ClientUser,
) -> list[ApplicationResponse]:
    company = _company(session, user)
    return [
        service.response(session, application)
        for application in service.list_applications(session, company.id)
    ]


@router.post("", response_model=ApplicationResponse, status_code=status.HTTP_201_CREATED)
def create_application(
    data: ApplicationData,
    session: SessionDep,
    user: ClientUser,
) -> ApplicationResponse:
    company = _company(session, user)
    application = service.create_application(session, company.id, data)
    return service.response(session, application)


@router.post("/{application_id}/precheck", response_model=PrecheckResponse)
def precheck_application(
    application_id: uuid.UUID,
    request: Request,
    session: SessionDep,
    user: ClientUser,
) -> PrecheckResponse:
    company = _company(session, user)
    application = service.get_application(session, company.id, application_id)
    persona = get_persona_by_key(company.persona_key)
    if persona is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Нет демо-данных компании",
        )

    applicant = build_applicant(application, persona, stage="PRECHECK")
    try:
        payload = ml.precheck(applicant, request_id=request_id(request))
        explanation = ml.explain(
            {"precheck": payload},
            use_llm=False,
            request_id=request_id(request),
        )
    except ml.MLError as exc:
        raise ml_error(exc) from exc

    text = str(explanation.get("text") or "")
    valid_until = datetime.now(timezone.utc).date() + timedelta(
        days=int(payload.get("valid_days") or 30)
    )
    try:
        result = precheck_from_ml(
            payload,
            text=text,
            valid_until=valid_until,
            request=applicant["request"],
        )
    except (KeyError, TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Сервис оценки вернул некорректную предоценку",
        ) from exc

    application.precheck = {
        "ml": payload,
        "text": text,
        "valid_until": result.valid_until.isoformat(),
    }
    application.updated_at = datetime.now(timezone.utc)
    session.add(application)
    session.commit()
    return result


@router.post("/{application_id}/assistant", response_model=AssistantAnswer)
def ask_assistant(
    application_id: uuid.UUID,
    data: AssistantRequest,
    request: Request,
    session: SessionDep,
    user: ClientUser,
) -> AssistantAnswer:
    company = _company(session, user)
    application = service.get_application(session, company.id, application_id)

    # Помощник отвечает на любой стадии: до подачи — по предоценке, на проверке и после одобрения — по стадии,
    # при отказе и нехватке — по решению и маршруту. Маршрут передаём только там, где он есть по смыслу.
    with_route = application.status in {"REJECTED", "COUNTER_OFFER", "DECLINED_BY_CLIENT", "INFO_REQUESTED"}
    precheck = (application.precheck or {}).get("ml") if application.status == "DRAFT" else None
    payload = {
        "question": data.question,
        "context": {
            "decision": application.decision,
            "route": application.route if with_route else None,
            "stage": application.status,
            "precheck": precheck,
        },
    }
    try:
        answer = ml.assistant(
            payload,
            use_llm=data.use_llm,
            request_id=request_id(request),
        )
    except ml.MLError as exc:
        raise ml_error(exc) from exc

    return AssistantAnswer(
        answer=str(answer.get("answer") or ""),
        source=answer.get("source") or "TEMPLATE",
        topic=answer.get("topic") or "OFF_TOPIC",
        terms=[str(item) for item in answer.get("terms") or []],
    )


@router.post("/{application_id}/accept", status_code=status.HTTP_204_NO_CONTENT)
def accept_offer(
    application_id: uuid.UUID,
    session: SessionDep,
    user: ClientUser,
    data: AcceptOfferRequest | None = None,
) -> None:
    company = _company(session, user)
    application = service.get_application(session, company.id, application_id)
    service.accept_offer(
        session,
        application,
        amount=data.amount if data else None,
        term=data.term if data else None,
    )


@router.post("/{application_id}/decline", status_code=status.HTTP_204_NO_CONTENT)
def decline_offer(
    application_id: uuid.UUID,
    session: SessionDep,
    user: ClientUser,
) -> None:
    company = _company(session, user)
    application = service.get_application(session, company.id, application_id)
    service.decline_offer(session, application)


@router.post("/{application_id}/sign", status_code=status.HTTP_204_NO_CONTENT)
def sign_offer(
    application_id: uuid.UUID,
    background: BackgroundTasks,
    session: SessionDep,
    user: ClientUser,
) -> None:
    company = _company(session, user)
    application = service.get_application(session, company.id, application_id)
    application = service.sign_offer(session, application)
    background.add_task(disburse_application, application.id)


@router.post("/{application_id}/withdraw", status_code=status.HTTP_204_NO_CONTENT)
def withdraw_application(
    application_id: uuid.UUID,
    session: SessionDep,
    user: ClientUser,
) -> None:
    company = _company(session, user)
    application = service.get_application(session, company.id, application_id)
    service.withdraw_application(session, application)


@router.post("/{application_id}/submit", response_model=ApplicationResponse)
def submit_application(
    application_id: uuid.UUID,
    data: ApplicationData,
    background: BackgroundTasks,
    request: Request,
    session: SessionDep,
    user: ClientUser,
) -> ApplicationResponse:
    company = _company(session, user)
    application = service.get_application(session, company.id, application_id)
    application = service.submit_application(session, application, data)
    background.add_task(
        process_application,
        application.id,
        request_id(request),
    )
    return service.response(session, application)


@router.post("/{application_id}/documents", response_model=ApplicationResponse)
async def upload_document(
    application_id: uuid.UUID,
    background: BackgroundTasks,
    request: Request,
    session: SessionDep,
    user: ClientUser,
    file: UploadFile = File(...),
    doc_id: str = Form(""),
) -> ApplicationResponse:
    company = _company(session, user)
    application = service.get_application(session, company.id, application_id)

    filename = file.filename or "document"
    suffix = Path(filename).suffix
    stored_name = f"{application.id}_{uuid.uuid4().hex}{suffix}"
    storage = Path(settings.STORAGE_PATH)
    storage.mkdir(parents=True, exist_ok=True)
    (storage / stored_name).write_bytes(await file.read())

    statement = doc_id in {
        "statement",
        "bank_statement",
        "statement_other_bank",
    } or "выписк" in filename.lower()
    application, reprocess = service.add_document(
        session,
        application,
        filename=filename,
        doc_id=doc_id,
        statement=statement,
    )
    if reprocess:
        background.add_task(
            process_application,
            application.id,
            request_id(request),
            resume=True,
        )
    return service.response(session, application)


def _route_data(
    application,
    company: Company,
    done_steps: list[str],
    request: Request,
) -> tuple[dict, str]:
    persona = get_persona_by_key(company.persona_key)
    if persona is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Нет демо-данных компании",
        )
    applicant = build_applicant(application, persona, stage="DECISION")
    try:
        payload = ml.route(
            {
                "applicant": applicant,
                "assume_done": done_steps,
                "specialist_decision": specialist_for_route(application),
            },
            request_id=request_id(request),
        )
        explanation = ml.explain(
            {"route": payload},
            use_llm=False,
            request_id=request_id(request),
        )
    except ml.MLError as exc:
        raise ml_error(exc) from exc
    return payload, str(explanation.get("text") or "")


@router.post("/{application_id}/route", response_model=ApplicationRoute)
def get_route(
    application_id: uuid.UUID,
    request: Request,
    session: SessionDep,
    user: ClientUser,
) -> ApplicationRoute:
    company = _company(session, user)
    application = service.get_application(session, company.id, application_id)
    done_steps = service.route_done_steps(application)
    if application.route is None:
        payload, text = _route_data(application, company, done_steps, request)
        application = service.save_route(
            session,
            application,
            payload,
            text=text,
            done_steps=done_steps,
        )
    return route_from_ml(
        application.route,
        text=application.route_text or "",
        done_steps=service.route_done_steps(application),
    )


@router.post("/{application_id}/route/recalculate", response_model=ApplicationRoute)
def recalculate_route(
    application_id: uuid.UUID,
    data: RouteRecalculateRequest,
    request: Request,
    session: SessionDep,
    user: ClientUser,
) -> ApplicationRoute:
    company = _company(session, user)
    application = service.get_application(session, company.id, application_id)
    payload, text = _route_data(application, company, data.done_steps, request)
    application = service.save_route(
        session,
        application,
        payload,
        text=text,
        done_steps=data.done_steps,
    )
    return route_from_ml(
        application.route,
        text=application.route_text or "",
        done_steps=data.done_steps,
    )


@router.get("/{application_id}", response_model=ApplicationResponse)
def get_application(
    application_id: uuid.UUID,
    session: SessionDep,
    user: ClientUser,
) -> ApplicationResponse:
    company = _company(session, user)
    application = service.get_application(session, company.id, application_id)
    return service.response(session, application)


@router.put("/{application_id}", response_model=ApplicationResponse)
def update_application(
    application_id: uuid.UUID,
    data: ApplicationData,
    session: SessionDep,
    user: ClientUser,
) -> ApplicationResponse:
    company = _company(session, user)
    application = service.get_application(session, company.id, application_id)
    application = service.update_application(session, application, data)
    return service.response(session, application)

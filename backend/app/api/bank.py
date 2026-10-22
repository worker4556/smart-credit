from __future__ import annotations

import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlmodel import Session

from app.api.deps import SessionDep, require_roles
from app.api.errors import ml_error
from app.db.models import Application, Company, User
from app.schemas.bank import (
    BankApplication,
    BankDecisionRequest,
    BankQueueItem,
)
from app.services import bank as service
from app.services import ml
from app.services.request_id import request_id

router = APIRouter(prefix="/bank", tags=["bank"])

SpecialistUser = Annotated[User, Depends(require_roles("SPECIALIST"))]


def _application(session: Session, application_id: uuid.UUID) -> Application:
    application = session.get(Application, application_id)
    if application is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Заявка не найдена",
        )
    return application


@router.get("/queue", response_model=list[BankQueueItem])
def queue(session: SessionDep, user: SpecialistUser) -> list[BankQueueItem]:
    return service.queue(session)


@router.get("/reasons")
def reasons(request: Request, user: SpecialistUser) -> dict[str, Any]:
    try:
        return ml.reasons(request_id=request_id(request))
    except ml.MLError as exc:
        raise ml_error(exc) from exc


@router.get("/applications/{application_id}", response_model=BankApplication)
def bank_application(
    application_id: uuid.UUID,
    request: Request,
    session: SessionDep,
    user: SpecialistUser,
) -> BankApplication:
    application = _application(session, application_id)
    company = session.get(Company, application.company_id)
    if company is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Компания не найдена",
        )
    try:
        return service.bank_application(
            session,
            application,
            company,
            request_id=request_id(request),
        )
    except ml.MLError as exc:
        raise ml_error(exc) from exc


@router.post(
    "/applications/{application_id}/decision",
    status_code=status.HTTP_204_NO_CONTENT,
)
def decide(
    application_id: uuid.UUID,
    data: BankDecisionRequest,
    request: Request,
    session: SessionDep,
    user: SpecialistUser,
) -> None:
    application = _application(session, application_id)
    try:
        service.specialist_decision(
            session,
            application,
            data,
            request_id=request_id(request),
        )
    except ml.MLError as exc:
        raise ml_error(exc) from exc

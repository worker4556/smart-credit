from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Request, status
from sqlmodel import Session, delete, select

from app.api.deps import SessionDep, require_roles
from app.db.models import Application, ApplicationEvent, Company, User
from app.schemas.admin import AdminApplication, AdminLLM, AdminSystem
from app.schemas.applications import OUTCOME_BY_STATUS
from app.services import ml
from app.services.request_id import request_id

router = APIRouter(prefix="/admin", tags=["admin"])

AdminUser = Annotated[User, Depends(require_roles("ADMIN"))]


@router.get("/applications", response_model=list[AdminApplication])
def applications(
    session: SessionDep,
    user: AdminUser,
) -> list[AdminApplication]:
    rows = session.exec(
        select(Application).order_by(Application.created_at.desc())
    ).all()
    companies = {
        company.id: company
        for company in session.exec(select(Company)).all()
    }
    events = session.exec(
        select(ApplicationEvent).order_by(ApplicationEvent.at)
    ).all()
    actors: dict = {}
    for event in events:
        actors[event.application_id] = event.actor

    result: list[AdminApplication] = []
    for application in rows:
        company = companies.get(application.company_id)
        decision = application.decision or {}
        result.append(
            AdminApplication(
                application_id=str(application.id),
                number=application.number,
                company_name=company.name if company else "",
                amount=int(
                    application.data.get("amount")
                    or decision.get("requested_amount")
                    or 0
                ),
                status=application.status,
                outcome=OUTCOME_BY_STATUS.get(application.status, "review"),
                decided_by=actors.get(application.id),
            )
        )
    return result


@router.post("/demo/reset", status_code=status.HTTP_204_NO_CONTENT)
def reset_demo(session: SessionDep, user: AdminUser) -> None:
    session.exec(delete(ApplicationEvent))
    session.exec(delete(Application))
    session.commit()


@router.get("/system", response_model=AdminSystem)
def system(request: Request, user: AdminUser) -> AdminSystem:
    try:
        health = ml.health(request_id=request_id(request))
    except ml.MLError:
        return AdminSystem(ml="down")

    llm = health.get("llm") if isinstance(health.get("llm"), dict) else {}
    return AdminSystem(
        ml="ok",
        llm=AdminLLM(
            enabled=bool(llm.get("enabled")),
            ready=bool(llm.get("ready")),
            model=llm.get("model"),
        ),
        policy_version=health.get("policy_version"),
    )

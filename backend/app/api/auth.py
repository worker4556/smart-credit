"""POST /auth/login, GET /me."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlmodel import select

from app.api.deps import CurrentUser, SessionDep, get_user_company
from app.db.models import Company, User
from app.db.seed import DemoAccount, get_demo_account
from app.schemas.common import CamelModel
from app.services.auth import create_access_token, verify_password
from app.services.personas import get_persona_by_key

router = APIRouter(tags=["auth"])


class LoginRequest(BaseModel):
    login: str
    password: str


class CompanyOut(CamelModel):
    inn: str
    name: str
    legal_form: str | None = None
    okved: str | None = None
    activity: str | None = None
    region: str | None = None
    registration_year: int | None = None
    average_monthly_turnover: int | None = None
    # Поступления по счёту за последние 6 месяцев, от старых к новым — для статистики на главной
    turnover_monthly: list[int] = []


class UserOut(CamelModel):
    id: str
    login: str
    role: str
    name: str
    company: CompanyOut | None = None


class LoginResponse(CamelModel):
    access_token: str
    user: UserOut


@router.post("/auth/login", response_model=LoginResponse)
def login(body: LoginRequest, session: SessionDep) -> LoginResponse:
    user = session.exec(select(User).where(User.login == body.login)).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный логин или пароль",
        )

    token = create_access_token(str(user.id), user.login, user.role.upper())
    return LoginResponse(
        access_token=token,
        user=_user_out(session, user),
    )


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser, session: SessionDep) -> UserOut:
    return _user_out(session, user)


@router.get("/companies/{inn}", response_model=CompanyOut)
def get_company(inn: str, user: CurrentUser, session: SessionDep) -> CompanyOut:
    company = get_user_company(session, user)
    if not company or company.inn != inn:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Компания не найдена среди ваших",
        )
    persona = get_persona_by_key(company.persona_key) or {}
    seed_account = get_demo_account(company.persona_key)
    return _company_out(company, persona, seed_account)


def _user_out(session, user: User) -> UserOut:
    company_out = None
    company = get_user_company(session, user)
    if company:
        persona = get_persona_by_key(company.persona_key) or {}
        seed_account = get_demo_account(company.persona_key)
        company_out = _company_out(company, persona, seed_account)
    return UserOut(
        id=str(user.id),
        login=user.login,
        role=user.role.upper(),
        name=user.name,
        company=company_out,
    )


def _company_out(
    company: Company,
    persona: dict,
    seed_account: DemoAccount | None,
) -> CompanyOut:
    c = (persona.get("decision") or {}).get("company") or {}
    account = (persona.get("decision") or {}).get("account") or {}
    turnover = account.get("turnover_monthly") or []
    recent_turnover = turnover[-6:]
    average_turnover = (
        round(sum(recent_turnover) / len(recent_turnover))
        if recent_turnover
        else None
    )
    return CompanyOut(
        inn=company.inn,
        name=company.name,
        legal_form=c.get("legal_form"),
        okved=c.get("okved"),
        activity=seed_account.activity if seed_account else None,
        region=seed_account.region if seed_account else None,
        registration_year=(
            seed_account.registration_year if seed_account else None
        ),
        average_monthly_turnover=average_turnover,
        turnover_monthly=[int(v) for v in recent_turnover],
    )

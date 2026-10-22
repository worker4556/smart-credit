"""POST /auth/login, GET /me."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel
from sqlmodel import select

from app.api.deps import CurrentUser, SessionDep, get_user_company
from app.db.models import User
from app.services.auth import create_access_token, verify_password
from app.services.personas import get_persona_by_key

router = APIRouter(tags=["auth"])


class CamelModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
    )


class LoginRequest(BaseModel):
    login: str
    password: str


class CompanyOut(CamelModel):
    inn: str
    name: str
    legal_form: str | None = None
    okved: str | None = None
    persona_key: str


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


def _user_out(session, user: User) -> UserOut:
    company_out = None
    company = get_user_company(session, user)
    if company:
        persona = get_persona_by_key(company.persona_key) or {}
        c = (persona.get("decision") or {}).get("company") or {}
        company_out = CompanyOut(
            inn=company.inn,
            name=company.name,
            legal_form=c.get("legal_form"),
            okved=c.get("okved"),
            persona_key=company.persona_key,
        )
    return UserOut(
        id=str(user.id),
        login=user.login,
        role=user.role.upper(),
        name=user.name,
        company=company_out,
    )


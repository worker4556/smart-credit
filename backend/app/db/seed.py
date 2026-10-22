from __future__ import annotations

from dataclasses import dataclass

from sqlmodel import Session, select

from app.db.models import Company, User
from app.services.auth import hash_password
from app.services.personas import load_personas_by_key


@dataclass(frozen=True)
class DemoAccount:
    login: str
    role: str
    name: str
    persona_key: str | None = None
    company_name: str | None = None
    region: str | None = None
    registration_year: int | None = None
    activity: str | None = None


ACCOUNTS = [
    DemoAccount(
        login="p1",
        role="CLIENT",
        name="Ольга",
        persona_key="P1",
        company_name="ИП Ольга · кофейня",
        region="Самарская область",
        registration_year=2023,
        activity="Кофейня, ОКВЭД 56.10",
    ),
    DemoAccount(
        login="p2",
        role="CLIENT",
        name="ООО «Полка»",
        persona_key="P2",
        company_name="ООО «Полка»",
        region="Москва",
        registration_year=2024,
        activity="Селлер на маркетплейсах, ОКВЭД 47.91",
    ),
    DemoAccount(
        login="p3",
        role="CLIENT",
        name="Тимур",
        persona_key="P3",
        company_name="ИП Тимур · автосервис",
        region="Республика Башкортостан",
        registration_year=2025,
        activity="Автосервис, ОКВЭД 45.20",
    ),
    DemoAccount(
        login="p4",
        role="CLIENT",
        name="Марина",
        persona_key="P4",
        company_name="ИП Марина · студия маникюра",
        region="Новосибирская область",
        registration_year=2026,
        activity="Студия маникюра, ОКВЭД 96.02",
    ),
    DemoAccount(
        login="p5",
        role="CLIENT",
        name="Андрей",
        persona_key="P5",
        company_name="ИП Андрей · стройматериалы",
        region="Свердловская область",
        registration_year=2025,
        activity="Магазин стройматериалов, ОКВЭД 47.52",
    ),
    DemoAccount(
        login="zsk",
        role="CLIENT",
        name="ООО «Северный Контур»",
        persona_key="ZSK",
        company_name="ООО «Северный Контур»",
        region="Москва",
        registration_year=2023,
        activity="Оптовая торговля, ОКВЭД 46.90",
    ),
    DemoAccount(login="specialist", role="SPECIALIST", name="Андеррайтер"),
    DemoAccount(login="admin", role="ADMIN", name="Администратор"),
]

ACCOUNTS_BY_PERSONA = {
    account.persona_key: account
    for account in ACCOUNTS
    if account.persona_key is not None
}

DEMO_PASSWORD = "demo"


def get_demo_account(persona_key: str | None) -> DemoAccount | None:
    if not persona_key:
        return None
    return ACCOUNTS_BY_PERSONA.get(persona_key)


def seed_users(session: Session) -> None:
    personas = load_personas_by_key()
    existing_users = {user.login: user for user in session.exec(select(User)).all()}

    for account in ACCOUNTS:
        user = existing_users.get(account.login)
        if user is None:
            user = User(
                login=account.login,
                password_hash=hash_password(DEMO_PASSWORD),
                role=account.role,
                name=account.name,
            )
            session.add(user)
            session.flush()
            existing_users[account.login] = user
        else:
            user.role = account.role
            user.name = account.name
            session.add(user)

        if not account.persona_key or account.persona_key not in personas:
            continue

        persona = personas[account.persona_key]
        inn = str(persona["inn"])
        company = session.exec(
            select(Company).where(Company.user_id == user.id)
        ).first()
        if company is None:
            company = session.exec(select(Company).where(Company.inn == inn)).first()
        if company is None:
            company = Company(
                inn=inn,
                name=account.company_name or persona.get("name") or account.name,
                persona_key=account.persona_key,
                user_id=user.id,
            )
        else:
            company.user_id = user.id
            company.inn = inn
            company.name = (
                account.company_name or persona.get("name") or account.name
            )
            company.persona_key = account.persona_key
        session.add(company)

    session.commit()

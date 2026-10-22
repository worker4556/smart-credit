from __future__ import annotations

from sqlmodel import Session, select

from app.db.models import Company, User
from app.services.auth import hash_password
from app.services.personas import load_personas_by_key

# login → (role, name, persona_key | None); roles are part of the API contract.
ACCOUNTS = [
    ("p1", "CLIENT", "Ольга (кофейня)", "P1"),
    ("p2", "CLIENT", "ООО «Полка»", "P2"),
    ("p3", "CLIENT", "Тимур (автосервис)", "P3"),
    ("p4", "CLIENT", "Марина (маникюр)", "P4"),
    ("p5", "CLIENT", "Андрей (стройматериалы)", "P5"),
    ("zsk", "CLIENT", "ООО ЗСК (красный)", "ZSK"),
    ("specialist", "SPECIALIST", "Андеррайтер", None),
    ("admin", "ADMIN", "Администратор", None),
]

DEMO_PASSWORD = "demo"


def seed_users(session: Session) -> None:
    personas = load_personas_by_key()
    users = {user.login: user for user in session.exec(select(User)).all()}

    for login, role, name, persona_key in ACCOUNTS:
        user = users.get(login)
        if user is None:
            user = User(
                login=login,
                password_hash=hash_password(DEMO_PASSWORD),
                role=role,
                name=name,
            )
            session.add(user)
            session.flush()
            users[login] = user
        else:
            # Reconcile existing rows too: database volumes may contain old lowercase roles.
            user.role = role
            user.name = name
            session.add(user)

        if not persona_key or persona_key not in personas:
            continue

        persona = personas[persona_key]
        inn = str(persona["inn"])
        company = session.exec(select(Company).where(Company.user_id == user.id)).first()
        if company is None:
            company = session.exec(select(Company).where(Company.inn == inn)).first()
        if company is None:
            company = Company(
                inn=inn,
                name=persona.get("name") or name,
                persona_key=persona_key,
                user_id=user.id,
            )
        elif company.user_id == user.id:
            company.inn = inn
            company.name = persona.get("name") or name
            company.persona_key = persona_key
        session.add(company)

    session.commit()

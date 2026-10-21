from __future__ import annotations

from sqlmodel import Session, select

from app.db.models import Company, User
from app.services.auth import hash_password
from app.services.personas import load_personas_by_key

# login → (role, name, persona_key | None)
ACCOUNTS = [
    ("p1", "client", "Ольга (кофейня)", "P1"),
    ("p2", "client", "ООО «Полка»", "P2"),
    ("p3", "client", "Тимур (автосервис)", "P3"),
    ("p4", "client", "Марина (маникюр)", "P4"),
    ("p5", "client", "Андрей (стройматериалы)", "P5"),
    ("zsk", "client", "ООО ЗСК (красный)", "ZSK"),
    ("specialist", "specialist", "Андеррайтер", None),
    ("admin", "admin", "Администратор", None),
]

DEMO_PASSWORD = "demo"


def seed_users(session: Session) -> None:
    personas = load_personas_by_key()
    existing = {u.login for u in session.exec(select(User)).all()}

    for login, role, name, persona_key in ACCOUNTS:
        if login in existing:
            continue

        user = User(
            login=login,
            password_hash=hash_password(DEMO_PASSWORD),
            role=role,
            name=name,
        )
        session.add(user)
        session.flush()  # получить user.id

        if persona_key and persona_key in personas:
            persona = personas[persona_key]
            company = Company(
                inn=str(persona["inn"]),
                name=persona.get("name") or name,
                persona_key=persona_key,
                user_id=user.id,
            )
            session.add(company)

    session.commit()

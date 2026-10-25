"""Resume заявок после рестарта backend: TEST_DATABASE_URL (в CI — сервис postgres). Без него тесты пропускаются."""
from __future__ import annotations

import os
import uuid

import pytest
from sqlalchemy import create_engine, text
from sqlmodel import Session, select

from app.db.models import Application, Company
from app.services import pipeline

URL = os.getenv("TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not URL, reason="нужен TEST_DATABASE_URL с пустой базой PostgreSQL")

DATA = {
    "goal": "Закупить товар или материалы",
    "amount": 850_000,
    "term": 24,
    "monthly_revenue": 950_000,
    "has_loans": "Да",
    "loan_payment": 20_000,
    "had_overdue_2y": False,
    "collateral": "",
    "consent1": True,
    "consent2": True,
    "docs": {},
}

DECISION = {
    "outcome": "APPROVED",
    "amount": 850_000,
    "term_months": 24,
    "cost": {"rate": 20.0, "monthly_payment": 43_315, "full_cost": 189_560},
    "reasons": [],
    "specialist": {"required": False, "triggers": []},
}


@pytest.fixture
def engine():
    from app.db import models  # noqa: F401
    from app.db.migrate import upgrade_db
    from app.db.seed import seed_users

    engine = create_engine(URL)
    with engine.begin() as connection:
        connection.execute(text("DROP SCHEMA public CASCADE; CREATE SCHEMA public"))
    assert upgrade_db(engine) == "upgraded"
    with Session(engine) as session:
        seed_users(session)
    yield engine
    engine.dispose()


def _company_id(engine) -> uuid.UUID:
    with Session(engine) as session:
        company = session.exec(select(Company).where(Company.persona_key == "P1")).one()
        return company.id


def _add_application(
    engine,
    company_id: uuid.UUID,
    status: str,
    *,
    decision: dict | None = None,
) -> uuid.UUID:
    with Session(engine) as session:
        application = Application(
            number=f"A-{uuid.uuid4().hex[:12]}",
            company_id=company_id,
            status=status,
            data=DATA,
            decision=decision,
        )
        session.add(application)
        session.commit()
        session.refresh(application)
        return application.id


def test_resume_pending_selects_only_unfinished_review(engine, monkeypatch):
    company_id = _company_id(engine)
    submitted = _add_application(engine, company_id, "SUBMITTED")
    in_review = _add_application(engine, company_id, "IN_REVIEW")
    in_review_after_info = _add_application(engine, company_id, "IN_REVIEW", decision=DECISION)
    _add_application(engine, company_id, "SIGNED", decision=DECISION)
    _add_application(engine, company_id, "APPROVED", decision=DECISION)
    _add_application(engine, company_id, "DRAFT")

    calls: list[tuple[uuid.UUID, str | None, bool]] = []
    monkeypatch.setattr(pipeline, "engine", engine)
    monkeypatch.setattr(
        pipeline,
        "process_application",
        lambda application_id, request_id=None, resume=False: calls.append(
            (application_id, request_id, resume)
        ),
    )

    pipeline.resume_pending()

    assert {call[0] for call in calls} == {submitted, in_review, in_review_after_info}
    assert all(call[1] == f"resume-{call[0]}" for call in calls)
    assert all(call[2] is True for call in calls)


def test_resume_in_review_completes_application(engine, monkeypatch):
    company_id = _company_id(engine)
    application_id = _add_application(
        engine,
        company_id,
        "IN_REVIEW",
        decision={"outcome": "INFO_REQUESTED"},
    )

    monkeypatch.setattr(pipeline, "engine", engine)
    monkeypatch.setattr(pipeline.time, "sleep", lambda _: None)
    monkeypatch.setattr(
        pipeline.ml,
        "decision",
        lambda applicant, request_id=None: DECISION,
    )
    monkeypatch.setattr(
        pipeline.ml,
        "explain",
        lambda payload, use_llm=False, request_id=None: {"text": "Заявка одобрена"},
    )

    pipeline.process_application(application_id, resume=True)

    with Session(engine) as session:
        application = session.get(Application, application_id)
        assert application is not None
        assert application.status == "APPROVED"
        assert application.decision == DECISION
        assert application.decision_text == "Заявка одобрена"
